import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { OBJ, objTypeLabel } from '../lib/objectModel.js';
import Mermaid from './Mermaid.jsx';
import { PageHead } from './Shell.jsx';
import { TypeTag, StatusTag, EmptyNote, SectionTable } from './Common.jsx';
import { linkTypeLabel } from './ObjectExplorer.jsx';

/**
 * 関連探索。
 *
 * 「どのオブジェクトからどのオブジェクトへ、どういう根拠で繋がるか」を
 * 1 か所で、表示だけをグラフと表で切り替える。
 * ノード数が多くなりすぎないよう、展開段数を明示的に制限する。
 */

const REL_TYPE_COLOR = {
  target: '#3b7bff',
  form: '#12a594',
  table: '#e5484d',
  sql: '#e0930c',
  field: '#8b95a7',
  activity: '#7c3aed',
  datasource: '#0d9488',
};

export default function RelationExplorer({ model, onSelectObject }) {
  const [start, setStart] = useState('');
  const [depth, setDepth] = useState(1);
  const [view, setView] = useState('graph');
  const [q, setQ] = useState('');

  const candidates = useMemo(() => {
    const n = q.trim().toLowerCase();
    const pool = model.objects.filter((o) => [OBJ.FORM, OBJ.MENU, OBJ.TABLE, OBJ.LIST, OBJ.PROCESS, OBJ.PLUGIN, OBJ.SQL].includes(o.type));
    return (n ? pool.filter((o) => o.name.toLowerCase().includes(n) || o.id.toLowerCase().includes(n)) : pool).slice(0, 80);
  }, [model, q]);

  /**
   * 起点から深さ分だけ辿る（同じオブジェクトは 1 回だけ出す）。
   *
   * 逆方向も辿る。テーブルやカラムは「参照される側」なので、
   * 順方向のリンクだけを見ると、最初に選びやすい対象ほど空振りする。
   * 逆リンクは from: プレフィックスで管理しているが、ここでは
   * 「どのオブジェクトから張られたか」を逆算して通常の辺として扱う。
   */
  const walked = useMemo(() => {
    if (!start) return { nodes: [], edges: [] };
    // 逆引きは一度だけ作る（毎走査で全オブジェクトを舂ると重い）
    const incoming = new Map();
    for (const o of model.objects) {
      for (const l of o.links) {
        if (l.type.startsWith('from:')) continue;
        if (!incoming.has(l.key)) incoming.set(l.key, []);
        incoming.get(l.key).push({ from: o, type: l.type, basis: l.basis });
      }
    }
    const seen = new Map();
    const edges = [];
    const hasEdge = (a, b, type) => edges.some((e) => e.from.key === a && e.to.key === b && e.type === type);
    let frontier = [start];
    seen.set(start, model.byKey.get(start));
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const key of frontier) {
        const obj = model.byKey.get(key);
        if (!obj) continue;
        // 順方向：このオブジェクトが指している先
        for (const l of obj.links) {
          if (l.type.startsWith('from:')) continue;
          const to = model.byKey.get(l.key);
          if (!to) continue;
          if (!hasEdge(obj.key, to.key, l.type)) {
            edges.push({ from: obj, to, type: l.type, basis: l.basis });
          }
          if (!seen.has(to.key)) {
            seen.set(to.key, to);
            next.push(to.key);
          }
        }
        // 逆方向：このオブジェクトを指している元
        for (const back of incoming.get(key) || []) {
          if (hasEdge(back.from.key, key, back.type)) continue;
          edges.push({ from: back.from, to: obj, type: back.type, basis: back.basis });
          if (!seen.has(back.from.key)) {
            seen.set(back.from.key, back.from);
            next.push(back.from.key);
          }
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return { nodes: [...seen.values()], edges };
  }, [start, depth, model]);

  return (
    <>
      <PageHead
        title={t('nav.relations')}
        lead="解析結果で根拠が取れる関連だけを、起点から段階的に広げます。関連の種類ごとに理由が表示されるため、グラフだけを見て結論を推測する必要はありません。"
      />

      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3">
        <div className="min-w-[260px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-ink-500">{t('rl.from')}</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ob.searchPlaceholder')}
            className="mb-1.5 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-brand-300"
          />
          <select
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-brand-300"
          >
            <option value="">{t('rl.chooseStart')}</option>
            {candidates.map((o) => (
              <option key={o.key} value={o.key}>
                [{objTypeLabel(o.type)}] {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-500">{t('rl.depth')}</label>
          <div className="flex gap-1">
            {[1, 2, 3].map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={`rounded border px-2.5 py-1.5 text-[12px] ${depth === d ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-ink-200 text-ink-500'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink-500">{t('rl.view')}</label>
          <div className="flex gap-1">
            {[['graph', t('rl.graph')], ['list', t('rl.list')]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                className={`rounded border px-2.5 py-1.5 text-[12px] ${view === k ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-ink-200 text-ink-500'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {start && (
          <div className="ml-auto flex items-center gap-3 text-[11px] text-ink-500">
            <span>ノード <b className="tabular-nums text-ink-800">{walked.nodes.length}</b></span>
            <span>関連 <b className="tabular-nums text-ink-800">{walked.edges.length}</b></span>
          </div>
        )}
      </div>

      {!start && <EmptyNote>{t('rl.chooseStart')}</EmptyNote>}

      {start && walked.nodes.length === 0 && <EmptyNote>{t('rl.empty')}</EmptyNote>}

      {start && walked.nodes.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          {view === 'graph' && (
            <section className="rounded-lg border border-ink-200 bg-white">
              <header className="border-b border-ink-100 px-4 py-2.5">
                <h2 className="text-[13px] font-semibold text-ink-800">{t('rl.graph')}</h2>
                <p className="mt-0.5 text-[11px] text-ink-400">線の色は関連の種類です。下の表に必ず根拠が書かれています。</p>
              </header>
              <div className="max-h-[560px] overflow-auto p-3">
                <Mermaid code={graphOf(walked)} />
              </div>
            </section>
          )}

          <section className="rounded-lg border border-ink-200 bg-white">
            <header className="border-b border-ink-100 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold text-ink-800">{t('rl.list')}</h2>
              <p className="mt-0.5 text-[11px] text-ink-400">ノード {walked.nodes.length} 件</p>
            </header>
            {walked.nodes.length > 1 ? (
              <ul className="max-h-[560px] divide-y divide-ink-100 overflow-y-auto">
                {walked.nodes.map((n) => (
                  <li key={n.key} className="flex items-start gap-2.5 px-4 py-2">
                    <TypeTag type={n.type} />
                    <button onClick={() => onSelectObject(n.key)} className="min-w-0 flex-1 text-left hover:underline">
                      <span className="block truncate text-[13px] font-medium text-ink-800">{n.name}</span>
                      <span className="block truncate font-mono text-[10px] text-ink-400">{n.id}</span>
                    </button>
                    <StatusTag status={n.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4"><EmptyNote>{t('rl.empty')}</EmptyNote></div>
            )}
          </section>

          {view === 'list' && walked.edges.length > 0 && (
            <section className="rounded-lg border border-ink-200 bg-white xl:col-span-2">
              <header className="border-b border-ink-100 px-4 py-2.5">
                <h2 className="text-[13px] font-semibold text-ink-800">関連の一覧</h2>
              </header>
              <SectionTable
                head={['起点', '終点', '関連の種類', t('ob.basis')]}
                rows={walked.edges.map((e) => [e.from.name, e.to.name, linkTypeLabel(e.type), e.basis])}
              />
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** ノード集合から Mermaid のグラフを組み立てる（孤立点は出さない） */
function graphOf({ nodes, edges }) {
  const lines = ['graph LR'];
  const id = (key) => key.replace(/[^A-Za-z0-9]/g, '_');
  const used = new Set();
  // linkStyle の index は「何本目の辺か」（0 始まり）であり、
  // lines 配列の位置ではない。配列位置をそのまま渡すと index が飛んで
  // mermaid に out of bounds と言われる（エラー枠だけ出て図が描かない）。
  edges.forEach((e, i) => {
    const a = id(e.from.key);
    const b = id(e.to.key);
    used.add(a);
    used.add(b);
    const color = REL_TYPE_COLOR[e.type] || '#8b95a7';
    lines.push(`  ${a}["${escapeMd(e.from.name)}"] -->|${linkTypeLabel(e.type)}| ${b}["${escapeMd(e.to.name)}"]`);
    lines.push(`  linkStyle ${i} stroke:${color},stroke-width:1.4px`);
  });
  // 孤立点は「関連なし」として 1 つだけ示す
  for (const n of nodes) {
    const nid = id(n.key);
    if (!used.has(nid)) {
      lines.push(`  ${nid}["${escapeMd(n.name)}"]:::orphan`);
      lines.push(`  classDef orphan fill:#f6f7f9,stroke:#b3bac7,color:#6b7688,stroke-dasharray: 3 3`);
    }
  }
  return lines.join('\n');
}

function escapeMd(s) {
  return String(s).replace(/"/g, "'").replace(/\[/g, '(').replace(/\]/g, ')').slice(0, 48);
}