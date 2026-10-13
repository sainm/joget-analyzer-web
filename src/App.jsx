import React, { useEffect, useState } from 'react';
import { analyze, analyzeProject, listRuns, getRun, downloadUrl } from './lib/api.js';
import { useI18n } from './LangContext.jsx';
import { LANGS } from './i18n.js';
import Uploader from './components/Uploader.jsx';
import Overview from './components/Overview.jsx';
import Impact from './components/Impact.jsx';
import Plugins from './components/Plugins.jsx';
import Correlation from './components/Correlation.jsx';
import Graphs from './components/Graphs.jsx';
import DesignDoc from './components/DesignDoc.jsx';
import Chunks from './components/Chunks.jsx';

/** 页签只声明 key 与显隐条件，文案统一走 tab.<key> */
const TABS = [
  { key: 'overview' },
  { key: 'impact' },
  { key: 'correlation', needCorrelation: true },
  { key: 'plugins' },
  { key: 'graphs' },
  { key: 'doc' },
  { key: 'chunks' },
];

export default function App() {
  const { t, lang } = useI18n();
  const [runs, setRuns] = useState([]);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
  }, []);

  async function handleAnalyze({ jwa, pluginFiles }) {
    setBusy(true);
    setError('');
    try {
      const res = await analyze({ jwa, pluginFiles, lang });
      setData(res);
      setTab('overview');
      listRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAnalyzeProject({ path: p }) {
    setBusy(true);
    setError('');
    try {
      const res = await analyzeProject({ path: p, lang });
      setData(res);
      setTab('overview');
      listRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRun(id) {
    setBusy(true);
    setError('');
    try {
      const res = await getRun(id);
      setData(res);
      setTab('overview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const summary = data?.summary;
  const hasCorrelation = !!(data?.correlation && data.correlation.hasSource);
  const tabs = TABS.filter((t) => !t.needCorrelation || hasCorrelation);
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-sm font-bold text-white">J</div>
            <div>
              <h1 className="whitespace-nowrap text-[15px] font-bold leading-tight text-ink-900">{t('app.title')}</h1>
              <p className="text-[11px] leading-tight text-ink-400">{t('app.subtitle')}</p>
            </div>
          </div>

          <LangSwitch />

          {data && (
            <>
              <nav className="ml-2 hidden gap-1 lg:flex">
                {tabs.map((x) => (
                  <button
                    key={x.key}
                    onClick={() => setTab(x.key)}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                      activeTab === x.key ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-700'
                    }`}
                  >
                    {t(`tab.${x.key}`)}
                  </button>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <div className="text-[13px] font-semibold text-ink-700">{data.meta?.appName}</div>
                  <div className="max-w-[380px] truncate text-[11px] text-ink-400" title={data.meta?.inputPath || data.meta?.jwaName}>
                    {data.meta?.elapsedMs}ms · {data.meta?.source === 'local' ? data.meta?.inputPath : data.meta?.jwaName}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setData(null);
                    setError('');
                  }}
                  className="shrink-0 rounded-md border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:bg-ink-50"
                >
                  {t('app.reanalyze')}
                </button>
              </div>
            </>
          )}
        </div>

        {data && (
          <div className="flex gap-1 overflow-auto border-t border-ink-100 px-5 py-2 lg:hidden">
            {tabs.map((x) => (
              <button
                key={x.key}
                onClick={() => setTab(x.key)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition ${
                  activeTab === x.key ? 'bg-brand-50 text-brand-700' : 'text-ink-500'
                }`}
              >
                {t(`tab.${x.key}`)}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-5 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <b>{t('app.failed')}</b>
            {error}
          </div>
        )}

        {!data ? (
          <>
            <Uploader
              onAnalyze={handleAnalyze}
              onAnalyzeProject={handleAnalyzeProject}
              busy={busy}
              runs={runs}
              onOpenRun={handleOpenRun}
            />
            {busy && <LoadingBar />}
          </>
        ) : (
          <>
            {summary?.noApp && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {t('app.noApp')}
              </div>
            )}
            <Artifacts artifacts={data.artifacts} runId={data.meta?.id} />
            <div className="mt-5">
              {activeTab === 'overview' && <Overview summary={summary} stats={data.stats || data.meta?.stats} />}
              {activeTab === 'impact' && <Impact summary={summary} />}
              {activeTab === 'correlation' && hasCorrelation && <Correlation correlation={data.correlation} manifest={data.manifest} />}
              {activeTab === 'plugins' && <Plugins summary={summary} manifest={data.manifest} />}
              {activeTab === 'graphs' && <Graphs summary={summary} manifest={data.manifest} correlation={data.correlation} />}
              {activeTab === 'doc' && <DesignDoc designDoc={data.designDoc} runId={data.meta?.id} />}
              {activeTab === 'chunks' && (
                <Chunks chunks={data.chunks} chunkStats={data.chunkStats} runId={data.meta?.id} />
              )}
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-[1400px] px-5 pb-10 text-center text-[11px] text-ink-300">
        {t('app.footer')}
      </footer>
    </div>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border border-ink-200">
      {LANGS.map((l) => (
        <button
          key={l.key}
          onClick={() => setLang(l.key)}
          className={`whitespace-nowrap px-2.5 py-1 text-[11px] font-medium transition ${
            lang === l.key ? 'bg-ink-800 text-white' : 'bg-white text-ink-500 hover:bg-ink-50'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function Artifacts({ artifacts, runId }) {
  const { t } = useI18n();
  if (!artifacts || !artifacts.length) return null;
  const fmt = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-3">
      <span className="text-xs font-semibold text-ink-500">{t('app.artifacts')}</span>
      {artifacts.map((a) => (
        <a
          key={a.name}
          href={downloadUrl(runId, a.name)}
          className="group inline-flex items-center gap-1.5 rounded-md border border-ink-200 px-2.5 py-1 text-[12px] text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
          title={a.name}
        >
          <span>{ARTIFACT_LABEL[a.name] ? t(ARTIFACT_LABEL[a.name]) : a.label}</span>
          <span className="text-[10px] text-ink-300 group-hover:text-brand-300">{fmt(a.size)}</span>
        </a>
      ))}
    </div>
  );
}

const ARTIFACT_LABEL = {
  'app_summary.json': 'art.appSummary',
  'analysis_inputs.json': 'art.gapTemplate',
  'design_doc_zh.md': 'art.docZh',
  'design_doc_ja.md': 'art.docJa',
  'rag_chunks.jsonl': 'art.chunks',
  'plugin_manifest.json': 'art.manifest',
  'correlation.json': 'art.correlation',
};

function LoadingBar() {
  return (
    <div className="mt-5 overflow-hidden rounded-full bg-ink-100">
      <div className="h-1.5 w-1/3 animate-pulse rounded-full bg-brand-500" />
    </div>
  );
}
