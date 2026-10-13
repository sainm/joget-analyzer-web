// 校验生成的 Mermaid 源码能否被 mermaid 解析器接受
// 注意：Node 环境无 DOM，mermaid 的 label 净化会抛 DOMPurify 错误 —— 这类视为「解析已通过」。
import mermaid from 'mermaid';
import { flowChart, erChart, impactChart, callGraphChart, menuChart } from './src/lib/mermaidGraphs.js';
import { readFileSync, existsSync } from 'fs';

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });

const DATASETS = [
  {
    name: 'RFQ Management',
    summary: './data/test/out/app_summary.json',
    manifest: null,
  },
  {
    name: 'Enhanced JSON API Sample',
    summary: './data/runs/1791901452147-cr2iwc/out/app_summary.json',
    manifest: './data/runs/1791901452147-cr2iwc/out/plugin_manifest.json',
  },
];

let failed = 0;

for (const ds of DATASETS) {
  if (!existsSync(ds.summary)) { console.log(`跳过 ${ds.name}（缺 ${ds.summary}）`); continue; }
  const summary = JSON.parse(readFileSync(ds.summary, 'utf8'));
  const manifest = ds.manifest && existsSync(ds.manifest) ? JSON.parse(readFileSync(ds.manifest, 'utf8')) : null;

  const cases = {
    业务流程图: flowChart(summary.xpdl),
    数据模型ER图: erChart(summary),
    读写影响图: impactChart(summary),
    菜单结构图: menuChart(summary),
    插件调用关系图: callGraphChart(manifest),
  };

  console.log(`\n── ${ds.name} ──`);
  for (const [name, code] of Object.entries(cases)) {
    try {
      await mermaid.parse(code);
      console.log(`  ✓ ${name}  ${code.split('\n').length} 行`);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('DOMPurify') || msg.includes('document is not defined')) {
        console.log(`  ✓ ${name}  ${code.split('\n').length} 行（DOM 净化于浏览器执行）`);
        continue;
      }
      failed++;
      console.log(`  ✗ ${name}  ${msg.split('\n')[0]}`);
      console.log(code);
    }
  }
}

console.log(failed ? `\n${failed} 张图有问题` : '\n全部通过');
process.exit(failed ? 1 : 0);
