import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { STATUS, STATUS_LABEL, objTypeLabel } from '../lib/objectModel.js';
import { PageHead } from './Shell.jsx';
import { StatusTag, TypeTag, EmptyNote } from './Common.jsx';

/**
 * 解析品質。
 *
 * ここで示すのは「完了率」ではない。
 * どの資産をどこまで読み取れたのか、どの資産が読み取れなかったのかを
 * 資産種別ごとに明示し、未確認の項目へ直接辿れるようにする。
 * 一つの割合で全体を代表させることはしない。
 */
export default function QualityCenter({ model, onSelectObject }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');

  const unconfirmed = useMemo(() => {
    const n = q.trim().toLowerCase();
    return model.unconfirmed
      .filter((o) => (type === 'all' ? true : o.type === type))
      .filter((o) => (n ? o.name.toLowerCase().includes(n) || o.id.toLowerCase().includes(n) : true));
  }, [model, q, type]);

  const typesInUnconfirmed = useMemo(() => {
    const c = {};
    for (const o of model.unconfirmed) c[o.type] = (c[o.type] || 0) + 1;
    return c;
  }, [model]);

  const totalUnconfirmed = model.unconfirmed.length;
  const totalObjects = model.stats.total;

  return (
    <>
      <PageHead
        title={t('nav.quality')}
        lead="このアプリについて、静的解析がどこまで到達したかを示します。未検出は「0 件」ではなく「未計測」と表示し、未確定の項目は下の一覧から確認できます。"
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="オブジェクト総数" value={totalObjects} />
        <Stat label="解析済" value={model.stats.byStatus[STATUS.PARSED] || 0} tone="jade" />
        <Stat label="一部のみ" value={model.stats.byStatus[STATUS.PARTIAL] || 0} tone="amber" />
        <Stat label="未確認" value={model.stats.byStatus[STATUS.UNKNOWN] || 0} tone="default" />
      </div>

      <section className="mb-4 rounded-lg border border-ink-200 bg-white">
        <header className="border-b border-ink-100 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-ink-800">{t('ql.coverage')}</h2>
          <p className="mt-0.5 text-[11px] text-ink-400">各行の「件数」は実際に取り出せた数です。分母となる全体数を推測で埋めることはしません。</p>
        </header>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-ink-50 text-left">
              <tr>
                <th className="border-b border-ink-200 px-3 py-2 font-semibold text-ink-600">資産種別</th>
                <th className="border-b border-ink-200 px-3 py-2 font-semibold text-ink-600">件数</th>
                <th className="border-b border-ink-200 px-3 py-2 font-semibold text-ink-600">うち未確定</th>
                <th className="border-b border-ink-200 px-3 py-2 font-semibold text-ink-600">到達範囲</th>
              </tr>
            </thead>
            <tbody>
              {model.coverage.map((c) => (
                <tr key={c.id} className="odd:bg-white even:bg-ink-50/40">
                  <td className="border-b border-ink-100 px-3 py-1.5 text-ink-800">{c.label}</td>
                  <td className="border-b border-ink-100 px-3 py-1.5 tabular-nums text-ink-700">
                    {c.measured ? c.total : <span className="text-ink-300">{t('ql.notMeasured')}</span>}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-1.5 tabular-nums text-ink-700">
                    {c.partial > 0 ? <span className="text-amber-600">{c.partial}</span> : <span className="text-ink-300">—</span>}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-1.5 text-ink-500">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-ink-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-800">{t('ql.unconfirmed')}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{t('ql.unconfirmedHint')}</p>
          </div>
          <span className="rounded-md border border-ink-200 bg-ink-50 px-2.5 py-1 text-[12px] tabular-nums text-ink-600">
            {unconfirmed.length} / {totalUnconfirmed}
          </span>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ql.searchPlaceholder')}
            className="w-56 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none placeholder:text-ink-400 focus:border-brand-300"
          />
          <button
            onClick={() => setType('all')}
            className={`rounded border px-2 py-1 text-[11px] ${type === 'all' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'}`}
          >
            {t('ob.filterAll')}
          </button>
          {Object.entries(typesInUnconfirmed).map(([ty, n]) => (
            <button
              key={ty}
              onClick={() => setType(ty)}
              className={`rounded border px-2 py-1 text-[11px] ${type === ty ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-500'}`}
            >
              {objTypeLabel(ty)} <span className="tabular-nums">{n}</span>
            </button>
          ))}
        </div>

        {unconfirmed.length === 0 ? (
          <div className="p-4">
            <EmptyNote>この条件に該当する未確認項目はありません。</EmptyNote>
          </div>
        ) : (
          <ul className="max-h-[520px] divide-y divide-ink-100 overflow-y-auto">
            {unconfirmed.map((o) => (
              <li key={o.key}>
                <button onClick={() => onSelectObject(o.key)} className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition hover:bg-ink-50">
                  <span className="mt-0.5 shrink-0">
                    <TypeTag type={o.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink-800">{o.name}</span>
                    <span className="block truncate text-[11px] text-ink-500">{o.brief}</span>
                  </span>
                  <span className="mt-0.5 shrink-0">
                    <StatusTag status={o.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, tone = 'default' }) {
  const tones = { default: 'text-ink-800', jade: 'text-emerald-700', amber: 'text-amber-700' };
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className={`mt-0.5 text-[22px] font-bold tabular-nums leading-none ${tones[tone]}`}>{value}</div>
    </div>
  );
}