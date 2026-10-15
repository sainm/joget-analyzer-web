import React from 'react';
import { t } from '../i18n.js';

/**
 * 画面の骨格を構成する 2 つの領域。
 *
 *  ・SideNav … ユーザーの作業目標でグループ化した主導航
 *  ・ToolBar … いまどのプロジェクト・どの解析結果を見ているかを固定する
 *
 * 「いま何を見ているか」が曖昧にならないように、プロジェクト名と解析記録の
 * ID は常にここに出し、他の画面へ移動しても表示を維持する。
 */

/** 主導航の定義。グループと項目は宣言のみ、文言は i18n から引く */
export const NAV = [
  {
    group: 'nav.group.project',
    items: [
      { key: 'overview', label: 'nav.overview' },
      { key: 'quality', label: 'nav.quality' },
    ],
  },
  {
    group: 'nav.group.app',
    items: [
      { key: 'objects', label: 'nav.objects' },
      { key: 'menus', label: 'nav.menus', type: 'menu' },
      { key: 'forms', label: 'nav.forms', type: 'form' },
      { key: 'lists', label: 'nav.lists', type: 'datalist' },
      { key: 'process', label: 'nav.process' },
    ],
  },
  {
    group: 'nav.group.data',
    items: [{ key: 'datamodel', label: 'nav.datamodel' }],
  },
  {
    group: 'nav.group.plugin',
    items: [{ key: 'plugins', label: 'nav.plugins' }],
  },
  {
    group: 'nav.group.rel',
    items: [
      { key: 'relations', label: 'nav.relations' },
      { key: 'checks', label: 'nav.checks' },
    ],
  },
  {
    group: 'nav.group.doc',
    items: [{ key: 'doc', label: 'nav.doc' }],
  },
];

export function SideNav({ view, onChange, counts }) {
  return (
    <nav className="flex h-full w-[228px] shrink-0 flex-col border-r border-ink-200 bg-white">
      <div className="border-b border-ink-200 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-[13px] font-bold text-white">J</div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-ink-900">{t('app.title')}</div>
            <div className="text-[10px] text-ink-400">{t('app.subtitle')}</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {t(g.group)}
            </div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = view.key === it.key;
                const n = counts?.[it.key];
                return (
                  <li key={it.key}>
                    <button
                      onClick={() => onChange(it)}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                        active
                          ? 'bg-brand-50 font-semibold text-brand-700'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                      }`}
                    >
                      <span className="flex-1 truncate">{t(it.label)}</span>
                      {typeof n === 'number' && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums ${
                            active ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-500'
                          }`}
                        >
                          {n}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

export function ToolBar({ meta, search, onSearch, onReanalyze, canSearch }) {
  const source = meta?.source === 'local' ? meta?.projectRoot || meta?.inputPath : meta?.jwaName;
  return (
    <header className="shrink-0 border-b border-ink-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{t('sh.project')}</span>
            <span className="truncate text-[13px] font-semibold text-ink-800">{meta?.appName || t('sh.noRun')}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <span className="shrink-0">{t('sh.run')}</span>
            <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono">{meta?.id || '—'}</span>
            {source && <span className="max-w-[420px] truncate" title={source}>{source}</span>}
            {meta?.elapsedMs != null && <span className="shrink-0">{meta.elapsedMs}ms</span>}
          </div>
        </div>

        <div className="ml-auto flex flex-1 items-center justify-end gap-2">
          {canSearch && (
            <div className="relative min-w-0 flex-1 sm:max-w-[340px]">
              <input
                data-testid="global-search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={t('sh.searchHint')}
                className="w-full rounded-md border border-ink-200 bg-ink-50 py-1.5 pl-8 pr-7 text-[12px] text-ink-800 outline-none transition placeholder:text-ink-400 focus:border-brand-300 focus:bg-white"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="7" cy="7" r="4.5" />
                  <path d="M10.5 10.5 14 14" strokeLinecap="round" />
                </svg>
              </span>
              {search && (
                <button
                  onClick={() => onSearch('')}
                  title={t('sh.clearSearch')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <button
            onClick={onReanalyze}
            className="shrink-0 whitespace-nowrap rounded-md border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50"
          >
            {t('sh.reanalyze')}
          </button>
        </div>
      </div>
    </header>
  );
}

/** ページ見出し。すべてのページで同じ階層・同じ書式に揃える */
export function PageHead({ title, lead, right, children }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold leading-tight text-ink-900">{title}</h1>
          {lead && <p className="mt-1 max-w-[900px] text-[12px] leading-relaxed text-ink-500">{lead}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}