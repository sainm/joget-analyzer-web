import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { OBJ, STATUS, STATUS_LABEL, objTypeLabel } from '../lib/objectModel.js';
import { PageHead } from './Shell.jsx';
import { StatusTag, TypeTag, SectionTable, EmptyNote } from './Common.jsx';

/**
 * 統一オブジェクト一覧と詳細。
 *
 * 種別を固定した入口（メニュー構成・フォーム・データリストなど）でも
 * すべてこの 1 コンポーネントを使う。描画の揺れを防ぐため。
 */

const TYPE_ORDER = [OBJ.MENU, OBJ.FORM, OBJ.FIELD, OBJ.LIST, OBJ.PROCESS, OBJ.TABLE, OBJ.COLUMN, OBJ.PLUGIN, OBJ.SQL, OBJ.DATASOURCE];

export default function ObjectExplorer({ model, view, selectedKey, onSelect, initialSearch = '' }) {
  const [q, setQ] = useState(initialSearch);
  const [type, setType] = useState(view?.type || 'all');
  const [status, setStatus] = useState('all');

  // 種別が指定された入口（フォーム・メニュー構成など）では絞り込み UI を隠す
  const locked = !!view?.type;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return model.objects
      .filter((o) => (locked ? o.type === view.type : type === 'all' || o.type === type))
      .filter((o) => (status === 'all' ? true : status === 'partial' ? o.status !== STATUS.PARSED : o.status === status))
      .filter((o) => {
        if (!needle) return true;
        // ID・名称に加え、関連先の識別子でも引けるようにする
        return (
          o.name.toLowerCase().includes(needle) ||
          o.id.toLowerCase().includes(needle) ||
          o.brief.toLowerCase().includes(needle) ||
          o.links.some((l) => model.byKey.get(l.key)?.name.toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));
  }, [model, q, type, status, view, locked]);

  const selected = selectedKey ? model.byKey.get(selectedKey) : null;
  const typeCounts = useMemo(() => {
    const c = {};
    for (const o of model.objects) c[o.type] = (c[o.type] || 0) + 1;
    return c;
  }, [model]);

  return (
    <>
      <PageHead
        title={view?.title || t('nav.objects')}
        lead={view?.lead}
        right={
          <span className="rounded-md border border-ink-200 bg-white px-2.5 py-1 text-[12px] tabular-nums text-ink-600">
            {t('ob.count', { n: rows.length })}
          </span>
        }
      />

      <div className="flex gap-4">
        {/* 一覧 */}
        <div className="flex min-w-0 w-[380px] shrink-0 flex-col">
          {!locked && (
            <div className="mb-2 space-y-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('ob.searchPlaceholder')}
                className="w-full rounded-md border border-ink-200 bg-white px-3 py-1.5 text-[12px] outline-none transition placeholder:text-ink-400 focus:border-brand-300"
              />
              <div className="flex flex-wrap gap-1">
                <FilterChip active={type === 'all'} onClick={() => setType('all')}>
                  {t('ob.filterAll')} <em>{model.objects.length}</em>
                </FilterChip>
                {TYPE_ORDER.filter((x) => typeCounts[x]).map((x) => (
                  <FilterChip key={x} active={type === x} onClick={() => setType(x)}>
                    {objTypeLabel(x)} <em>{typeCounts[x]}</em>
                  </FilterChip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
                  {t('ob.filterStatus')}
                </FilterChip>
                {[STATUS.PARSED, STATUS.PARTIAL, STATUS.UNKNOWN, STATUS.FAILED].map((s) => (
                  <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
                    {STATUS_LABEL[s]}
                  </FilterChip>
                ))}
              </div>
            </div>
          )}

          <div data-testid="object-rows" className="max-h-[calc(100vh-260px)] overflow-y-auto rounded-lg border border-ink-200 bg-white">
            {rows.length === 0 && <div className="px-4 py-10 text-center text-[13px] text-ink-400">{t('sh.noResults')}</div>}
            {rows.map((o) => (
              <button
                key={o.key}
                onClick={() => onSelect(o.key)}
                className={`flex w-full items-start gap-2.5 border-b border-ink-100 px-3 py-2 text-left transition last:border-b-0 ${
                  o.key === selectedKey ? 'bg-brand-50' : 'hover:bg-ink-50'
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  <TypeTag type={o.type} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-800">{o.name}</span>
                  <span className="block truncate text-[11px] text-ink-400">
                    <span className="font-mono">{o.id}</span>
                    {o.brief ? ` · ${o.brief}` : ''}
                  </span>
                </span>
                <span className="mt-0.5 shrink-0">
                  <StatusTag status={o.status} />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 詳細 */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <ObjectDetail model={model} obj={selected} onSelect={onSelect} />
          ) : (
            <div className="rounded-lg border border-dashed border-ink-200 bg-white px-6 py-16 text-center text-[13px] text-ink-400">
              {t('ob.selectHint')}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[11px] transition ${
        active ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * オブジェクト詳細。
 * 種別ごとの専用画面を作らず、共通枠 + sections で構成することで
 * 「同じ情報構成」を保ったまま、種別ごとの差も消さない。
 */
export function ObjectDetail({ model, obj, onSelect }) {
  const [tab, setTab] = useState('summary');
  const checks = model.checks.filter((c) => c.object?.key === obj.key);
  const children = obj.children.map((k) => model.byKey.get(k)).filter(Boolean);

  const tabs = [
    { key: 'summary', label: t('ob.tab.summary'), n: null },
    { key: 'attrs', label: t('ob.tab.attrs'), n: obj.sections.length || null },
    { key: 'relations', label: t('ob.tab.relations'), n: obj.links.length || obj.children.length || null },
    { key: 'evidence', label: t('ob.tab.evidence'), n: obj.evidence.length || null },
    { key: 'checks', label: t('ob.tab.checks'), n: checks.length || null },
    { key: 'doc', label: t('ob.tab.doc'), n: obj.docAnchors.length || null },
  ];

  return (
    <div className="rounded-lg border border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeTag type={obj.type} />
          <StatusTag status={obj.status} />
          <h2 className="min-w-0 text-[15px] font-bold text-ink-900">{obj.name}</h2>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
          <span className="font-mono">{obj.id}</span>
          {obj.brief && <span>{obj.brief}</span>}
        </div>
      </div>

      <div className="flex gap-0.5 overflow-x-auto border-b border-ink-200 px-2">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`shrink-0 border-b-2 px-2.5 py-2 text-[12px] font-medium transition ${
              tab === x.key ? 'border-brand-500 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-800'
            }`}
          >
            {x.label}
            {x.n ? <span className="ml-1 text-[10px] text-ink-400">{x.n}</span> : null}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'summary' && <SummaryTab model={model} obj={obj} checks={checks} />}
        {tab === 'attrs' && <AttrsTab obj={obj} />}
        {tab === 'relations' && <RelationsTab model={model} obj={obj} onSelect={onSelect} />}
        {tab === 'evidence' && <EvidenceTab obj={obj} />}
        {tab === 'checks' && <ChecksTab checks={checks} onSelect={onSelect} />}
        {tab === 'doc' && <DocTab obj={obj} />}
      </div>
    </div>
  );
}

function SummaryTab({ model, obj, checks }) {
  const statusSub = {
    [STATUS.PARSED]: t('st.parsedSub'),
    [STATUS.PARTIAL]: t('st.partialSub'),
    [STATUS.UNKNOWN]: t('st.unknownSub'),
    [STATUS.FAILED]: t('st.failedSub'),
  };
  return (
    <div className="space-y-4">
      <div className={`rounded-md border px-3 py-2 text-[12px] ${toneBorder(obj.status)} ${toneText(obj.status)}`}>
        <b>{STATUS_LABEL[obj.status]}</b> — {statusSub[obj.status]}
      </div>

      <KeyValue items={obj.attrs} />

      {obj.notes?.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          {obj.notes.map((n, i) => (
            <div key={i} className={`text-[12px] ${n.level === 'warn' ? 'text-amber-700' : 'text-ink-500'}`}>
              • {n.text}
            </div>
          ))}
        </div>
      )}

      {obj.children.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">{t('ob.children')}</h3>
          <div className="flex flex-wrap gap-1">
            {obj.children.slice(0, 60).map((k) => {
              const c = model.byKey.get(k);
              return c ? (
                <span key={k} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600">
                  {c.name}
                </span>
              ) : null;
            })}
            {obj.children.length > 60 && <span className="px-1.5 py-0.5 text-[11px] text-ink-400">ほか {obj.children.length - 60} 件</span>}
          </div>
        </div>
      )}

      {checks.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">{t('ck.object')}</h3>
          <ul className="space-y-1">
            {checks.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
                <span className="text-ink-600">{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AttrsTab({ obj }) {
  if (!obj.sections.length) {
    return <EmptyNote>この種別には追加の構成情報はありません。</EmptyNote>;
  }
  return (
    <div className="space-y-4">
      {obj.sections.map((s, i) => (
        <div key={i}>
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">{s.title}</h3>
          {s.kind === 'table' && <SectionTable head={s.head} rows={s.rows} note={s.note} badge={s.badge} />}
          {s.kind === 'kv' && <KeyValue items={s.items} />}
          {s.kind === 'code' && (
            <pre className="max-h-[320px] overflow-auto rounded-md bg-ink-900 p-3 font-mono text-[11px] leading-relaxed text-ink-100">
              {s.text}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

function RelationsTab({ model, obj, onSelect }) {
  const related = obj.links
    .map((l) => ({ link: l, obj: model.byKey.get(l.key) }))
    .filter((x) => x.obj);
  if (!related.length && !obj.children.length) {
    return <EmptyNote>{t('ob.noRelations')}</EmptyNote>;
  }
  return (
    <div className="space-y-4">
      {related.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">
            {t('ob.tab.relations')} <span className="font-normal text-ink-400">{related.length}</span>
          </h3>
          <ul className="divide-y divide-ink-100 rounded-md border border-ink-200">
            {related.map(({ link, obj: o }) => (
              <li key={link.key + link.type} className="flex items-start gap-2 px-3 py-2">
                <TypeTag type={o.type} />
                <button
                  onClick={() => onSelect(o.key)}
                  className="min-w-0 flex-1 text-left hover:underline"
                >
                  <span className="block truncate text-[13px] font-medium text-ink-800">{o.name}</span>
                  <span className="block text-[11px] text-ink-400">
                    <span className="font-mono">{o.id}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-500">
                    {t('ob.basis')}: {link.basis}
                  </span>
                </button>
                <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">{linkTypeLabel(link.type)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {obj.children.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">{t('ob.children')}</h3>
          <div className="flex flex-wrap gap-1">
            {obj.children.map((key2) => {
              const c = model.byKey.get(key2);
              return c ? (
                <button
                  key={key2}
                  onClick={() => onSelect(key2)}
                  className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                >
                  {c.name}
                </button>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ obj }) {
  if (!obj.evidence.length) return <EmptyNote>根拠が登録されていません。</EmptyNote>;
  const KIND = { config: 'アプリ定義', source: 'プラグインソース', derivation: '規約からの導出' };
  return (
    <ul className="space-y-2">
      {obj.evidence.map((e, i) => (
        <li key={i} className="rounded-md border border-ink-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{KIND[e.kind] || e.kind}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-700">{e.ref}</span>
          </div>
          {e.note && <div className="mt-1 text-[11px] leading-relaxed text-ink-500">{e.note}</div>}
        </li>
      ))}
    </ul>
  );
}

function ChecksTab({ checks, onSelect }) {
  if (!checks.length) return <EmptyNote>{t('ob.noChecks')}</EmptyNote>;
  return (
    <ul className="space-y-2">
      {checks.map((c, i) => (
        <li key={i} className="rounded-md border border-ink-200 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
            <span className="font-mono text-[11px] text-ink-500">{c.ruleId}</span>
            <span className="text-[12px] font-medium text-ink-800">{c.rule}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-600">{c.text}</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
            <div><dt className="inline text-ink-400">{t('ck.evidence')}: </dt><dd className="inline text-ink-600">{c.evidence}</dd></div>
            <div><dt className="inline text-ink-400">{t('ck.scope')}: </dt><dd className="inline text-ink-600">{c.scope}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-ink-400">{t('ck.limit')}: </dt><dd className="inline text-ink-500">{c.limit}</dd></div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function DocTab({ obj }) {
  if (!obj.docAnchors.length) return <EmptyNote>{t('dc.empty')}</EmptyNote>;
  return (
    <div>
      <p className="mb-2 text-[12px] text-ink-500">このオブジェクトに対応する設計書の章です。</p>
      <ul className="space-y-1">
        {obj.docAnchors.map((a) => (
          <li key={a} className="rounded border border-ink-200 bg-ink-50 px-2.5 py-1.5 text-[12px] text-ink-700">
            {a}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function KeyValue({ items }) {
  const rows = (items || []).filter((x) => x && x.k);
  if (!rows.length) return <EmptyNote>属性はありません。</EmptyNote>;
  return (
    <dl className="divide-y divide-ink-100 rounded-md border border-ink-200">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-4 px-3 py-1.5 sm:grid-cols-[180px_1fr]">
          <dt className="text-[12px] text-ink-500">{r.k}</dt>
          <dd className={`break-words text-[12px] ${r.v === '—' ? 'text-ink-300' : 'text-ink-800'}`}>{r.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const levelLabel = (lv) => t(`ck.level.${lv}`);
export const levelTone = (lv) =>
  lv === 'error' ? 'bg-rose-50 text-rose-700' : lv === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600';
export const toneBorder = (s) =>
  s === STATUS.PARSED ? 'border-emerald-200 bg-emerald-50' : s === STATUS.PARTIAL ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-ink-50';
export const toneText = (s) =>
  s === STATUS.PARSED ? 'text-emerald-700' : s === STATUS.PARTIAL ? 'text-amber-700' : 'text-ink-600';

export function linkTypeLabel(type) {
  if (type.startsWith('from:')) return linkTypeLabel(type.slice(5));
  return { target: '入口', form: '対象フォーム', table: 'テーブル', sql: 'SQL', field: '項目', activity: 'ノード', datasource: 'データソース' }[type] || type;
}