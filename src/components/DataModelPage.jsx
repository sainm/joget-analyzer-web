import React, { useState } from 'react';
import { t } from '../i18n.js';
import { OBJ } from '../lib/objectModel.js';
import { erChart, impactChart } from '../lib/mermaidGraphs.js';
import Mermaid from './Mermaid.jsx';
import { PageHead } from './Shell.jsx';
import { StatusTag, EmptyNote, SectionTable } from './Common.jsx';
import { KeyValue } from './ObjectExplorer.jsx';

/**
 * データモデル。
 *
 * 情報の由来が3つ混在するため、混ぜずに分けて示す。
 *   A アプリ設定上の論理構造（フォームが何を保持しているか）
 *   B 命名規約から導出したテーブルとカラム（実DBのメタデータではない）
 *   C SQL と影響範囲から確認できるデータアクセス
 *
 * 「導出したもの」を「実在する物理テーブル」に見せないため、
 * 各テーブルには必ず由来を書く。
 */
export default function DataModelPage({ model, summary, manifest, onSelectObject }) {
  const [tab, setTab] = useState('tables');
  const tables = model.objects.filter((o) => o.type === OBJ.TABLE);
  const [tid, setTid] = useState(tables[0]?.key || '');
  const tbl = tables.find((x) => x.key === tid);

  const writeMap = summary?.impact?.writeMap || {};
  const readMap = summary?.impact?.readMap || {};
  const sqlObjs = model.objects.filter((o) => o.type === OBJ.SQL);

  const TABS = [
    { key: 'tables', label: t('dm.tables'), n: tables.length },
    { key: 'er', label: t('dm.er'), n: null },
    { key: 'impact', label: t('dm.writeMap'), n: Object.keys(writeMap).length + Object.keys(readMap).length },
    { key: 'sql', label: t('dm.sql'), n: sqlObjs.length },
    { key: 'datasource', label: 'データソース', n: model.objects.filter((o) => o.type === OBJ.DATASOURCE).length },
  ];

  return (
    <>
      <PageHead
        title={t('nav.datamodel')}
        lead="テーブルとカラムはアプリ設定の命名規約（app_fd_<tableName> / c_<fieldId>）から導出したものです。実データベースのメタデータは参照していないため、構造が確定済みとは表示しません。"
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
              tab === x.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
            }`}
          >
            {x.label}
            {x.n != null && <span className="ml-1.5 text-[10px] opacity-70 tabular-nums">{x.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        <div className="flex gap-4">
          <div className="max-h-[calc(100vh-250px)] w-[340px] shrink-0 overflow-y-auto rounded-lg border border-ink-200 bg-white">
            {tables.length === 0 && <div className="px-4 py-10 text-center text-[12px] text-ink-400">テーブルを導出できませんでした。</div>}
            {tables.map((x) => (
              <button
                key={x.key}
                onClick={() => { setTid(x.key); onSelectObject(x.key); }}
                className={`flex w-full items-start gap-2 border-b border-ink-100 px-3 py-2 text-left transition last:border-b-0 ${
                  x.key === tid ? 'bg-brand-50' : 'hover:bg-ink-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[12px] font-medium text-ink-800">{x.name}</span>
                  <span className="block truncate text-[11px] text-ink-400">{x.brief}</span>
                </span>
                <StatusTag status={x.status} withText={false} />
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white p-4">
            {tbl ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-mono text-[15px] font-bold text-ink-900">{tbl.name}</h2>
                  <StatusTag status={tbl.status} />
                </div>
                <KeyValue items={tbl.attrs} />
                {tbl.sections.map((s, i) => (
                  <div key={i} className="mt-3">
                    <h3 className="mb-1.5 text-[12px] font-semibold text-ink-600">{s.title}</h3>
                    {s.kind === 'table' && <SectionTable head={s.head} rows={s.rows} note={s.note} badge={s.badge} />}
                  </div>
                ))}
              </>
            ) : (
              <EmptyNote>テーブルを選んでください。</EmptyNote>
            )}
          </div>
        </div>
      )}

      {tab === 'er' && (
        <div className="rounded-lg border border-ink-200 bg-white">
          <header className="border-b border-ink-100 px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink-800">{t('dm.er')}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{t('dm.erNote')}</p>
          </header>
          <div className="max-h-[620px] overflow-auto p-3">
            <Mermaid code={erChart(summary)} />
          </div>
          <footer className="border-t border-ink-100 px-4 py-2 text-[11px] text-ink-400">
            {t('dm.derived')}
          </footer>
        </div>
      )}

      {tab === 'impact' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ImpactTable title={t('dm.writeMap')} map={writeMap} tone="emerald" />
          <ImpactTable title={t('dm.readMap')} map={readMap} tone="brand" />
          <section className="rounded-lg border border-ink-200 bg-white p-4 lg:col-span-2">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-800">読み書き影響図</h2>
            <div className="max-h-[420px] overflow-auto">
              <Mermaid code={impactChart(summary)} />
            </div>
          </section>
        </div>
      )}

      {tab === 'sql' && (
        <div className="rounded-lg border border-ink-200 bg-white">
          <header className="border-b border-ink-100 px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink-800">{t('dm.sql')}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{t('dm.noSql')}</p>
          </header>
          {sqlObjs.length === 0 ? (
            <div className="p-4"><EmptyNote>{t('dm.noSql')}</EmptyNote></div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {sqlObjs.map((o) => (
                <li key={o.key} className="px-4 py-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">SQL</span>
                    <span className="text-[12px] text-ink-700">{o.brief}</span>
                    <button
                      onClick={() => onSelectObject(o.key)}
                      className="ml-auto text-[11px] text-brand-600 hover:underline"
                    >
                      {t('ob.goTo')}
                    </button>
                  </div>
                  <pre className="max-h-[160px] overflow-auto rounded bg-ink-900 p-2.5 font-mono text-[11px] leading-relaxed text-ink-100">
                    {o.sections[0]?.text || ''}
                  </pre>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {o.links.map((l) => {
                      const to = model.byKey.get(l.key);
                      return to ? (
                        <span key={l.key + l.type} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-600">
                          → {to.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'datasource' && <DatasourcePanel model={model} onSelectObject={onSelectObject} />}
    </>
  );
}

function ImpactTable({ title, map, tone }) {
  const entries = Object.entries(map || {});
  const badge = tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700';
  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <header className="border-b border-ink-100 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink-800">{title}</h2>
      </header>
      {entries.length === 0 ? (
        <div className="p-4"><EmptyNote>{title}を確認できません。</EmptyNote></div>
      ) : (
        <ul className="divide-y divide-ink-100">
          {entries.map(([table, sources]) => (
            <li key={table} className="px-4 py-2.5">
              <div className="mb-1 font-mono text-[12px] font-medium text-ink-800">{table}</div>
              <ul className="space-y-1">
                {sources.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${badge}`}>{s.source}</span>
                    <span className="font-mono text-[11px] text-ink-500">{s.fields}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DatasourcePanel({ model, onSelectObject }) {
  const list = model.objects.filter((o) => o.type === OBJ.DATASOURCE);
  if (!list.length) {
    return (
      <div className="rounded-lg border border-ink-200 bg-white p-4">
        <EmptyNote>アプリ定義にデータソースの定義も参照もありません。実運用環境の接続先については、この静的解析では何も断定できません。</EmptyNote>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-white">
      <header className="border-b border-ink-100 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink-800">データソース</h2>
        <p className="mt-0.5 text-[11px] text-ink-400">定義ブロックのあるものは「定義あり」、設定からの参照だけのものは「参照名のみ」です。</p>
      </header>
      <ul className="divide-y divide-ink-100">
        {list.map((o) => (
          <li key={o.key} className="px-4 py-3">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] font-medium text-ink-800">{o.name}</span>
              <StatusTag status={o.status} />
              <button onClick={() => onSelectObject(o.key)} className="ml-auto text-[11px] text-brand-600 hover:underline">
                {t('ob.goTo')}
              </button>
            </div>
            <KeyValue items={o.attrs} />
          </li>
        ))}
      </ul>
    </div>
  );
}