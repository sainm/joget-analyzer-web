/**
 * test-dev-transform.mjs — 開発サーバー（Vite dev）の回帰テスト
 *
 * なぜこれが要るか:
 *   統合オブジェクトモデル（lib/objectModel.js）は CommonJS で、
 *   Node 側とブラウザ側の両方から読む。本番ビルド（vite build）では
 *   build.commonjsOptions の設定で CJS が変換されるが、
 *   開発サーバーは別の経路を通るため、**build が通っても dev では
 *   `module is not defined` で画面が落ちる**ことがある。
 *
 *   実際にこの状態を作ってしまった: lib/chapters.cjs を CJS で追加し、
 *   objectModel.js から require した瞬間、dev では `require` が
 *   ブラウザに存在しないため実行時エラーになった。build は通るので
 *   気づかなかった。
 *
 *   この 2 つの経路の差は「設定ファイルの 1 行」で埋まるため、
 *   削除・移動すると静かに再発する。ここで両方を固定する。
 *
 * 使い方: node test-dev-transform.mjs
 *   VITE_DEV_PORT … 開発サーバーのポート（既定 5199）
 *   事前に `npx vite --port 5199` を起動しておくこと
 */
import { chromium } from 'playwright-core';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';

const CANDIDATES = [
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
];
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) { console.error('Chromium が見つかりません'); process.exit(1); }

const PORT = process.env.VITE_DEV_PORT || '5199';
const BASE = `http://127.0.0.1:${PORT}`;

let failed = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  ${extra}`}`);
  if (!cond) failed++;
};

console.log(`── 開発サーバー ${BASE} ──`);

/* ── 1. モジュールが ESM に変換されているか ───────────────────────
 * ブラウザには require も module も存在しない。変換されていなければ
 * 実行時に落ちる。HTML の取得だけでは判らないので、モジュール本体を見る。 */
const libModules = ['/lib/objectModel.js'];
for (const p of libModules) {
  let text = '';
  try {
    const r = await fetch(BASE + p);
    text = await r.text();
  } catch (e) {
    ok(`${p} を取得できる`, false, e.cause?.code || e.message);
    continue;
  }
  ok(`${p} を取得できる`, text.length > 0);

  /* `require(` の検出。
   * esbuild の wrapper は `function __require()` を作るが、呼び出しは
   * `__require()` であって `require(` ではない。lookbehind で除外する。 */
  const bareRequire = (text.match(/(?<![_\w$])require\(/g) || []).length;
  ok(`${p} にブラウザで未定義の require が残っていない`, bareRequire === 0, `${bareRequire} 件`);

  const moduleDecl = (text.match(/(?<![_\w$])module\s*\.\s*exports\s*=/g) || []).length
    + (text.match(/(?<![_\w$])module\s*\.\s*exports\s*;/g) || []).length;
  ok(`${p} に module.exports 代入が残っていない`, moduleDecl === 0, `${moduleDecl} 件`);
}

/* ── 2. ブラウザで実際に動くか ─────────────────────────────────────
 * モジュールが ESM になっていても、import の解決違いで実行時に落ちうる。
 * ページを開いてコンソールエラーとページエラーを見るのが確実。 */
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 });
} catch (e) {
  ok('ページが開ける', false, e.message);
  await browser.close();
  console.log(`\n結果: 不合格`);
  process.exit(1);
}
ok('ページが開ける', true);

/* 画面が真っ白でないこと（モジュール解決に失敗すると React がマウントしない） */
const bodyLen = await page.evaluate(() => document.body.innerText.trim().length);
ok('画面が空でない', bodyLen > 50, `${bodyLen} 文字`);

/* 型チェックの効かない実行時エラーを弾く。
 * "is not defined" / "Unexpected token" 等は CJS 残留の典型症状。
 *
 * 対象外: /api/ へのリクエスト失敗。開発サーバーは /api を :3000 に
 * プロキシするが、このテストはバックエンドを起動しないため
 * 500 / 404 が出る。変換の成否とは無関係なので数えない。 */
const apiNoise = (e) => /Failed to load resource/.test(e);
const runtimeish = errors.filter((e) => !apiNoise(e)).filter((e) =>
  /is not defined|Unexpected token|Cannot use import|Unexpected identifier|Failed to resolve|does not provide an export/i.test(e));
ok('モジュール解決・変換に起因する実行時エラーがない', runtimeish.length === 0,
  runtimeish.slice(0, 3).join(' | '));

const other = errors.filter((e) => !apiNoise(e));
console.log(`  コンソールエラー ${errors.length} 件（/api プロキシ経由 ${errors.length - other.length}・対象外）`);
for (const e of other.slice(0, 5)) console.log('    -', e.slice(0, 160));

await browser.close();
console.log(`\n結果: ${failed ? `不合格 ${failed} 件` : '通過'}`);
process.exit(failed ? 1 : 0);
