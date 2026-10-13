import React, { useMemo, useState } from 'react';
import { Card, Badge, Stat, Empty } from './ui.jsx';
import { downloadUrl } from '../lib/api.js';
import { useI18n } from '../LangContext.jsx';

/** 分块类型 → i18n key（词表里以 ct.<type> 维护） */
const TYPE_KEY = (type) => `ct.${type}`;

export default function Chunks({ chunks, chunkStats, runId }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const types = useMemo(() => {
    const s = new Set((chunks || []).map((c) => c.type));
    return ['all', ...Array.from(s)];
  }, [chunks]);

  const list = useMemo(() => {
    return (chunks || []).filter((c) => {
      if (filter !== 'all' && c.type !== filter) return false;
      if (q && !`${c.title} ${c.content}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [chunks, filter, q]);

  if (!chunks || !chunks.length) {
    return (
      <Card title={t('tab.chunks')}>
        <Empty>{t('r.empty')}</Empty>
      </Card>
    );
  }

  const typeName = (tp) => {
    const key = TYPE_KEY(tp);
    const label = t(key);
    return label === key ? tp : label;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('r.count')} value={chunkStats?.count ?? chunks.length} tone="brand" />
        <Stat label={t('r.chars')} value={(chunkStats?.totalChars ?? 0).toLocaleString()} tone="jade" />
        <Stat label={t('r.types')} value={Object.keys(chunkStats?.byType || {}).length} />
        <Stat label={t('r.avg')} value={Math.round((chunkStats?.totalChars || 0) / (chunkStats?.count || 1))} />
      </div>

      <Card
        title={t('r.browse')}
        subtitle={t('r.browseSub')}
        right={
          runId && (
            <a
              href={downloadUrl(runId, 'rag_chunks.jsonl')}
              className="rounded-md bg-ink-800 px-3 py-1 text-xs font-medium text-white transition hover:bg-ink-900"
            >
              {t('r.download')}
            </a>
          )
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {types.map((tp) => (
            <button
              key={tp}
              onClick={() => setFilter(tp)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                filter === tp ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              {tp === 'all'
                ? t('r.all', { n: chunks.length })
                : `${typeName(tp)} ${chunkStats?.byType?.[tp] ?? ''}`}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('r.search')}
            className="ml-auto w-52 rounded-md border border-ink-200 px-2.5 py-1 text-xs outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-100"
          />
        </div>

        {list.length === 0 ? (
          <Empty>{t('r.noMatch')}</Empty>
        ) : (
          <div className="space-y-2">
            {list.map((c) => (
              <details key={c.chunk_id} className="overflow-hidden rounded-lg border border-ink-200">
                <summary className="flex cursor-pointer items-center gap-2 bg-ink-50 px-3 py-2 text-sm hover:bg-ink-100">
                  <Badge tone="brand">{typeName(c.type)}</Badge>
                  <span className="truncate font-medium text-ink-700">{c.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-400">{t('r.charsUnit', { n: c.chars })}</span>
                </summary>
                <div className="border-t border-ink-100 p-3">
                  <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink-600">{c.content}</pre>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2">
                    <code className="text-[10px] text-ink-400">{c.chunk_id}</code>
                    {Object.entries(c.metadata || {})
                      .filter(([k]) => !['appId', 'appName'].includes(k))
                      .map(([k, v]) => (
                        <Badge key={k}>
                          {k}={String(v).slice(0, 28)}
                        </Badge>
                      ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
