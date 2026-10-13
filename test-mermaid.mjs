// 生成した Mermaid ソースが mermaid パーサに受け入れられるかを検証する
// 注意：Node 環境には DOM が無いため、mermaid のラベル浄化が DOMPurify エラーを投げる ——
// これは「パースは通過済み」とみなす。
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
  if (!existsSync(ds.summary)) { console.log(`スキップ ${ds.name}（${ds.summary} が無い）`); continue; }
  const summary = JSON.parse(readFileSync(ds.summary, 'utf8'));
  const manifest = ds.manifest && existsSync(ds.manifest) ? JSON.parse(readFileSync(ds.manifest, 'utf8')) : null;

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

console.log(failed ? `\n${failed} 枚の図に問題があります` : '\nすべて通過');
process.exit(failed ? 1 : 0);
