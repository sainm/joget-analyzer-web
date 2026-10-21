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
 *
 * ルールごとのサマリは「何を調べたか」を結果より先に示す。0 件のルールも
 * 「調べたが何も出なかった」事実として出す。一方、ソース未提供などで
 * 計測そのものができないルールは 0 件にせず「未計測」と書き、
 * 絞り込みの対象にもしない（計っていないものを選んで「何も出なかった」
 * と見せることは、0 と未計測の混同になる）。
 */
export default function CheckCenter({ model, onSelectObject }) {
  const [level, setLevel] = useState('all');
  const [ruleId, setRuleId] = useState('all');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return model.checks
      .filter((c) => (level === 'all' ? true : c.level === level))
      .filter((c) => (ruleId === 'all' ? true : c.ruleId === ruleId))
      .filter((c) => {
        if (!n) return true;
        return (
          c.rule.toLowerCase().includes(n) ||
          c.ruleId.toLowerCase().includes(n) ||
          c.text.toLowerCase().includes(n) ||
          (c.object?.name || '').toLowerCase().includes(n)
        );
      });
  }, [model, level, ruleId, q]);

  const counts = {
    all: model.checks.length,
    error: model.stats.checks.error,
    warn: model.stats.checks.warn,
    info: model.stats.checks.info,
  };

  /* 空表示の文言は「なぜ 0 行なのか」で変える。
   *
   * ルールで絞っていて、そのルールが 0 件——これは「調べたが何も
   * 出なかった」であり、未計測（調べられなかった）ではない。同じ
   * 「0 行」でも意味が逆なので、ここで言い分ける。
   * 一方、そのルールに結果はあるのにレベルや検索語で隠れているだけの
   * ときに「0 件」と言うと嘘になる。件数を出して条件を変えるよう促す。 */
  const activeRule = ruleId === 'all' ? null : model.checkRules.find((r) => r.ruleId === ruleId) || null;
  const emptyMessage = !activeRule
    ? 'この条件に該当する検査結果はありません。'
    : activeRule.count === 0
      ? `「${activeRule.rule}」は調べた結果 0 件でした（未計測ではありません）。検査範囲: ${activeRule.scope}`
      : `この条件に該当する検査結果はありません（「${activeRule.rule}」には ${activeRule.count} 件あります）。重大度か検索語を変えてください。`;

  return (
    <>
      <PageHead
        title={t('nav.checks')}
        lead="根拠が取れる範囲の静的検査結果です。解析の不十分さ・関連の見落としと、実運用の障害は区別して扱います。"
      />

      {/* ルールごとのサマリは結果の有無に関わらず常に出す。
        * 0 件は「調べたが何も出なかった」事実、未計測は「調べられなかった」
        * 事実として区別して示す。結果が空のときこそ「何を調べたか」が
        * 消えては、健全に見えないものが健全に見える。 */}
      <div className="mb-3 rounded-lg border border-ink-200 bg-white" data-testid="check-rule-rows">
        <header className="border-b border-ink-100 px-3.5 py-2">
          <h2 className="text-[12px] font-semibold text-ink-700">適用中のルール</h2>
          <p className="mt-0.5 text-[11px] text-ink-400">何を調べたかと、その結果です。行を選ぶと一覧を絞り込めます。</p>
        </header>
        <ul className="divide-y divide-ink-100">
          {model.checkRules.map((r) => (
            <li key={r.ruleId}>
              {r.measured ? (
                <button
                  onClick={() => setRuleId(ruleId === r.ruleId ? 'all' : r.ruleId)}
                  aria-pressed={ruleId === r.ruleId}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2 text-left transition ${
                    ruleId === r.ruleId ? 'bg-brand-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <span className="mt-0.5 shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">{r.ruleId}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink-800">{r.rule}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                      {t('ck.scope')}: {r.scope} · {t('ck.limit')}: {r.limit}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink-700">{r.count} 件</span>
                </button>
              ) : (
                <div className="flex items-start gap-2.5 px-3.5 py-2" data-measured="false">
                  <span className="mt-0.5 shrink-0 rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">{r.ruleId}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-ink-700">{r.rule}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                      {t('ck.scope')}: {r.scope} · {t('ck.limit')}: {r.limit}
                    </span>
                  </span>
                  <span className="shrink-0 rounded border border-ink-200 bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">未計測</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

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

          {rows.length === 0 ? (
            <div data-testid="check-empty">
              <EmptyNote>{emptyMessage}</EmptyNote>
            </div>
          ) : (
            <ul className="space-y-2" data-testid="check-rows">
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