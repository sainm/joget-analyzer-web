import React, { useState } from 'react';
import { Card, Badge, Table, Td, Stat, Empty, Accordion } from './ui.jsx';
import Mermaid from './Mermaid.jsx';
import { callGraphChart } from '../lib/mermaidGraphs.js';
import { t } from '../i18n.js';

/** verdict → i18n key の対応（label/hint はいずれも語彙表から取得） */
const VERDICT = {
  dead: { label: 'co.vDead', hint: 'co.vDeadHint', tone: 'rose' },
  'wrong-plugin': { label: 'co.vWrong', hint: 'co.vWrongHint', tone: 'amber' },
  'undeclared-but-read': { label: 'co.vUndeclared', hint: 'co.vUndeclaredHint', tone: 'amber' },
};

export default function Correlation({ correlation, manifest }) {
  const [openSet, setOpenSet] = useState({});
  const c = correlation;

  if (!c) {
    return (
      <Card title={t('co.title')}>
        <Empty>{t('co.noManifest')}</Empty>
      </Card>
    );
  }
  if (!c.hasSource) {
    return (
      <Card title={t('co.noSourceTitle')} subtitle={t('co.noSourceSub')}>
        <Empty>{t('co.noSourceBody')}</Empty>
      </Card>
    );
  }

  const s = c.stats;
  const bound = c.bindings.filter((b) => b.inSource);
  const dead = c.deadConfig || [];
  const joinComma = (arr) => arr.join(t('c.listSep'));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('co.refClasses')} value={s.referencedClasses} tone="brand" />
        <Stat label={t('co.bound')} value={s.bound} tone="jade" />
        <Stat label={t('co.platform')} value={s.platform} hint={t('co.platformHint')} />
        <Stat
          label={t('co.deadKeys')}
          value={s.deadConfigKeys}
          tone={s.deadConfigKeys ? 'rose' : 'default'}
          hint={t('co.deadHint')}
        />
        <Stat label={t('co.unused')} value={s.unusedInSource} tone="amber" />
        <Stat
          label={t('co.declaredVsRead')}
          value={`${s.projectDeclaredKeys}/${s.projectReadKeys}`}
          hint={t('co.configTotal')}
        />
      </div>

      {dead.length > 0 && (
        <Card title={t('co.deadTitle', { n: s.deadConfigKeys })} subtitle={t('co.deadSub')}>
          <ul className="space-y-2">
            {dead.map((d) => (
              <li key={d.className} className="flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-rose-500">▲</span>
                <div className="text-[13px] leading-relaxed text-ink-700">
                  <b>{d.simpleName}</b>
                  {d.keys.map((k) => (
                    <code key={k} className="mx-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] text-rose-700">{k}</code>
                  ))}
                  {t('co.deadLine')}
                  <div className="mt-1 text-[11px] text-ink-400">
                    {t('co.usedIn')}
                    {joinComma(d.usedIn) || '—'} · {t('co.source')}
                    {d.file}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('co.bindTitle')} subtitle={t('co.bindSub')}>
        <div className="space-y-2">
          {bound.map((b) => {
            const open = !!openSet[b.className];
            return (
              <div key={b.className} className="overflow-hidden rounded-lg border border-ink-200">
                <button
                  onClick={() => setOpenSet((o) => ({ ...o, [b.className]: !open }))}
                  className="flex w-full items-center gap-2 bg-ink-50 px-3 py-2 text-left hover:bg-ink-100"
                >
                  <span className={`text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                  <span className="font-mono text-[13px] font-semibold text-ink-800">{b.simpleName}</span>
                  <Badge tone="brand">{b.categoryLabel}</Badge>
                  {b.deadKeys.length > 0 && <Badge tone="rose">{t('co.deadBadge', { n: b.deadKeys.length })}</Badge>}
                  <span className="ml-auto shrink-0 text-[11px] text-ink-400">
                    {t('co.summaryLine', {
                      n: b.occurrences,
                      d: b.declaredCount,
                      s: b.setCount,
                      m: b.source.methodCount,
                    })}
                  </span>
                </button>

                {open && (
                  <div className="space-y-4 border-t border-ink-100 p-3">
                    <div className="font-mono text-[11px] text-ink-400">{b.className}</div>

                    {/* アプリの実設定 */}
                    <div>
                      <div className="mb-1.5 text-[12px] font-semibold text-ink-600">
                        {t('co.actualTitle', { n: b.setCount })}
                      </div>
                      {b.setCount === 0 ? (
                        <p className="text-xs text-ink-400">{t('co.noActual')}</p>
                      ) : (
                        <Table head={[t('co.thParam'), t('c.value'), t('co.thPos'), t('co.thVerdict')]} dense>
                          {b.setKeys.map((k) => {
                            const detail = (b.unknownDetail || []).find((d) => d.key === k);
                            const v = VERDICT[detail && detail.verdict];
                            return (
                              <tr key={k}>
                                <Td mono className="text-[11px]">{k}</Td>
                                <Td className="max-w-[260px] truncate text-[12px]">{b.setValues[k]}</Td>
                                <Td className="text-[11px] text-ink-500">
                                  {joinComma(b.usages.filter((u) => u.config[k] !== '').map((u) => u.where)) || '—'}
                                </Td>
                                <Td>
                                  {v ? (
                                    <span title={t(v.hint)}>
                                      <Badge tone={v.tone}>{t(v.label)}</Badge>
                                    </span>
                                  ) : (
                                    <Badge tone="jade">{t('co.valid')}</Badge>
                                  )}
                                </Td>
                              </tr>
                            );
                          })}
                        </Table>
                      )}
                    </div>

                    {/* 三者照合 */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <DiffBox
                        title={t('co.propsTitle', { n: b.declaredCount })}
                        items={b.configProps.map((p) => ({ key: p.name, sub: p.label, required: p.required }))}
                        empty={t('co.propsEmpty')}
                      />
                      <DiffBox
                        title={t('co.unsetTitle', { n: b.unsetKeys.length })}
                        items={b.unsetKeys.map((k) => ({ key: k }))}
                        empty={t('co.unsetEmpty')}
                        tone="muted"
                      />
                      <DiffBox
                        title={t('co.readTitle', { n: (b.source.readKeys || []).length })}
                        items={(b.source.readKeys || []).map((k) => ({ key: k }))}
                        empty={t('co.readEmpty')}
                      />
                    </div>

                    {b.declaredNotRead.length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-[11px] text-ink-400 hover:text-ink-600">
                          {t('co.notReadTitle', { n: b.declaredNotRead.length })}
                        </summary>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {b.declaredNotRead.map((k) => (
                            <span key={k} className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500">{k}</span>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* 呼び出し関係 */}
                    {(b.calls.length > 0 || b.calledBy.length > 0) && (
                      <div className="rounded-lg border border-ink-100 bg-ink-50 p-2.5">
                        <div className="mb-1.5 text-[12px] font-semibold text-ink-600">{t('co.callTitle')}</div>
                        <div className="space-y-1 text-[12px]">
                          {b.calls.map((x, i) => (
                            <div key={'c' + i} className="flex items-center gap-2">
                              <span className="text-ink-400">{t('co.calls')}</span>
                              <span className={`font-mono ${x.inApp ? 'font-semibold text-brand-700' : 'text-ink-500'}`}>{x.to}</span>
                              <Badge>{x.kind}</Badge>
                              {x.inApp && <Badge tone="jade">{t('co.inApp')}</Badge>}
                            </div>
                          ))}
                          {b.calledBy.map((x, i) => (
                            <div key={'b' + i} className="flex items-center gap-2">
                              <span className="text-ink-400">{t('co.calledBy')}</span>
                              <span className={`font-mono ${x.inApp ? 'font-semibold text-brand-700' : 'text-ink-500'}`}>{x.from}</span>
                              <Badge>{x.kind}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={t('co.unresolvedTitle', { n: c.unresolved.length })} subtitle={t('co.unresolvedSub')}>
          {c.unresolved.length === 0 ? (
            <Empty>{t('co.unresolvedEmpty')}</Empty>
          ) : (
            <Table head={[t('c.class'), t('co.thCategory'), t('c.refs')]} dense>
              {c.unresolved.map((u) => (
                <tr key={u.className}>
                  <Td mono className="text-[11px]">{u.className}</Td>
                  <Td><Badge tone="amber">{u.category}</Badge></Td>
                  <Td>{u.occurrences}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={t('co.unusedTitle', { n: c.unusedInSource.length })} subtitle={t('co.unusedSub')}>
          {c.unusedInSource.length === 0 ? (
            <Empty>{t('c.none')}</Empty>
          ) : (
            <Table head={[t('c.class'), t('c.file'), t('co.thMethodCount'), t('co.thKind')]} dense>
              {c.unusedInSource.map((u) => (
                <tr key={u.className}>
                  <Td mono className="text-[11px]">{u.simpleName}</Td>
                  <Td className="text-[11px] text-ink-500">{u.file}</Td>
                  <Td>{u.methodCount}</Td>
                  <Td><Badge>{u.sourceKind}</Badge></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title={t('co.focusGraph')} subtitle={t('co.focusGraphSub')}>
        <Mermaid code={callGraphChart({ callGraph: c.focusedCallGraph })} />
      </Card>

      {c.platform.length > 0 && (
        <Accordion title={t('co.platformTitle', { n: c.platform.length })} meta={t('co.platformSub')}>
          <div className="flex flex-wrap gap-1">
            {c.platform.map((p) => (
              <span key={p.className} className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                {p.simpleName}
              </span>
            ))}
          </div>
        </Accordion>
      )}
    </div>
  );
}

function DiffBox({ title, items, empty, tone }) {
  return (
    <div className="rounded-lg border border-ink-200">
      <div className="border-b border-ink-100 bg-ink-50 px-2.5 py-1.5 text-[12px] font-semibold text-ink-600">{title}</div>
      <div className="max-h-52 overflow-auto p-2">
        {items.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-ink-400">{empty}</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.key} className="flex items-baseline gap-1.5 text-[11px]">
                <code className={`font-mono ${tone === 'muted' ? 'text-ink-400' : 'text-ink-700'}`}>{it.key}</code>
                {it.sub && <span className="truncate text-ink-400">{it.sub}</span>}
                {it.required && <Badge tone="rose">{t('c.required')}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
