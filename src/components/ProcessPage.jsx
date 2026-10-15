import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { OBJ } from '../lib/objectModel.js';
import { flowChart } from '../lib/mermaidGraphs.js';
import Mermaid from './Mermaid.jsx';
import { PageHead } from './Shell.jsx';
import { StatusTag, EmptyNote, SectionTable } from './Common.jsx';
import { levelLabel, levelTone } from './ObjectExplorer.jsx';

/**
 * プロセス定義。
 *
 * フロー図・ノード詳細・遷移一覧を同じ画面に置き、ノード選択を相互に同期させる。
 * フロー図には解析済みの XPDL をそのまま渡す（この画面で XPDL を再構築すると
 * 遷移情報が落ちるため）。
 *
 * 静的検査は「静的構造に識別できる不整合」の指摘に留め、
 * 実運用のフローが失敗すると断定する書き方はしない。
 */
export default function ProcessPage({ model, summary, onSelectObject }) {
  const processes = model.objects.filter((o) => o.type === OBJ.PROCESS);
  const [pid, setPid] = useState(processes[0]?.key || '');
  const [actKey, setActKey] = useState(null);
  const proc = processes.find((p) => p.key === pid);

  const nodes = useMemo(
    () => (proc ? proc.children.map((k) => model.byKey.get(k)).filter(Boolean) : []),
    [proc, model],
  );
  const current = actKey ? model.byKey.get(actKey) : null;
  const checks = proc
    ? model.checks.filter((c) => c.object?.key === proc.key || (current && c.object?.key === current.key))
    : [];

  // 遷移表はオブジェクトの sections に済みのものをそのまま使う（再導出しない）
  const transitionSection = proc?.sections.find((s) => s.title === t('pr.transition'));

  if (!processes.length) {
    return (
      <>
        <PageHead title={t('nav.process')} />
        <EmptyNote>アプリ定義にプロセス（XPDL）が見つかりません。</EmptyNote>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={t('nav.process')}
        lead="XPDL から読み取ったノードと遷移です。開始・終了は遷移グラフからの推定であり、実行時の到達順序を保証しません。"
        right={
          <select
            value={pid}
            onChange={(e) => { setPid(e.target.value); setActKey(null); }}
            className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-brand-300"
          >
            {processes.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        }
      />

      {proc && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-500">
          <StatusTag status={proc.status} />
          <span className="font-mono text-[11px] text-ink-400">{proc.id}</span>
          {(proc.notes || []).map((n, i) => (
            <span
              key={i}
              className={`rounded px-1.5 py-0.5 text-[11px] ${n.level === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-600'}`}
            >
              {n.text}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-lg border border-ink-200 bg-white">
          <header className="border-b border-ink-100 px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink-800">フロー図</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{t('pr.endpoints')}</p>
          </header>
          <div className="max-h-[520px] overflow-auto p-3">
            {/* flowChart が受けるのは summary ではなく summary.xpdl。
                summary を渡すと processes が取れず、空の図が静かに出る */}
            <Mermaid code={flowChart(summary.xpdl)} />
          </div>
        </section>

        <section className="rounded-lg border border-ink-200 bg-white">
          <header className="border-b border-ink-100 px-4 py-2.5">
            <h2 className="text-[13px] font-semibold text-ink-800">{t('pr.node')}</h2>
            <p className="mt-0.5 text-[11px] text-ink-400">{nodes.length ? t('pr.selectNode') : ''}</p>
          </header>
          {nodes.length === 0 ? (
            <div className="p-4"><EmptyNote>このプロセスにノードはありません。</EmptyNote></div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              {current ? (
                <div className="p-4">
                  <button onClick={() => setActKey(null)} className="mb-2 text-[12px] text-brand-600 hover:underline">
                    ← {t('ob.backToList')}
                  </button>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-bold text-ink-900">{current.name}</h3>
                    <StatusTag status={current.status} />
                  </div>
                  <dl className="divide-y divide-ink-100 rounded-md border border-ink-200">
                    {current.attrs.map((a, i) => (
                      <div key={i} className="grid grid-cols-1 gap-x-4 px-3 py-1.5 sm:grid-cols-[140px_1fr]">
                        <dt className="text-[12px] text-ink-500">{a.k}</dt>
                        <dd className={`text-[12px] ${a.v === '—' ? 'text-ink-300' : 'text-ink-800'}`}>{a.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    onClick={() => onSelectObject(current.key)}
                    className="mt-3 rounded-md border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 transition hover:bg-ink-50"
                  >
                    {t('dc.jumpToObject')}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {nodes.map((n) => (
                    <li key={n.key}>
                      <button onClick={() => setActKey(n.key)} className="flex w-full items-center gap-2 px-4 py-2 text-left transition hover:bg-ink-50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink-800">{n.name}</span>
                          <span className="block truncate text-[11px] text-ink-400">{n.brief}</span>
                        </span>
                        <StatusTag status={n.status} withText={false} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-ink-200 bg-white p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-800">{t('pr.transition')}</h2>
          {transitionSection?.rows?.length ? (
            <SectionTable
              head={transitionSection.head}
              rows={transitionSection.rows}
              note="遷移条件は XPDL の属性に定義がある場合だけ取得できます。空欄は「条件なし」ではなく「未取得」の可能性があります。"
            />
          ) : (
            <EmptyNote>このプロセスに遷移はありません。</EmptyNote>
          )}
        </section>

        <section className="rounded-lg border border-ink-200 bg-white p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-ink-800">{t('pr.staticCheck')}</h2>
          {checks.length === 0 ? (
            <EmptyNote>{t('ck.none')}</EmptyNote>
          ) : (
            <ul className="space-y-2">
              {checks.map((c, i) => (
                <li key={i} className="rounded-md border border-ink-200 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${levelTone(c.level)}`}>{levelLabel(c.level)}</span>
                    <span className="font-mono text-[10px] text-ink-400">{c.ruleId}</span>
                    <span className="text-[12px] font-medium text-ink-800">{c.rule}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-600">{c.text}</p>
                  <p className="mt-1 text-[11px] text-ink-400">{t('ck.limit')}: {c.limit}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}