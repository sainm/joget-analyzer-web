const { analyze } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');
const { correlate } = require('./lib/correlate');
const { buildChunks } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');
const fs = require('fs');

const PROJECT = '/Users/sainm/work/demo/joget/enhanced-json-api-main';
const JWA = PROJECT + '/APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa';
const OUT = './data/test3/out';

const r = analyze(JWA, OUT);
console.log('plugin_usages 采集:', (r.summary.plugin_usages || []).length, '处引用');
const groups = {};
for (const u of r.summary.plugin_usages || []) {
  groups[u.className] = groups[u.className] || [];
  groups[u.className].push({ where: u.where, slot: u.slot, keys: u.configKeys.filter((k) => u.config[k] !== '') });
}
for (const [cls, us] of Object.entries(groups)) {
  console.log('\n·', cls.split('.').pop());
  us.forEach((u) => console.log('    ', u.where, '|', u.slot, '| 非空参数:', u.keys.join(', ') || '(无)'));
}

const manifest = scanPluginSource(PROJECT);
const c = correlate(r.summary, manifest);
console.log('\n═══ 联动结果 ═══');
console.log(JSON.stringify(c.stats, null, 2));

console.log('\n── 命中源码的组件 ──');
for (const b of c.bindings.filter((x) => x.inSource)) {
  console.log(`\n${b.simpleName}  [${b.categoryLabel}]  引用${b.occurrences}次  源码:${b.source.file}(${b.source.methodCount}方法)`);
  console.log(`  声明 ${b.declaredCount} 项 / 应用实配 ${b.setCount} 项`);
  console.log(`  实配: ${b.setKeys.map((k) => k + '=' + b.setValues[k]).join(' | ') || '（无）'}`);
  if (b.unknownKeys.length) console.log(`  ⚠ 源码未声明: ${b.unknownKeys.join(', ')}`);
  console.log(`  未配置(走默认): ${b.unsetKeys.length} 项`);
  if (b.calls.length) console.log(`  调用: ${b.calls.map((x) => x.to + '[' + x.kind + ']').join(', ')}`);
}
console.log('\n── 缺源码 ──');
c.unresolved.forEach((u) => console.log(`  [${u.category}] ${u.className} ×${u.occurrences}`));
console.log('\n── 源码中未被引用 ──');
c.unusedInSource.forEach((u) => console.log(`  ${u.className} (${u.sourceKind})`));

const chunks = buildChunks(r.summary, manifest, c);
console.log('\nchunks:', chunks.length, '| 类型:', [...new Set(chunks.map((x) => x.type))].join(','));
const doc = generateDesignDoc(r.summary, 'zh', { correlation: c, manifest });
fs.writeFileSync('./data/test3/doc.md', doc, 'utf8');
console.log('设计书:', doc.split('\n').length, '行');
const i = doc.indexOf('### 2.3');
console.log('\n──────── 设计书 2.3 节预览 ────────');
console.log(doc.slice(i, i + 2600));
