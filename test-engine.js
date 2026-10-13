/**
 * test-engine.js — 解析エンジン単体のスモークテスト
 *
 * 使い方: node test-engine.js [対象.jwa] [出力ディレクトリ]
 */
const path = require('path');
const { analyze } = require('./lib/analyze');
const { buildChunks, toJsonl } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');

const FIXTURES = path.join(__dirname, 'fixtures');
const target = process.argv[2] || process.env.JOGET_TEST_JWA || path.join(FIXTURES, 'rfq', 'APP_RFQ-1-20260131145603.jwa');
const out = process.argv[3] || '/tmp/t1out';

const r = analyze(target, out);
console.log('--- stats ---');
console.log(JSON.stringify(r.stats, null, 2));

const doc = generateDesignDoc(r.summary);
console.log('設計書の行数:', doc.split('\n').length, '文字数:', doc.length);

const chunks = buildChunks(r.summary, null);
console.log('RAG chunks:', chunks.length);
console.log('chunk 種別:', [...new Set(chunks.map((c) => c.type))].join(', '));
console.log('JSONL 行数:', toJsonl(chunks).split('\n').filter(Boolean).length);
console.log('relations:', r.summary.relations.length);
console.log('issues:', r.summary.impact.issues.length);
console.log('プラグイン参照:', JSON.stringify({
  標準: Object.keys(r.summary.plugin_refs.builtin).length,
  マーケットプレイス: Object.keys(r.summary.plugin_refs.marketplace).length,
  エンタープライズ: Object.keys(r.summary.plugin_refs.enterprise).length,
  自社開発: Object.keys(r.summary.plugin_refs.custom).length,
}));
