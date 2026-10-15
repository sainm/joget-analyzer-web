import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { PageHead } from './Shell.jsx';
import { TypeTag, EmptyNote } from './Common.jsx';
import { levelLabel, levelTone } from './ObjectExplorer.jsx';

/**
 * 静的チェック。
 *
 * ここで示すのは「解析で見つかった不整合」であり、「実運用の障害」ではない。
 * 判定の根拠・検査範囲・解析の限界を必ず併記し、
 * 解析不十分と実障害を混同させない。
 *
 * 各結果には必ず「ルール ID / 検査対象 / 根拠 / 範囲 / 制限」を書く。
 */
export default function CheckCenter({ model, onSelectObject }) {
  const [level, setLevel] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return model.checks
      .filter((c) => (level === 'all' ? true : c.level === level))
      .filter((c) => {
        if (!n) return true;
        return (
          c.rule.toLowerCase().includes(n) ||
          c.ruleId.toLowerCase().includes(n) ||
          c.text.toLowerCase().includes(n) ||
          (c.object?.name || '').toLowerCase().includes(n)
        );
      });
  }, [model, level, q]);

  const counts = {
    all: model.checks.length,
    error: model.stats.checks.error,
    warn: model.stats.checks.warn,
    info: model.stats.checks.info,
  };

  const byRule = useMemo(() => {
    const c = {};
    for (const x of model.checks) c[x.ruleId] = (c[x.ruleId] || 0) + 1;
    return c;
  }, [model]);

  return (
    <>
      <PageHead
        title={t('nav.checks')}
        lead="根拠が取れる範囲の静的検査結果です。解析の不十分さ・関連の見落としと、実運用の障害は区別して扱います。"
      />

      {model.checks.length === 0 ? (
        <EmptyNote>{t('ck.noneHint')}</EmptyNote>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {[['all', t('ob.filterAll')], ['error', t('ck.level.error')], ['warn', t('ck.level.warn')], ['info', t('ck.level.info')]].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setLevel(k)}
                  className={`rounded-md border px-3 py-1.5 text-[12px] transition ${
                    level === k ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-ink-200 bg-white text-ink-500 hover:bg-ink-50'
                  }`}
                >
                  {label} <span className="tabular-nums">{counts[k]}</span>
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ルール・文言・対象で検索"
              className="ml-auto w-64 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none placeholder:text-ink-400 focus:border-brand-300"
            />
          </div>

          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
            <span className="font-medium text-ink-600">適用中のルール:</span>
            {Object.entries(byRule).map(([rid, n]) => (
              <span key={rid} className="rounded bg-white px-1.5 py-0.5 font-mono text-ink-600">
                {rid} <span className="tabular-nums">{n}</span>
              </span>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyNote>この条件に該当する検査結果はありません。</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {rows.map((c, i) => (
                <li key={i} className="rounded-lg border border-ink-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">{c.ruleId}</span>
                    <span className="text-[13px] font-semibold text-ink-800">{c.rule}</span>
                    {c.object && (
                      <button
                        onClick={() => onSelectObject(c.object.key)}
                        className="ml-auto flex items-center gap-1.5 rounded border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <TypeTag type={c.object.type} />
                        <span className="max-w-[220px] truncate">{c.object.name}</span>
                      </button>
                    )}
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-[12px] leading-relaxed text-ink-700">{c.text}</p>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
                      <div>
                        <dt className="inline text-ink-400">{t('ck.evidence')}: </dt>
                        <dd className="inline text-ink-600">{c.evidence}</dd>
                      </div>
                      <div>
                        <dt className="inline text-ink-400">{t('ck.scope')}: </dt>
                        <dd className="inline text-ink-600">{c.scope}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline text-ink-400">{t('ck.limit')}: </dt>
                        <dd className="inline text-ink-500">{c.limit}</dd>
                      </div>
                    </dl>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}