const { analyze } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');
const { buildChunks, toJsonl } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');

const jwa = process.argv[2];
const pluginDir = process.argv[3];
const out = process.argv[4] || './data/test/out2';

const r = analyze(jwa, out);
console.log('--- app stats ---');
console.log(JSON.stringify(r.stats, null, 2));

let manifest = null;
if (pluginDir) {
  manifest = scanPluginSource(pluginDir);
  console.log('\n--- plugin manifest ---');
  console.log('pom:', manifest.pom.groupId + ':' + manifest.pom.artifactId + ':' + manifest.pom.version);
  console.log('components:', manifest.components.map((c) => `${c.class.split('.').pop()}(${c.configProperties.length}配置项)`).join(', '));
  console.log('utilities:', manifest.utilities.map((u) => u.class.split('.').pop()).join(', '));
  console.log('activators:', manifest.activators.map((a) => a.class.split('.').pop()).join(', '));
  console.log('messages 语言:', Object.keys(manifest.messages).join(', '));
  const cg = manifest.callGraph;
  console.log('callGraph 节点:', cg.nodes.length, '边:', cg.edges.length,
    '| 内部节点:', cg.nodes.filter((n) => n.kind !== 'external').length,
    '外部:', cg.nodes.filter((n) => n.kind === 'external').length);
  console.log('  边样例:', cg.edges.slice(0, 6).map((e) => `${e.from}-[${e.kind}]->${e.to}`).join('  '));
  console.log('  外部依赖:', cg.nodes.filter((n) => n.kind === 'external').map((n) => n.id).join(', '));
}

const chunks = buildChunks(r.summary, manifest);
console.log('\nRAG chunks:', chunks.length, '（含插件分块:', chunks.filter((c) => c.type.startsWith('plugin_')).length, '）');
console.log('chunk 类型:', [...new Set(chunks.map((c) => c.type))].join(', '));
console.log('JSONL 行数:', toJsonl(chunks).split('\n').filter(Boolean).length);

const doc = generateDesignDoc(r.summary, 'zh');
console.log('设计书行数:', doc.split('\n').length);
