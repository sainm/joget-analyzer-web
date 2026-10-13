import React from 'react';
import { Card, Stat, Badge, Table, Td, Accordion, Empty } from './ui.jsx';
import { useI18n } from '../LangContext.jsx';

export default function Overview({ summary, stats }) {
  const { t } = useI18n();
  const app = summary.app || {};
  const forms = app.forms || [];
  const datalists = app.datalists || [];
  const menus = (app.userviews || []).flatMap((uv) =>
    (uv.categories || []).flatMap((c) => (c.menus || []).map((m) => ({ ...m, category: c.category })))
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('c.forms')} value={stats.forms} tone="brand" />
        <Stat label={t('c.datalists')} value={stats.datalists} tone="brand" />
        <Stat label={t('c.menus')} value={stats.menus} tone="brand" />
        <Stat label={t('c.tables')} value={stats.tables} tone="jade" />
        <Stat label={t('c.processes')} value={stats.processes} tone="jade" />
        <Stat label={t('c.sqlEffects')} value={stats.sqlEffects} tone="amber" />
      </div>

      <Card title={t('ov.appInfo')}>
        <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Row k={t('ov.appName')} v={app.name} />
          <Row k={t('ov.appId')} v={app.appId} mono />
          <Row k={t('ov.package')} v={app.package} mono />
          <Row k={t('ov.version')} v={app.version} />
          <Row k={t('ov.created')} v={app.dateCreated} />
          <Row k={t('ov.modified')} v={app.dateModified} />
        </div>
        {stats.assetsSkipped > 0 && (
          <p className="mt-3 border-t border-ink-100 pt-2 text-[11px] text-ink-400">
            {t('ov.skippedAssets', { n: stats.assetsSkipped })}
          </p>
        )}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title={t('ov.formsTitle', { n: forms.length })} subtitle={t('ov.formsSub')}>
          {forms.length === 0 ? (
            <Empty>{t('ov.noForms')}</Empty>
          ) : (
            <div className="space-y-2">
              {forms.map((f) => (
                <Accordion
                  key={f.id}
                  title={f.name || f.id}
                  meta={`${f.tableName || '—'} · ${(f.fields || []).length} ${t('c.fields')}`}
                >
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <Badge tone="brand">{t('ov.formId')} {f.id}</Badge>
                    <Badge>{t('ov.physTable')} app_fd_{f.tableName}</Badge>
                  </div>
                  {(f.fields || []).length === 0 ? (
                    <p className="text-xs text-ink-400">{t('ov.noFields')}</p>
                  ) : (
                    <Table head={[t('th.fieldId'), t('th.label'), t('th.widget'), t('th.required'), t('th.options')]} dense>
                      {(f.fields || []).map((fl) => (
                        <tr key={fl.id}>
                          <Td mono>{fl.id}</Td>
                          <Td>{fl.label}</Td>
                          <Td>{fl.type}</Td>
                          <Td>{fl.mandatory ? <Badge tone="rose">{t('c.yes')}</Badge> : <span className="text-ink-300">{t('c.no')}</span>}</Td>
                          <Td className="max-w-[240px] truncate text-xs text-ink-500">{fl.options || '—'}</Td>
                        </tr>
                      ))}
                    </Table>
                  )}
                </Accordion>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title={t('ov.datalistsTitle', { n: datalists.length })} subtitle={t('ov.datalistsSub')}>
            {datalists.length === 0 ? (
              <Empty>{t('c.empty')}</Empty>
            ) : (
              <Table head={[t('c.name'), 'Binder', t('ov.bindForm')]} dense>
                {datalists.map((d) => (
                  <tr key={d.id}>
                    <Td>{d.name || d.id}</Td>
                    <Td mono className="text-[11px]">{d.binder || '—'}</Td>
                    <Td mono className="text-[11px]">{d.formDefId || '—'}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title={t('ov.menusTitle', { n: menus.length })}>
            {menus.length === 0 ? (
              <Empty>{t('c.empty')}</Empty>
            ) : (
              <div className="space-y-3">
                {(app.userviews || []).map((uv) => (
                  <div key={uv.id}>
                    <div className="mb-1.5 text-xs font-semibold text-ink-500">{uv.name || uv.id}</div>
                    <div className="space-y-1.5">
                      {(uv.categories || []).map((c) => (
                        <div key={c.category} className="flex items-start gap-2">
                          <Badge>{c.category || t('ov.uncategorized')}</Badge>
                          <div className="flex flex-wrap gap-1">
                            {(c.menus || []).map((m) => (
                              <span
                                key={m.customId || m.label}
                                className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] text-ink-600"
                              >
                                {m.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-ink-100 pb-1.5">
      <span className="w-24 shrink-0 text-xs text-ink-400">{k}</span>
      <span className={`text-sm text-ink-700 ${mono ? 'font-mono text-[12px]' : ''}`}>{v || '—'}</span>
    </div>
  );
}
