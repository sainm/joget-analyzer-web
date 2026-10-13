/**
 * test-mermaid.mjs — 生成した Mermaid ソースが mermaid パーサに受け入れられるかを検証する
 *
 * 同梱のフィクスチャをその場で解析して検証するため、事前の解析結果は不要。
 * 注意：Node 環境には DOM が無いため、mermaid のラベル浄化が DOMPurify エラーを投げる ——
 * これは「パースは通過済み」とみなす。
 *
 * 使い方: node test-mermaid.mjs
 */
import mermaid from 'mermaid';
import { flowChart, erChart, impactChart, callGraphChart, menuChart } from './src/lib/mermaidGraphs.js';
import { mkdirSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const require = createRequire(import.meta.url);
const { analyze } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');

const FIXTURES = path.join(process.cwd(), 'fixtures');
const OUT = path.join(process.cwd(), 'data', 'mermaid-test');

const DATASETS = [
  {
    name: 'RFQ Management',
    jwa: path.join(FIXTURES, 'rfq', 'APP_RFQ-1-20260131145603.jwa'),
    plugin: null,
  },
  {
    name: 'Enhanced JSON API Sample',
    jwa: path.join(FIXTURES, 'enhanced-json-api-main', 'APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa'),
    plugin: path.join(FIXTURES, 'enhanced-json-api-main'),
  },
];

let failed = 0; // 図の単位での失敗
let dsFailed = 0; // データセット（解析）単位での失敗
const skipped = [];

for (const ds of DATASETS) {
  let summary;
  let manifest = null;
  try {
    const outDir = path.join(OUT, ds.name.replace(/\W+/g, '-'));
    mkdirSync(outDir, { recursive: true });
    summary = analyze(ds.jwa, outDir).summary;
    if (ds.plugin) manifest = scanPluginSource(ds.plugin);
  } catch (e) {
    // 想定内のスキップは「フィクスチャの .jwa が無い」場合だけ。
    // 顧客アプリの .jwa はコミットしていないので、クローン直後はこれに当たる。
    // それ以外（解析自体の不具合）をスキップ扱いにすると、壊れていても緑になる。
    const isMissingFixture = e.code === 'ENOENT' && String(e.message).includes(path.basename(ds.jwa));
    if (isMissingFixture) {
      skipped.push(ds.name);
      console.log(`スキップ ${ds.name}（フィクスチャ未同梱: ${path.relative(process.cwd(), ds.jwa)}）`);
      continue;
    }
    dsFailed++;
    console.log(`✗ ${ds.name}（解析に失敗: ${e.message}）`);
    continue;
  }

  const cases = {
    業務フロー図: flowChart(summary.xpdl),
    データモデルER図: erChart(summary),
    読み書き影響図: impactChart(summary),
    メニュー構成図: menuChart(summary),
    プラグイン呼び出し関係図: callGraphChart(manifest),
  };

  console.log(`\n── ${ds.name} ──`);
  for (const [name, code] of Object.entries(cases)) {
    try {
      await mermaid.parse(code);
      console.log(`  ✓ ${name}  ${code.split('\n').length} 行`);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('DOMPurify') || msg.includes('document is not defined')) {
        console.log(`  ✓ ${name}  ${code.split('\n').length} 行（DOM 浄化はブラウザで実行）`);
        continue;
      }
      failed++;
      console.log(`  ✗ ${name}  ${msg.split('\n')[0]}`);
      console.log(code);
    }
  }
}

// 検証した件数を必ず出す。全件スキップ＝何も検証できていないので、それは成功ではない。
const ran = DATASETS.length - skipped.length;
const bad = failed + dsFailed;
console.log('');
if (dsFailed) console.log(`解析に失敗したデータセット: ${dsFailed} 件`);
if (failed) console.log(`問題のある図: ${failed} 枚`);
if (skipped.length) console.log(`スキップ ${skipped.length} 件（フィクスチャ未同梱）: ${skipped.join(' / ')}`);
if (bad) console.log(`結果: 不合格（${ran}/${DATASETS.length} データセットを検証）`);
else if (!ran) console.log('結果: 不合格（検証対象のフィクスチャがありません。fixtures/ を確認してください）');
else console.log(`結果: 通過（${ran}/${DATASETS.length} データセットを検証）`);
process.exit(bad || !ran ? 1 : 0);
