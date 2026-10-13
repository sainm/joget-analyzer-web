import React from 'react';
import { Card, Badge, Table, Td, Empty, Stat, Accordion } from './ui.jsx';
import Mermaid from './Mermaid.jsx';
import { callGraphChart } from '../lib/mermaidGraphs.js';
import { t } from '../i18n.js';

const CATS = [
  { key: 'custom', label: 'pl.catCustom', tone: 'amber', hint: 'pl.catCustomHint' },
  { key: 'marketplace', label: 'pl.catMarketplace', tone: 'brand', hint: 'pl.catMkHint' },
  { key: 'enterprise', label: 'pl.catEnterprise', tone: 'jade', hint: 'pl.catEntHint' },
  { key: 'builtin', label: 'pl.catBuiltin', tone: 'default', hint: 'pl.catBuiltinHint' },
];

export default function Plugins({ summary, manifest }) {
  const refs = summary.plugin_refs || {};
  const datasources = summary.datasources || [];
  const sqlTables = summary.sql_tables || {};

  const total = CATS.reduce((n, c) => n + Object.keys(refs[c.key] || {}).length, 0);
  const externalDs = datasources.filter((d) => d.external);
  const riskPlugins = Object.keys(refs.custom || {}).length + Object.keys(refs.marketplace || {}).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('pl.total')} value={total} tone="brand" />
        <Stat label={t('pl.custom')} value={Object.keys(refs.custom || {}).length} tone="rose" hint={t('pl.customHint')} />
        <Stat label={t('pl.extDs')} value={externalDs.length} tone="amber" />
        <Stat label={t('pl.outerTables')} value={Object.keys(sqlTables).length} tone="amber" hint={t('pl.outerHint')} />
      </div>

      {(riskPlugins > 0 || externalDs.length > 0 || Object.keys(sqlTables).length > 0) && (
        <Card title={t('pl.gapTitle')} subtitle={t('pl.gapSub')}>
          <ul className="space-y-2 text-sm">
            <GapItem show={Object.keys(refs.custom || {}).length > 0} tone="rose">
              {t('pl.gapCustom', { n: Object.keys(refs.custom || {}).length })}
            </GapItem>
            <GapItem show={Object.keys(refs.marketplace || {}).length > 0} tone="amber">
              {t('pl.gapMk', { n: Object.keys(refs.marketplace || {}).length })}
            </GapItem>
            <GapItem show={externalDs.length > 0} tone="amber">
              {t('pl.gapDs', { n: externalDs.length, list: externalDs.map((d) => d.name).join('、') })}
            </GapItem>
            <GapItem show={Object.keys(sqlTables).length > 0} tone="amber">
              {t('pl.gapTables', { n: Object.keys(sqlTables).length, list: Object.keys(sqlTables).join('、') })}
            </GapItem>
          </ul>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {CATS.map((c) => {
          const entries = Object.entries(refs[c.key] || {});
          return (
            <Card key={c.key} title={`${t(c.label)}（${entries.length}）`} subtitle={t(c.hint)}>
              {entries.length === 0 ? (
                <Empty>{t('pl.noRef')}</Empty>
              ) : (
                <div className="space-y-2">
                  {entries.map(([cls, info]) => (
                    <Accordion key={cls} title={cls.split('.').pop()} meta={t('im.sites', { n: info.occurrences })}>
                      <div className="space-y-1.5 text-xs">
                        <div className="font-mono text-[11px] text-ink-500">{cls}</div>
                        <div className="flex flex-wrap gap-1">
                          {(info.usedIn || []).map((u, i) => (
                            <Badge key={i}>{u}</Badge>
                          ))}
                        </div>
                      </div>
                    </Accordion>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card title={t('pl.dsTitle', { n: datasources.length })}>
          {datasources.length === 0 ? (
            <Empty>{t('pl.dsEmpty')}</Empty>
          ) : (
            <Table head={[t('c.name'), t('c.type'), t('c.refs')]} dense>
              {datasources.map((d) => (
                <tr key={d.name}>
                  <Td mono className="text-[12px]">{d.name}</Td>
                  <Td>{d.external ? <Badge tone="amber">{t('pl.dsExternal')}</Badge> : <Badge>{t('pl.dsDefault')}</Badge>}</Td>
                  <Td>{d.refs}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title={t('pl.outerTables') + `（${Object.keys(sqlTables).length}）`} subtitle={t('pl.outerHint')}>
          {Object.keys(sqlTables).length === 0 ? (
            <Empty>{t('pl.outerEmpty')}</Empty>
          ) : (
            <div className="space-y-2">
              {Object.entries(sqlTables).map(([tb, sqls]) => (
                <Accordion key={tb} title={tb} meta={t('im.sites', { n: sqls.length })}>
                  <ul className="space-y-1.5">
                    {sqls.map((s, i) => (
                      <li key={i}>
                        <code className="block rounded bg-ink-50 px-2 py-1 text-[11px] text-ink-600">{s}</code>
                      </li>
                    ))}
                  </ul>
                </Accordion>
              ))}
            </div>
          )}
        </Card>
      </div>

      {manifest && !manifest.error && (
        <>
          <Card
            title={t('pl.srcTitle')}
            subtitle={manifest.pom?.artifactId ? `${manifest.pom.groupId}:${manifest.pom.artifactId}:${manifest.pom.version}` : manifest.sourceDir}
          >
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('pl.components')} value={(manifest.components || []).length} tone="brand" />
              <Stat label={t('pl.utilities')} value={(manifest.utilities || []).length} tone="jade" />
              <Stat label={t('pl.activators')} value={(manifest.activators || []).length} tone="amber" />
              <Stat label={t('pl.msgKeys')} value={Object.keys(manifest.messages || {}).length} />
            </div>
            <div className="space-y-2">
              {(manifest.components || []).map((c) => (
                <Accordion
                  key={c.class}
                  title={c.class.split('.').pop()}
                  meta={`${c.methodCount} ${t('c.methods')} · ${t('pl.configItems', { n: (c.configProperties || []).length })}`}
                >
                  <div className="space-y-2">
                    <div className="font-mono text-[11px] text-ink-500">{c.class}</div>
                    <div className="text-[11px] text-ink-400">{c.file}</div>
                    {(c.configProperties || []).length > 0 ? (
                      <Table head={['ID', t('th.label'), t('c.type'), t('c.required')]} dense>
                        {c.configProperties.map((p, i) => (
                          <tr key={i}>
                            <Td mono className="text-[11px]">{p.name}</Td>
                            <Td className="text-xs">{p.label || '—'}</Td>
                            <Td className="text-xs text-ink-500">{p.type || '—'}</Td>
                            <Td>{p.required ? <Badge tone="rose">{t('c.yes')}</Badge> : ''}</Td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <p className="text-xs text-ink-400">{t('pl.noProps')}</p>
                    )}
                  </div>
                </Accordion>
              ))}
            </div>
          </Card>

          <Card title={t('pl.callTitle')} subtitle={t('pl.callSub')}>
            <Mermaid code={callGraphChart(manifest)} />
          </Card>
        </>
      )}
    </div>
  );
}

function GapItem({ show, children, tone }) {
  if (!show) return null;
  const bar = tone === 'rose' ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50';
  return (
    <li className={`rounded-lg border px-3 py-2 text-[13px] leading-relaxed text-ink-700 ${bar}`}>
      <span className="mr-1.5 text-amber-500">⚠</span>
      {children}
    </li>
  );
}
