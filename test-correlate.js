/**
 * test-correlate.js — アプリ設定 ↔ プラグインソース突合の確認スクリプト
 *
 * 使い方: node test-correlate.js
 * 事前に環境変数 JOGET_PROJECT でプロジェクトディレクトリを指定できます。
 */
const { analyze } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');
const { correlate } = require('./lib/correlate');
const { buildChunks } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');
const fs = require('fs');
const path = require('path');

const PROJECT = process.env.JOGET_PROJECT || path.join(__dirname, 'fixtures', 'enhanced-json-api-main');
const JWA = process.env.JOGET_TEST_JWA || path.join(PROJECT, 'APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa');
const OUT = './data/test3/out';

const r = analyze(JWA, OUT);
console.log('plugin_usages 収集:', (r.summary.plugin_usages || []).length, '箇所の参照');
const groups = {};
for (const u of r.summary.plugin_usages || []) {
  groups[u.className] = groups[u.className] || [];
  groups[u.className].push({ where: u.where, slot: u.slot, keys: u.configKeys.filter((k) => u.config[k] !== '') });
}
for (const [cls, us] of Object.entries(groups)) {
  console.log('\n·', cls.split('.').pop());
  us.forEach((u) => console.log('    ', u.where, '|', u.slot, '| 非空パラメータ:', u.keys.join(', ') || '(なし)'));
}

const manifest = scanPluginSource(PROJECT);
const c = correlate(r.summary, manifest);
console.log('\n═══ 突合結果 ═══');
console.log(JSON.stringify(c.stats, null, 2));

console.log('\n── ソースに命中したコンポーネント ──');
for (const b of c.bindings.filter((x) => x.inSource)) {
  console.log(`\n${b.simpleName}  [${b.categoryLabel}]  参照 ${b.occurrences} 回  ソース:${b.source.file}(${b.source.methodCount} メソッド)`);
  console.log(`  宣言 ${b.declaredCount} 項目 / アプリ実設定 ${b.setCount} 項目`);
  console.log(`  実設定: ${b.setKeys.map((k) => k + '=' + b.setValues[k]).join(' | ') || '（なし）'}`);
  if (b.unknownKeys.length) console.log(`  ⚠ ソースに未宣言: ${b.unknownKeys.join(', ')}`);
  console.log(`  未設定（既定値動作）: ${b.unsetKeys.length} 項目`);
  if (b.calls.length) console.log(`  呼び出し: ${b.calls.map((x) => x.to + '[' + x.kind + ']').join(', ')}`);
}
console.log('\n── ソース未提供 ──');
c.unresolved.forEach((u) => console.log(`  [${u.category}] ${u.className} ×${u.occurrences}`));
console.log('\n── ソース内で未参照 ──');
c.unusedInSource.forEach((u) => console.log(`  ${u.className} (${u.sourceKind})`));

const chunks = buildChunks(r.summary, manifest, c);
console.log('\nchunks:', chunks.length, '| 種別:', [...new Set(chunks.map((x) => x.type))].join(','));
const doc = generateDesignDoc(r.summary, { correlation: c, manifest });
fs.mkdirSync('./data/test3', { recursive: true });
fs.writeFileSync('./data/test3/doc.md', doc, 'utf8');
console.log('設計書:', doc.split('\n').length, '行');
const i = doc.indexOf('### 2.3');
console.log('\n──────── 設計書 2.3 節プレビュー ────────');
console.log(doc.slice(i, i + 2600));
