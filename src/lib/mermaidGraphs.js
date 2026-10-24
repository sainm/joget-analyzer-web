/**
 * 解析結果から Mermaid のソースコードを生成する（フロントエンドのみ、再解析は不要）。
 * すべての生成器で識別子をサニタイズし、Mermaid の構文エラーを防ぐ。
 * 図中の文言は日本語で固定。業務上の名詞はすべてデータ由来。
 */

/** 図中の固定文言（本当にハードコードする語のみ。業務名詞はデータから取得する） */
const L = {
  noFlow: 'プロセス定義（package.xpdl）が見つかりません',
  processPrefix: 'プロセス：',
  start: '開始',
  end: '終了',
  noImpact: '影響データなし',
  noCall: 'プラグインソース未提供のため、呼び出し関係図はありません',
  noMenu: 'メニューなし',
  uncategorized: '未分類',
};

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/"/g, "'")
    .replace(/[[\]{}()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

const sid = (s) => 'n' + String(s == null ? '' : s).replace(/[^\w]/g, '_');

/* ── 1. XPDL フロー図 ───────────────────────────────────────────── */
export function flowChart(xpdl) {
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
    // 注意：サブグラフ内に direction TD を書かないこと。外側の flowchart TD と同方向だと
    // mermaid のパースエラーになる。サブグラフの方向は親から継承されるので省略してよい。
    for (const a of p.activities) {
      const cls = a.isRoute ? 'route' : a.implementation === 'tool' ? 'tool' : 'manual';
      const perf = a.performer ? `<br/><small>${esc(a.performer)}</small>` : '';
      lines.push(`    ${sid(a.id)}["${esc(a.name || a.id)}${perf}"]:::${cls}`);
    }
    // 開始・終了ノードの推定：入辺のない activity を開始点とみなす
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

/* ── 2. データモデル ER 図 ──────────────────────────────────────── */
/* ER 図の属性名では PK / FK / UK が「主キー・外部キー・一意キー」の指定として
 * 予約されている（mermaid の lexer が大小文字を無視してマッチさせる）。
 * フォームの項目ID がこの 3 語と一致するとパースエラーになり、
 * **図そのものが出なくなる**。"fk" は外部キーとしてありふれた名前なので、
 * 実素材（emote-form-element）で実際に発生した。末尾に _ を付けて回避する。
 * （引用符で囲んでも属性名位置では受け取らない。接尾辞が確実。） */
const ER_RESERVED = /^(pk|fk|uk)$/i;
const erAttr = (c) => {
  const safe = String(c).replace(/[^\w]/g, '_');
  return ER_RESERVED.test(safe) ? `${safe}_` : safe;
};
/* 実体名は予約語と衝突しないが、app_fd_ を外した結果が識別子として使えない
 * （空・数字始まり）と構文エラーになる。 */
const erEntity = (t) => {
  const alias = String(t).replace(/^app_fd_/, '').replace(/[^\w]/g, '_');
  return /^[A-Za-z_]/.test(alias) ? alias : `t_${alias}`;
};

export function erChart(summary) {
  // テーブルモデルを優先：フォーム定義から導出するため、.jwa がサンプルデータを
  // エクスポートしているかどうかに依存しない
  const model =
    summary && summary.tableModel && Object.keys(summary.tableModel).length
      ? summary.tableModel
      : (summary && summary.data) || {};
  const tables = Object.keys(model);
  if (!tables.length) return 'erDiagram\n  EMPTY {\n    string note\n  }';

  const lines = ['erDiagram'];
  for (const t of tables) {
    const info = model[t];
    const alias = erEntity(t);
    const cols = info.all_fields || info.fields || [];
    const fields = cols.slice(0, 14);
    lines.push(`  ${alias} {`);
    for (const f of fields) {
      lines.push(`    string ${erAttr(f)}`);
    }
    const hidden = cols.length - fields.length;
    if (hidden > 0) lines.push(`    string and_${hidden}_more_fields`);
    lines.push('  }');
    lines.push('');
  }
  for (const r of summary.relations || []) {
    const a = erEntity(r.from);
    const b = erEntity(r.to);
    if (!a || !b || a === b) continue;
    lines.push(`  ${a} ||--o{ ${b} : "${esc(r.field)}"`);
  }
  return lines.join('\n');
}

/* ── 3. 影響関係図（書き込み / 読み取り） ───────────────────────── */
export function impactChart(summary) {
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

/* ── 4. プラグイン呼び出し関係図 ───────────────────────────────── */
export function callGraphChart(manifest) {
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

/* ── 5. メニュー構成図 ─────────────────────────────────────────── */
export function menuChart(summary) {
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
