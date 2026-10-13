import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { Card } from './ui.jsx';
import { downloadUrl } from '../lib/api.js';
import { useI18n, docLang } from '../LangContext.jsx';

marked.setOptions({ gfm: true, breaks: false });

export default function DesignDoc({ designDoc, runId }) {
  const { t, lang } = useI18n();
  // 默认跟随全局界面语言；用户手动切换后临时覆盖，界面语言再变时回到跟随
  const [override, setOverride] = useState(null);
  useEffect(() => setOverride(null), [lang]);
  const docLangKey = override || docLang(lang);

  const md = (designDoc && designDoc[docLangKey]) || '';
  const html = useMemo(() => (md ? marked.parse(md) : ''), [md]);

  const lines = md ? md.split('\n').length : 0;
  const chars = md.length;

  const downloadName = docLangKey === 'ja' ? 'design_doc_ja.md' : 'design_doc_zh.md';

  return (
    <Card
      title={t('d.title')}
      subtitle={md ? t('d.sub', { l: lines, c: chars.toLocaleString() }) : t('d.empty')}
      right={
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-ink-200">
            {[
              { k: 'zh', l: t('d.zh') },
              { k: 'ja', l: t('d.ja') },
            ].map((x) => (
              <button
                key={x.k}
                onClick={() => setOverride(x.k)}
                className={`whitespace-nowrap px-3 py-1 text-xs font-medium transition ${
                  docLangKey === x.k ? 'bg-brand-500 text-white' : 'bg-white text-ink-600 hover:bg-ink-50'
                }`}
              >
                {x.l}
              </button>
            ))}
          </div>
          {runId && (
            <a
              href={downloadUrl(runId, downloadName)}
              className="rounded-md bg-ink-800 px-3 py-1 text-xs font-medium text-white transition hover:bg-ink-900"
            >
              {t('d.download')}
            </a>
          )}
        </div>
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
