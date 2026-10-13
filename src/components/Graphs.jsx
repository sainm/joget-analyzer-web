import React, { useState } from 'react';
import { Card, Empty } from './ui.jsx';
import Mermaid from './Mermaid.jsx';
import { useI18n } from '../LangContext.jsx';
import { flowChart, erChart, impactChart, callGraphChart, menuChart } from '../lib/mermaidGraphs.js';

/** 视图清单只存 key，文案全部走词表（g.*） */
const VIEWS = [
  { key: 'flow', label: 'g.flow', hint: 'g.flowHint' },
  { key: 'er', label: 'g.er', hint: 'g.erHint' },
  { key: 'impact', label: 'g.impact', hint: 'g.impactHint' },
  { key: 'menu', label: 'g.menu', hint: 'g.menuHint' },
  { key: 'call', label: 'g.call', hint: 'g.callHint' },
];

export default function Graphs({ summary, manifest, correlation }) {
  const { t, lang } = useI18n();
  const [view, setView] = useState('flow');

  // 有联动结果时，调用关系图只画应用真正用到的部分
  const focusGraph = correlation && correlation.hasSource ? correlation.focusedCallGraph : null;

  const code = {
    flow: flowChart(summary.xpdl, lang),
    er: erChart(summary),
    impact: impactChart(summary, lang),
    menu: menuChart(summary, lang),
    call: callGraphChart(focusGraph ? { callGraph: focusGraph } : manifest, lang),
  }[view];

  const current = VIEWS.find((v) => v.key === view);

  return (
    <Card
      title={t(current.label)}
      subtitle={t(current.hint)}
      right={
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition ${
                view === v.key ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'
              }`}
            >
              {t(v.label)}
            </button>
          ))}
        </div>
      }
    >
      {!code ? (
        <Empty>{t('c.empty')}</Empty>
      ) : (
        <div className="rounded-lg border border-ink-200 bg-white p-2">
          <Mermaid code={code} />
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-600">{t('g.source')}</summary>
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
          {code}
        </pre>
      </details>
    </Card>
  );
}
