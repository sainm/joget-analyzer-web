import React, { useMemo } from 'react';
import { marked } from 'marked';
import { Card } from './ui.jsx';
import { downloadUrl } from '../lib/api.js';
import { t } from '../i18n.js';

marked.setOptions({ gfm: true, breaks: false });

/** 解析結果から生成した設計書（Markdown）を表示する。成果物は design_doc.md の 1 点のみ */
export default function DesignDoc({ designDoc, runId }) {
  const md = designDoc || '';
  const html = useMemo(() => (md ? marked.parse(md) : ''), [md]);

  const lines = md ? md.split('\n').length : 0;
  const chars = md.length;

  return (
    <Card
      title={t('d.title')}
      subtitle={md ? t('d.sub', { l: lines, c: chars.toLocaleString() }) : t('d.empty')}
      right={
        runId && (
          <a
            href={downloadUrl(runId, 'design_doc.md')}
            className="rounded-md bg-ink-800 px-3 py-1 text-xs font-medium text-white transition hover:bg-ink-900"
          >
            {t('d.download')}
          </a>
        )
      }
    >
      {!md ? (
        <p className="py-6 text-center text-sm text-ink-400">{t('d.noContent')}</p>
      ) : (
        <div className="doc-md max-h-[75vh] overflow-auto pr-2" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </Card>
  );
}
