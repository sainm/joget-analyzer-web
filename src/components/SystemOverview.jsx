import React from 'react';
import { t } from '../i18n.js';
import { OBJ, objTypeLabel, CAUSE_LABEL, CAUSE_DESC } from '../lib/objectModel.js';
import { menuChart } from '../lib/mermaidGraphs.js';
import Mermaid from './Mermaid.jsx';
import { PageHead } from './Shell.jsx';
import { StatusTag, TypeTag, EmptyNote, CauseTag, CAUSE_FILL } from './Common.jsx';
import { KeyValue, levelLabel, levelTone } from './ObjectExplorer.jsx';

/**
 * システム概要。
 *
 * ここでの役割は「数値を見せる」ことで終えるのではなく、
 * 「何がどこにあるか → すぐ詳細へ」まで一気に連れて行くことです。
 * そのため数値はすべてクリック可能にし、集計だけでは終わらせない。
 */

const SCALE = [
  { type: OBJ.MENU, hint: 'ユーザー入口' },
  { type: OBJ.FORM, hint: '入力画面と項目定義' },
  { type: OBJ.LIST, hint: '一覧・絞り込み・並べ替え' },
  { type: OBJ.PROCESS, hint: 'XPDL の定義' },
  { type: OBJ.TABLE, hint: '命名規約から導出' },
  { type: OBJ.COLUMN, hint: '規約生成と実データの両方' },
  { type: OBJ.PLUGIN, hint: 'アプリが参照するクラス' },
  { type: OBJ.SQL, hint: '文字列として読めた SQL' },
  { type: OBJ.DATASOURCE, hint: '定義と参照名' },
];

export default function SystemOverview({ model, summary, onNavigate, onSelectObject }) {
  const counts = model.stats.byType;
  const app = summary?.app || {};
  const errs = model.stats.checks.error;
  const warns = model.stats.checks.warn;
  // 積み上げバーの分母。未確認の総数と一致する（成因の無い未確認は無い）が、
  // ズレてもバーが破綻しないよう内訳の合計を分母にする。
  const causeTotal = model.causeSummary.reduce((s, c) => s + c.count, 0);

  return (
    <>
      <PageHead
        title={t('nav.overview')}
        lead="解析結果から見た全体像です。数値をクリックすると、その種別のオブジェクト一覧へ移動します。"
      />

      {/* 規模 */}
      <Section title={t('ov.scale')} hint={t('ov.clickHint')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {SCALE.map((s) => {
            const n = counts[s.type] || 0;
            return (
              <button
                key={s.type}
                disabled={!n}
                onClick={() => onNavigate({ key: 'objects', type: s.type })}
                className="group rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-left transition enabled:hover:border-brand-300 enabled:hover:bg-brand-50/40 disabled:opacity-60"
              >
                <div className="text-[11px] text-ink-500">{objTypeLabel(s.type)}</div>
                <div className="mt-0.5 text-[22px] font-bold tabular-nums leading-none text-ink-900">{n}</div>
                <div className="mt-1 text-[10px] text-ink-400">{n ? s.hint : '未検出'}</div>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* メニュー構成 */}
        <Section title={t('ov.menuTree')}>
          {asArray(summary?.app?.userviews).length === 0 ? (
            <EmptyNote>{t('ov.noMenu')}</EmptyNote>
          ) : (
            <div className="space-y-3">
              {summary.app.userviews.map((uv) => (
                <div key={uv.id}>
                  <div className="mb-1 text-[12px] font-semibold text-ink-700">
                    {uv.name} <span className="font-mono text-[10px] text-ink-400">{uv.id}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {asArray(uv.categories).map((cat, ci) => (
                      <li key={ci}>
                        <div className="text-[11px] text-ink-400">{cat.category}</div>
                        <ul className="mt-0.5 space-y-0.5 border-l border-ink-200 pl-2.5">
                          {asArray(cat.menus).map((m, mi) => {
                            const key = `menu:${m.customId || `${cat.category}/${m.label}`}`;
                            const obj = model.byKey.get(key);
                            return (
                              <li key={mi}>
                                <button
                                  disabled={!obj}
                                  onClick={() => onSelectObject(key)}
                                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition enabled:hover:bg-brand-50 enabled:hover:text-brand-700"
                                >
                                  <span className="truncate text-[12px] text-ink-700">{m.label}</span>
                                  <span className="shrink-0 font-mono text-[10px] text-ink-400">{m.type}</span>
                                  {obj?.status && <StatusTag status={obj.status} withText={false} />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* アプリと解析の範囲 */}
        <Section title={t('ov.data')}>
          <KeyValue
            items={[
              { k: 'アプリ名', v: app.name },
              { k: 'アプリ ID', v: app.appId },
              { k: 'パッケージ', v: app.package },
              { k: 'バージョン', v: app.version },
              { k: '作成日', v: app.dateCreated },
              { k: '更新日', v: app.dateModified },
              { k: 'テーブル数', v: `${counts[OBJ.TABLE] || 0} 件（命名規約から導出）` },
              { k: '実データ行数', v: dataRowSummary(model) },
              { k: '解析レコード', v: summary?.generatedAt },
            ]}
          />
          {(summary?.stats?.assetsSkipped || 0) > 0 && (
            <p className="mt-2 text-[11px] text-ink-400">
              {t('ov.skippedAssets', { n: summary.stats.assetsSkipped })}
            </p>
          )}
          <div className="mt-3 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
            テーブルとカラムはアプリ設定の命名規約（<span className="font-mono">app_fd_</span> / <span className="font-mono">c_</span>）から導出したものです。
            実データベースのメタデータは参照していないため、構造が確定済みとは表示しません。
          </div>
        </Section>
      </div>

      {/* メニュー構成図。一覧の方が辿りやすいので、グラフは折りたたんだ確認用として置く */}
      {asArray(summary?.app?.userviews).length > 0 && (
        <details className="mt-4 rounded-lg border border-ink-200 bg-white">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-semibold text-ink-800 transition hover:bg-ink-50">
            {t('g.menu')}
            <span className="ml-2 text-[11px] font-normal text-ink-400">{t('g.menuHint')}</span>
          </summary>
          <div className="max-h-[420px] overflow-auto border-t border-ink-100 p-3">
            <Mermaid code={menuChart(summary)} />
          </div>
        </details>
      )}

      {/* 検査結果 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title={t('ov.issues')}>
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate({ key: 'checks' })}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left transition hover:border-rose-300"
            >
              <div className="text-[11px] text-rose-600">{t('ck.level.error')}</div>
              <div className="text-[20px] font-bold tabular-nums leading-none text-rose-700">{errs}</div>
            </button>
            <button
              onClick={() => onNavigate({ key: 'checks' })}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left transition hover:border-amber-300"
            >
              <div className="text-[11px] text-amber-600">{t('ck.level.warn')}</div>
              <div className="text-[20px] font-bold tabular-nums leading-none text-amber-700">{warns}</div>
            </button>
          </div>
          <ul className="space-y-1">
            {model.checks.slice(0, 5).map((c, i) => (
              <li key={i} className="flex gap-2 text-[12px]">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
                <span className="min-w-0 flex-1 text-ink-600">
                  <span className="font-mono text-[10px] text-ink-400">{c.ruleId}</span> {c.rule}
                </span>
              </li>
            ))}
            {model.checks.length === 0 && <li className="text-[12px] text-ink-400">{t('ck.none')}</li>}
          </ul>
          {model.checks.length > 5 && (
            <button onClick={() => onNavigate({ key: 'checks' })} className="mt-2 text-[12px] text-brand-600 hover:underline">
              すべての検査結果を見る（{model.checks.length} 件）
            </button>
          )}
        </Section>

        <Section title={t('ov.limitations')}>
          {/* 未確認の内訳（成因）。「何が分からないか」の量を先に示し、
              箇条書きの質的説明が続く。0 件の成因はモデルが落としている
              （成因は未確認の内訳で、未計測の概念を持たない）。 */}
          {model.causeSummary.length > 0 && (
            <div className="mb-3 rounded-md border border-ink-200 bg-ink-50 p-2.5" data-testid="cause-summary">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink-700">未確認の内訳（なぜ確定できなかったか）</span>
                <button onClick={() => onNavigate({ key: 'quality' })} className="shrink-0 text-[11px] text-brand-600 hover:underline">
                  内訳を開く
                </button>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-ink-200">
                {model.causeSummary.map((c) => (
                  <div
                    key={c.cause}
                    className={`h-full ${CAUSE_FILL[c.cause] || 'bg-ink-300'}`}
                    style={{ width: `${(c.count / causeTotal) * 100}%` }}
                    title={`${CAUSE_LABEL[c.cause]}: ${c.count} 件`}
                  />
                ))}
              </div>
              <ul className="mt-2 space-y-0.5" data-testid="cause-summary-rows">
                {model.causeSummary.map((c) => (
                  <li key={c.cause} className="flex items-center gap-1.5 text-[11px]">
                    <CauseTag cause={c.cause} />
                    <span className="min-w-0 flex-1 truncate text-ink-400">{CAUSE_DESC[c.cause]}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink-700">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="space-y-1.5 text-[12px] leading-relaxed text-ink-600">
            <li>・実データベースのメタデータ参照は行っていません。テーブルは命名規約からの導出です。</li>
            <li>・実行時に組み立てられるクエリ、変数、プラグインの動的挙動は静的解析では確認できません。</li>
            <li>・ソース未提供のプラグインは「プラットフォーム標準」として分離しています。</li>
            <li>・未検出は「0 件」ではなく「未計測」として、解析の到達範囲を示しています。</li>
          </ul>
          <button
            onClick={() => onNavigate({ key: 'quality' })}
            className="mt-3 rounded-md border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 transition hover:bg-ink-50"
          >
            {t('nav.quality')} を開く
          </button>
        </Section>
      </div>
    </>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink-800">{title}</h2>
        {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

const asArray = (v) => (Array.isArray(v) ? v : []);

function dataRowSummary(model) {
  const rows = model.objects
    .filter((o) => o.type === OBJ.TABLE)
    .map((o) => o.attrs.find((a) => a.k === '実データ行数'))
    .filter((a) => a && a.v !== '—')
    .map((a) => Number(a.v));
  if (!rows.length) return '実データは .jwa に含まれていません';
  return `${rows.reduce((a, b) => a + b, 0)} 行`;
}