import React from 'react';
import { Card, Badge, Table, Td, Empty, Stat } from './ui.jsx';
import { t } from '../i18n.js';

export default function Impact({ summary }) {
  const impact = summary.impact || { writeMap: {}, readMap: {}, issues: [] };
  const writeMap = impact.writeMap || {};
  const readMap = impact.readMap || {};
  const issues = impact.issues || [];
  const effects = summary.sql_effects || [];
  const relations = summary.relations || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('im.writeTables')} value={Object.keys(writeMap).length} tone="rose" />
        <Stat label={t('im.readTables')} value={Object.keys(readMap).length} tone="jade" />
        <Stat label={t('c.sqlEffects')} value={effects.length} tone="amber" />
        <Stat label={t('im.issues')} value={issues.length} tone={issues.length ? 'rose' : 'default'} />
      </div>

      {issues.length > 0 && (
        <Card title={t('im.issueTitle', { n: issues.length })} subtitle={t('im.issueSub')}>
          <ul className="space-y-2">
            {issues.map((it, i) => (
              <li key={i} className="flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2">
                <span className="mt-0.5 shrink-0 text-rose-500">▲</span>
                <span className="text-[13px] leading-relaxed text-ink-700">{it}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title={t('im.writeTitle', { n: Object.keys(writeMap).length })} subtitle={t('im.writeSub')}>
          {Object.keys(writeMap).length === 0 ? (
            <Empty>{t('im.noWrite')}</Empty>
          ) : (
            <div className="space-y-3">
              {Object.entries(writeMap).map(([tb, list]) => (
                <div key={tb} className="rounded-lg border border-ink-200">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-3 py-1.5">
                    <span className="font-mono text-[12px] font-semibold text-ink-700">app_fd_{tb}</span>
                    <Badge tone="rose">{t('im.sites', { n: list.length })}</Badge>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {list.map((w, i) => (
                      <li key={i} className="px-3 py-1.5 text-[12px] text-ink-600">
                        <span className="text-ink-400">{w.source}</span>
                        {w.fields && w.fields !== '*' && (
                          <span className="ml-2 font-mono text-[11px] text-ink-500">{w.fields}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t('im.readTitle', { n: Object.keys(readMap).length })} subtitle={t('im.readSub')}>
          {Object.keys(readMap).length === 0 ? (
            <Empty>{t('im.noRead')}</Empty>
          ) : (
            <div className="space-y-3">
              {Object.entries(readMap).map(([tb, list]) => (
                <div key={tb} className="rounded-lg border border-ink-200">
                  <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-3 py-1.5">
                    <span className="font-mono text-[12px] font-semibold text-ink-700">app_fd_{tb}</span>
                    <Badge tone="jade">{t('im.sites', { n: list.length })}</Badge>
                  </div>
                  <ul className="divide-y divide-ink-100">
                    {list.map((r, i) => (
                      <li key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px] text-ink-600">
                        <span>{r.source}</span>
                        {r.binder && <span className="font-mono text-[10px] text-ink-400">{r.binder}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {relations.length > 0 && (
        <Card title={t('im.relTitle', { n: relations.length })} subtitle={t('im.relSub')}>
          <Table head={[t('th.parent'), t('th.child'), t('th.fk'), t('th.note')]} dense>
            {relations.map((r, i) => (
              <tr key={i}>
                <Td mono className="text-[11px]">{r.from}</Td>
                <Td mono className="text-[11px]">{r.to}</Td>
                <Td mono className="text-[11px] text-amber-500">{r.field}</Td>
                <Td className="text-xs text-ink-500">{r.desc || t('im.relNote')}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {effects.length > 0 && (
        <Card title={t('im.sfxTitle', { n: effects.length })} subtitle={t('im.sfxSub')}>
          <Table head={[t('c.type'), t('th.targetTable'), t('th.setFields'), t('th.where'), t('th.rawSql')]} dense>
            {effects.map((e, i) => (
              <tr key={i}>
                <Td>
                  <Badge tone={e.kind === 'sql' ? 'rose' : 'amber'}>{e.kind || 'sql'}</Badge>
                </Td>
                <Td mono className="text-[11px]">{e.table}</Td>
                <Td mono className="text-[11px]">
                  {(e.sets || []).map((s) => `${s.column}=${s.value}`).join(', ') || '—'}
                </Td>
                <Td mono className="text-[11px] text-ink-500">
                  {(e.whereColumns || []).join(', ') || '—'}
                </Td>
                <Td className="max-w-[320px]">
                  <code className="block truncate text-[11px] text-ink-500" title={e.sql}>
                    {e.sql}
                  </code>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
