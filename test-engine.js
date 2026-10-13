const { analyze } = require('./lib/analyze');
const { buildChunks, toJsonl } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');

const target = process.argv[2] || '/Users/sainm/work/demo/joget/APP_RFQ-1-20260131145603.jwa';
const out = process.argv[3] || '/tmp/t1out';

const r = analyze(target, out);
console.log('--- stats ---');
console.log(JSON.stringify(r.stats, null, 2));

const doc = generateDesignDoc(r.summary, 'zh');
const docJa = generateDesignDoc(r.summary, 'ja');
console.log('设计书 zh 行数:', doc.split('\n').length, '字符:', doc.length);
console.log('設計書 ja 行数:', docJa.split('\n').length, '字符:', docJa.length);

const chunks = buildChunks(r.summary, null);
console.log('RAG chunks:', chunks.length);
console.log('chunk 类型:', [...new Set(chunks.map((c) => c.type))].join(', '));
console.log('JSONL 行数:', toJsonl(chunks).split('\n').filter(Boolean).length);
console.log('relations:', r.summary.relations.length);
console.log('issues:', r.summary.impact.issues.length);
console.log('插件引用:', JSON.stringify({
  内置: Object.keys(r.summary.plugin_refs.builtin).length,
  市场: Object.keys(r.summary.plugin_refs.marketplace).length,
  企业: Object.keys(r.summary.plugin_refs.enterprise).length,
  自研: Object.keys(r.summary.plugin_refs.custom).length,
}));
