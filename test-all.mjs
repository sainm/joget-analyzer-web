/**
 * test-all.mjs — 解析系テストの一括実行
 *
 * なぜこれが要るか:
 *  各テストは既定で同梱サンプル（Apache-2.0）だけを相手にする。
 *  顧客資産（fixtures/rfq）は .gitignore 済みなので CI には存在せず、
 *  そのため「規模が大きい・SQL が多い・プラグインが多い」場合の回帰が
 *  自動では検出されず、静かに潜伏していた。
 *
 * 方針:
 *   - fixtures/ 以下の解析対象をすべて回す。
 *   - 実行できなかった対象は「スキップ」として必ず標準出力に残す。
 *     門を黙って緑にしてはならない（同じ穴を一度踏み抜いているため）。
 */
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const NODE = process.execPath;

/**
 * 解析対象を列挙する。
 * .jwa はプロジェクト直下にもサブディレクトリにも置かれるため、
 * ここでは再帰して探す。1 ディレクトリが 1 プロジェクトに対応する。
 */
function findProjects(dir, depth = 0) {
  if (depth > 3) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const subdirs = entries
    .filter((e) => e.isDirectory() && e.name !== 'node_modules' && e.name !== 'dist')
    .map((e) => path.join(dir, e.name));
  const here = entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.jwa'));
  const below = subdirs.flatMap((d) => findProjects(d, depth + 1));
  // 自分の直下よりサブディレクトリの方が深い解析対象なら、
  // 自分のほうは「親ディレクトリ」ではなく「別プロジェクト」として扱わない
  // （二重に回すと解析結果が二重計上される）。
  return here && !below.length ? [dir] : below;
}

const FIXTURES = path.join(ROOT, 'fixtures');
const APACHE = path.join(FIXTURES, 'enhanced-json-api-main');
const targets = fs.existsSync(FIXTURES) ? findProjects(FIXTURES) : [];
if (!targets.includes(APACHE)) targets.unshift(APACHE);

const NODE_TESTS = [
  ['test-engine.js', '解析エンジン'],
  ['test-correlate.js', 'プラグイン突合'],
  ['test-mermaid.mjs', '図の生成'],
  ['test-plugin.js', 'プラグインソース走査'],
];

let failed = 0;
const skipped = [];

function run(label, cmd, args, env = {}) {
  process.stdout.write(`\n━━ ${label} ━━\n`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    failed++;
    console.log(`  ⇒ 不合格（${label}）`);
  }
}

/* 単一言語の維持もテストの 1 つとして扱う。
 * 成果物に中国語が混ざると納品先が読めなくなるため、
 * 機能テストと一緒に回さないと門が外れる。 */
const langCheck = path.join(ROOT, 'verify', 'check_japanese_only.py');
if (!fs.existsSync(langCheck)) {
  skipped.push('単一言語チェック（verify/check_japanese_only.py なし）');
} else {
  for (const py of ['python3', 'python']) {
    const probe = spawnSync(py, ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) {
      run('単一言語チェック', py, [langCheck]);
      break;
    }
    if (py === 'python') skipped.push('単一言語チェック（python が見つからない）');
  }
}

/* Node 側の一括テスト（解析対象によらず実行） */
for (const [file, label] of NODE_TESTS) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) {
    skipped.push(`${label}（${file} なし）`);
    continue;
  }
  run(label, NODE, [p]);
}

/* オブジェクトモデルは全解析対象に対して回す。
 * ここで初めて「SQL に app_fd_ が重複して付く」「プラグインの関連が 0 本」
 * のような、実データが静かに壊していた欠陥を検出できる。 */
const omTest = path.join(ROOT, 'test-object-model.mjs');
for (const dir of targets) {
  const rel = path.relative(ROOT, dir);
  if (!fs.existsSync(dir)) {
    skipped.push(`統合オブジェクトモデル（${rel} が無いため）`);
    continue;
  }
  run(`統合オブジェクトモデル — ${rel}`, NODE, [omTest], { JOGET_PROJECT: dir });
}

/* 画面テストも解析対象ごとに回す。
 * 静的モデルが正しくても描画側で壊れている（関連パネルが空になる、
 * Mermaid が空のプレースホルダになる等）ため、両方を見る。
 *
 * 画面テストはブラウザから HTTP を叩くため、事前にサーバーが必要。
 * 起動していない場合はここで起こし、終了時に必ず閉じる
 * （放ったままにすると次回のポート衝突になる。起こしていないものを
 *  畳むと、ユーザーが自分で動かしていたサーバーを巻き添えにする）。 */
const uiTest = path.join(ROOT, 'test-ui.mjs');
if (!fs.existsSync(uiTest)) {
  skipped.push('画面テスト（test-ui.mjs なし）');
} else {
  const httpUp = () => spawnSync(NODE, ['-e',
    "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],
    { stdio: 'ignore' }).status === 0;

  let server = null;
  const wasUp = httpUp();
  if (!wasUp) {
    process.stdout.write('\n━━ サーバー起動（画面テスト用） ━━\n');
    // 非同期 spawn で起動し、あとで kill する（spawnSync だと
    // サーバーが終わるまで戻ってこない）
    server = spawn(NODE, [path.join(ROOT, 'server.js')], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 40 && !httpUp(); i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
    if (!httpUp()) {
      console.log('  ⇒ サーバーが起動できませんでした。画面テストを中止します');
      server.kill('SIGTERM');
      server = null;
    }
  }

  try {
    for (const dir of targets) {
      if (!fs.existsSync(dir)) continue;
      run(`画面テスト — ${path.relative(ROOT, dir)}`, NODE, [uiTest], { JOGET_PROJECT: dir });
    }
  } finally {
    if (server) server.kill('SIGTERM');
  }
}

/* 開発サーバー（Vite dev）の変換テスト。
 *
 * ここが独立している理由:
 *   本番ビルド（vite build）と開発サーバーは CJS の変換経路が別で、
 *   **build が通っても dev では画面が真っ白**になりうる。
 *   実際にそうなった（lib/ 配下の CJS をブラウザから読むようにした際、
 *   vite.config の開発サーバー設定が漏れて module is not defined で全滅）。
 *   build だけ見ていると再発に気づけないため、dev も門に含める。
 *
 * ポートは画面テスト（3000）と別にして衝突を避ける。 */
const devTest = path.join(ROOT, 'test-dev-transform.mjs');
if (!fs.existsSync(devTest)) {
  skipped.push('開発サーバー変換テスト（test-dev-transform.mjs なし）');
} else {
  const DEV_PORT = '5199';
  const devUp = () => spawnSync(NODE, ['-e',
    `fetch('http://127.0.0.1:${DEV_PORT}/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],
    { stdio: 'ignore' }).status === 0;

  let dev = null;
  const devWasUp = devUp();
  if (!devWasUp) {
    process.stdout.write('\n━━ 開発サーバー起動（Vite dev） ━━\n');
    dev = spawn('npx', ['vite', '--port', DEV_PORT, '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 60 && !devUp(); i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
    if (!devUp()) {
      console.log('  ⇒ 開発サーバーが起動できませんでした。変換テストを中止します');
      dev.kill('SIGTERM');
      dev = null;
    }
  }

  try {
    run('開発サーバー変換テスト（CJS → ESM）', NODE, [devTest], { VITE_DEV_PORT: DEV_PORT });
  } finally {
    /* 自分で起こしたものだけ閉じる。ユーザーが手で動かしている
     * dev サーバーを巻き添えにしない。 */
    if (dev) dev.kill('SIGTERM');
  }
}

console.log(`\n━━ 集計 ━━`);
console.log(`  失敗 ${failed} 件`);
if (skipped.length) {
  console.log('  以下の対象は実行できませんでした（門禁が黙って緑にならないよう、必ず表示する）:');
  for (const s of skipped) console.log(`    - ${s}`);
}
process.exit(failed ? 1 : 0);
