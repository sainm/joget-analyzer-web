/**
 * 由分析结果生成 Mermaid 图源码（纯前端，无需再跑解析）。
 * 所有生成器都做了标识符清洗，避免 Mermaid 语法报错。
 * 图内文案（节点名、空态提示）跟随界面语言，由 lang 参数控制。
 */

/** 图内固定文案（只放真正写死的那几个词，业务名词一律来自数据） */
const GL = {
  zh: {
    noFlow: '未解析到流程定义（package.xpdl）',
    processPrefix: '流程：',
    start: '开始',
    end: '结束',
    noImpact: '无影响数据',
    noCall: '未上传插件源码，无调用关系图',
    noMenu: '无菜单',
    uncategorized: '未分类',
  },
  ja: {
    noFlow: 'プロセス定義（package.xpdl）が見つかりません',
    processPrefix: 'プロセス：',
    start: '開始',
    end: '終了',
    noImpact: '影響データなし',
    noCall: 'プラグインソース未提供のため、呼び出し関係図はありません',
    noMenu: 'メニューなし',
    uncategorized: '未分類',
  },
};

const gl = (lang) => GL[lang === 'ja' ? 'ja' : 'zh'];

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/"/g, "'")
    .replace(/[[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

const sid = (s) => 'n' + String(s == null ? '' : s).replace(/[^\w]/g, '_');

/* ── 1. XPDL 流程图 ─────────────────────────────────────────────── */
export function flowChart(xpdl, lang) {
  const L = gl(lang);
  if (!xpdl || !xpdl.processes || !xpdl.processes.length) {
    return `flowchart TD\n  empty["${L.noFlow}"]`;
  }
  const lines = ['flowchart TD'];
  lines.push('  classDef manual fill:#f6f7f9,stroke:#8b95a7,color:#2c313b;');
  lines.push('  classDef tool fill:#e6f7f2,stroke:#12a594,color:#2c313b;');
  lines.push('  classDef route fill:#fff3d6,stroke:#e0930c,color:#2c313b;');
  lines.push('  classDef startend fill:#dbe8ff,stroke:#2a63e0,color:#1f4cb4;');

  for (const p of xpdl.processes) {
    const actIds = new Set(p.activities.map((a) => a.id));
    lines.push(`  subgraph ${sid(p.id)}["${L.processPrefix}${esc(p.name || p.id)}"]`);
    // 注意：子图内不要写 direction TD —— 与外层 flowchart TD 同向时会触发 mermaid 解析错误，
    // 子图方向本来就继承父级，省略即可。
    for (const a of p.activities) {
      const cls = a.isRoute ? 'route' : a.implementation === 'tool' ? 'tool' : 'manual';
      const perf = a.performer ? `<br/><small>${esc(a.performer)}</small>` : '';
      lines.push(`    ${sid(a.id)}["${esc(a.name || a.id)}${perf}"]:::${cls}`);
    }
    // 起止节点推断：无入边的 activity 视作起点
    const hasIn = new Set(p.transitions.map((t) => t.to));
    const hasOut = new Set(p.transitions.map((t) => t.from));
    for (const a of p.activities) {
      if (!hasIn.has(a.id)) lines.push(`    ${sid(a.id + '_start')}(["${L.start}"]):::startend --> ${sid(a.id)}`);
    }
    for (const t of p.transitions) {
      if (!actIds.has(t.from) || !actIds.has(t.to)) continue;
      const label = t.condition ? `|${esc(t.condition)}|` : '';
      lines.push(`    ${sid(t.from)} -->${label} ${sid(t.to)}`);
    }
    for (const a of p.activities) {
      if (!hasOut.has(a.id)) lines.push(`    ${sid(a.id)} --> ${sid(a.id + '_end')}(["${L.end}"]):::startend`);
    }
    lines.push('  end');
  }
  return lines.join('\n');
}

/* ── 2. 数据模型 ER 图 ──────────────────────────────────────────── */
export function erChart(summary) {
  // 表模型优先：由表单定义推导，不依赖 .jwa 是否导出了样例数据
  const model =
    summary && summary.tableModel && Object.keys(summary.tableModel).length
      ? summary.tableModel
      : (summary && summary.data) || {};
  const tables = Object.keys(model);
  if (!tables.length) return 'erDiagram\n  EMPTY {\n    string note\n  }';

  const lines = ['erDiagram'];
  for (const t of tables) {
    const info = model[t];
    const alias = t.replace(/^app_fd_/, '');
    const cols = info.all_fields || info.fields || [];
    const fields = cols.slice(0, 14);
    lines.push(`  ${alias} {`);
    for (const f of fields) {
      lines.push(`    string ${String(f).replace(/[^\w]/g, '_')}`);
    }
    const hidden = cols.length - fields.length;
    if (hidden > 0) lines.push(`    string and_${hidden}_more_fields`);
    lines.push('  }');
    lines.push('');
  }
  for (const r of summary.relations || []) {
    const a = String(r.from).replace(/^app_fd_/, '');
    const b = String(r.to).replace(/^app_fd_/, '');
    if (!a || !b || a === b) continue;
    lines.push(`  ${a} ||--o{ ${b} : "${esc(r.field)}"`);
  }
  return lines.join('\n');
}

/* ── 3. 影响关系图（写/读） ─────────────────────────────────────── */
export function impactChart(summary, lang) {
  const L = gl(lang);
  const impact = summary && summary.impact ? summary.impact : {};
  const wm = impact.writeMap || {};
  const rm = impact.readMap || {};
  if (!Object.keys(wm).length && !Object.keys(rm).length) {
    return `flowchart LR\n  empty["${L.noImpact}"]`;
  }
  const lines = ['flowchart LR'];
  lines.push('  classDef tbl fill:#eef4ff,stroke:#2a63e0,color:#1f4cb4,font-weight:600;');
  lines.push('  classDef w fill:#fdecec,stroke:#e5484d,color:#7a2224;');
  lines.push('  classDef r fill:#e6f7f2,stroke:#12a594,color:#0b4f47;');
  const tables = new Set([...Object.keys(wm), ...Object.keys(rm)]);
  for (const t of tables) lines.push(`  ${sid(t)}["${esc(t)}"]:::tbl`);
  let i = 0;
  for (const [t, list] of Object.entries(wm)) {
    for (const w of list) {
      const id = `w${i++}`;
      lines.push(`  ${id}["${esc(w.source)}"]:::w --> ${sid(t)}`);
    }
  }
  i = 0;
  for (const [t, list] of Object.entries(rm)) {
    for (const r of list) {
      const id = `r${i++}`;
      lines.push(`  ${sid(t)} --> ${id}["${esc(r.source)}"]:::r`);
    }
  }
  return lines.join('\n');
}

/* ── 4. 插件调用关系图 ─────────────────────────────────────────── */
export function callGraphChart(manifest, lang) {
  const L = gl(lang);
  const cg = manifest && manifest.callGraph;
  if (!cg || !cg.nodes || !cg.nodes.length) {
    return `flowchart LR\n  empty["${L.noCall}"]`;
  }
  const lines = ['flowchart LR'];
  lines.push('  classDef component fill:#eef4ff,stroke:#2a63e0,color:#1f4cb4;');
  lines.push('  classDef util fill:#e6f7f2,stroke:#12a594,color:#0b4f47;');
  lines.push('  classDef activator fill:#fff3d6,stroke:#e0930c,color:#6b4700;');
  lines.push('  classDef external fill:#f6f7f9,stroke:#b3bac7,color:#6b7688,stroke-dasharray:4 3;');
  const kindCls = { component: 'component', util: 'util', activator: 'activator', external: 'external' };
  const known = new Set(cg.nodes.map((n) => n.id));
  for (const n of cg.nodes) {
    const label = n.label || n.id;
    const shape = n.kind === 'external' ? `["${esc(label)}"]` : `["${esc(label)}"]`;
    lines.push(`  ${sid(n.id)}${shape}:::${kindCls[n.kind] || 'component'}`);
  }
  for (const e of cg.edges || []) {
    if (!known.has(e.from) || !known.has(e.to)) continue;
    const l = e.kind && e.kind !== 'type' ? `|${e.kind}|` : '';
    const arrow = e.kind === 'type' ? '-.->' : '-->';
    lines.push(`  ${sid(e.from)} ${arrow}${l} ${sid(e.to)}`);
  }
  return lines.join('\n');
}

/* ── 5. 菜单结构图 ─────────────────────────────────────────────── */
export function menuChart(summary, lang) {
  const L = gl(lang);
  const uvs = (summary && summary.app && summary.app.userviews) || [];
  if (!uvs.length) return `flowchart LR\n  empty["${L.noMenu}"]`;
  const lines = ['flowchart LR'];
  lines.push('  classDef uv fill:#eef4ff,stroke:#2a63e0,color:#1f4cb4,font-weight:600;');
  lines.push('  classDef cat fill:#f6f7f9,stroke:#8b95a7,color:#2c313b;');
  lines.push('  classDef menu fill:#e6f7f2,stroke:#12a594,color:#0b4f47;');
  for (const uv of uvs) {
    lines.push(`  ${sid(uv.id)}["${esc(uv.name || uv.id)}"]:::uv`);
    for (const c of uv.categories || []) {
      const cid = `${uv.id}_${c.category}`;
      lines.push(`  ${sid(cid)}["${esc(c.category || L.uncategorized)}"]:::cat`);
      lines.push(`  ${sid(uv.id)} --> ${sid(cid)}`);
      for (const m of c.menus || []) {
        const mid = `${cid}_${m.customId || m.label}`;
        lines.push(`  ${sid(mid)}["${esc(m.label)}"]:::menu`);
        lines.push(`  ${sid(cid)} --> ${sid(mid)}`);
      }
    }
  }
  return lines.join('\n');
}
