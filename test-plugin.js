/**
 * test-plugin.js — プラグインソースのスキャン結果を確認するスクリプト
 *
 * 使い方: node test-plugin.js <対象.jwa> [プラグインプロジェクト] [出力ディレクトリ]
 */
const path = require('path');
const { analyze } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');
const { buildChunks, toJsonl } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');

const FIXTURES = path.join(__dirname, 'fixtures');
const FIXTURE_PLUGIN = path.join(FIXTURES, 'enhanced-json-api-main');

const jwa = process.argv[2] || process.env.JOGET_TEST_JWA
  || path.join(FIXTURE_PLUGIN, 'APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa');
const pluginDir = process.argv[3] || process.env.JOGET_PROJECT || FIXTURE_PLUGIN;
const out = process.argv[4] || './data/test/out2';

const r = analyze(jwa, out);
console.log('--- app stats ---');
console.log(JSON.stringify(r.stats, null, 2));

let manifest = null;
if (pluginDir) {
  manifest = scanPluginSource(pluginDir);
  console.log('\n--- plugin manifest ---');
  console.log('pom:', manifest.pom.groupId + ':' + manifest.pom.artifactId + ':' + manifest.pom.version);
  console.log('components:', manifest.components.map((c) => `${c.class.split('.').pop()}(${c.configProperties.length} 設定項目)`).join(', '));
  console.log('utilities:', manifest.utilities.map((u) => u.class.split('.').pop()).join(', '));
  console.log('activators:', manifest.activators.map((a) => a.class.split('.').pop()).join(', '));
  console.log('messages のロケール:', Object.keys(manifest.messages).join(', '));
  const cg = manifest.callGraph;
  console.log('callGraph ノード:', cg.nodes.length, 'エッジ:', cg.edges.length,
    '| 内部ノード:', cg.nodes.filter((n) => n.kind !== 'external').length,
    '| 外部:', cg.nodes.filter((n) => n.kind === 'external').length);
  console.log('  エッジ例:', cg.edges.slice(0, 6).map((e) => `${e.from}-[${e.kind}]->${e.to}`).join('  '));
  console.log('  外部依存:', cg.nodes.filter((n) => n.kind === 'external').map((n) => n.id).join(', '));
}

const chunks = buildChunks(r.summary, manifest);
console.log('\nRAG chunks:', chunks.length, '（うちプラグイン分塊:', chunks.filter((c) => c.type.startsWith('plugin_')).length, '）');
console.log('chunk 種別:', [...new Set(chunks.map((c) => c.type))].join(', '));
console.log('JSONL 行数:', toJsonl(chunks).split('\n').filter(Boolean).length);

const doc = generateDesignDoc(r.summary, { manifest });
console.log('設計書の行数:', doc.split('\n').length);
