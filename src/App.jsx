import React, { useEffect, useMemo, useState } from 'react';
import { analyze, analyzeProject, listRuns, getRun } from './lib/api.js';
import { t } from './i18n.js';
import { buildObjectModel, OBJ, objTypeLabel } from './lib/objectModel.js';
import { NAV, SideNav, ToolBar, PageHead } from './components/Shell.jsx';
import Uploader from './components/Uploader.jsx';
import SystemOverview from './components/SystemOverview.jsx';
import ObjectExplorer from './components/ObjectExplorer.jsx';
import ProcessPage from './components/ProcessPage.jsx';
import DataModelPage from './components/DataModelPage.jsx';
import RelationExplorer from './components/RelationExplorer.jsx';
import CheckCenter from './components/CheckCenter.jsx';
import QualityCenter from './components/QualityCenter.jsx';
import DesignCenter from './components/DesignCenter.jsx';
import Plugins from './components/Plugins.jsx';
import Correlation from './components/Correlation.jsx';
import { EmptyNote } from './components/Common.jsx';

/**
 * 画面の入口。
 *
 * 解析結果的心理モデル（app_summary / plugin_manifest / correlation）は
 * そのまま受け取り、派生はこの層の objectModel に一度だけ行う。
 * 各画面は同じ model を読むため、画面間で結論が食い違うことはない。
 */
export default function App() {
  const [runs, setRuns] = useState([]);
  const [data, setData] = useState(null);
  const [view, setView] = useState({ key: 'overview' });
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
  }, []);

  const model = useMemo(() => {
    if (!data?.summary) return null;
    return buildObjectModel({ summary: data.summary, correlation: data.correlation });
  }, [data]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      setData(res);
      setView({ key: 'overview' });
      setSelected(null);
      setSearch('');
      listRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const handleAnalyze = ({ jwa, pluginFiles }) => run(() => analyze({ jwa, pluginFiles }));
  const handleAnalyzeProject = ({ path: p }) => run(() => analyzeProject({ path: p }));
  const handleOpenRun = (id) => run(() => getRun(id));

  // オブジェクト詳細への遷移は、どの画面からでも同じ入口を通す
  function goToObject(key) {
    const obj = model?.byKey.get(key);
    if (!obj) return;
    setSelected(key);
    const navKey =
      obj.type === OBJ.PROCESS || obj.type === OBJ.ACTIVITY ? 'process'
        : obj.type === OBJ.TABLE || obj.type === OBJ.COLUMN || obj.type === OBJ.SQL || obj.type === OBJ.DATASOURCE ? 'datamodel'
          : obj.type === OBJ.PLUGIN ? 'plugins'
            : obj.type === OBJ.MENU ? 'menus'
              : obj.type === OBJ.FORM || obj.type === OBJ.FIELD ? 'forms'
                : obj.type === OBJ.LIST ? 'lists'
                  : 'objects';
    setView({ key: navKey });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigate(next) {
    setView(next);
    if (next.key !== 'objects') setSelected(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const hasCorrelation = !!data?.correlation && data.correlation.hasSource;
  const counts = model
    ? {
        quality: model.unconfirmed.length || undefined,
        objects: model.stats.total,
        menus: model.stats.byType[OBJ.MENU] || undefined,
        forms: model.stats.byType[OBJ.FORM] || undefined,
        lists: model.stats.byType[OBJ.LIST] || undefined,
        process: model.stats.byType[OBJ.PROCESS] || undefined,
        datamodel: model.stats.byType[OBJ.TABLE] || undefined,
        plugins: model.stats.byType[OBJ.PLUGIN] || undefined,
        checks: model.stats.checks.error + model.stats.checks.warn || undefined,
      }
    : {};

  if (!data) {
    return (
      <div className="min-h-full">
        <TopBarOnly onReanalyze={() => {}} />
        <main className="mx-auto max-w-[1100px] px-5 py-8">
          {error && (
            <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              <b>{t('app.failed')}</b> {error}
            </div>
          )}
          <Uploader onAnalyze={handleAnalyze} onAnalyzeProject={handleAnalyzeProject} busy={busy} runs={runs} onOpenRun={handleOpenRun} />
          {busy && <div className="mt-5 overflow-hidden rounded-full bg-ink-100"><div className="h-1.5 w-1/3 animate-pulse rounded-full bg-brand-500" /></div>}
        </main>
      </div>
    );
  }

  const summary = data.summary;
  const globalHits = search.trim() ? searchAll(model, search.trim()) : [];

  return (
    <div className="flex h-screen flex-col">
      <ToolBar
        meta={data.meta}
        search={search}
        onSearch={setSearch}
        onReanalyze={() => { setData(null); setError(''); }}
        canSearch
      />

      {/* 検索結果は、どの画面からでも同じ候補一覧として出す */}
      {search.trim() && (
        <div data-testid="global-search-results" className="max-h-[168px] shrink-0 overflow-y-auto border-b border-ink-200 bg-white px-5 py-2">
          {globalHits.length === 0 ? (
            <div className="py-2 text-[12px] text-ink-400">{t('sh.noResults')}</div>
          ) : (
            <>
              <div className="mb-1 text-[11px] text-ink-400">
                {t('sh.results')} {globalHits.length} 件
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {globalHits.slice(0, 40).map((o) => (
                  <li key={o.key}>
                    <button
                      onClick={() => { setSearch(''); goToObject(o.key); }}
                      className="flex items-center gap-1.5 rounded-md border border-ink-200 px-2 py-1 text-[12px] text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <span className="rounded bg-ink-100 px-1 text-[10px] text-ink-500">{objTypeLabel(o.type)}</span>
                      <span className="max-w-[220px] truncate">{o.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:block">
          <SideNav view={view} onChange={navigate} counts={counts} />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] px-5 py-5">
            {error && (
              <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                <b>{t('app.failed')}</b> {error}
              </div>
            )}
            {summary?.noApp && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{t('app.noApp')}</div>
            )}
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );

  function renderView() {
    if (!model) return <EmptyNote>解析結果を読み込んでいます。</EmptyNote>;
    switch (view.key) {
      case 'overview':
        return <SystemOverview model={model} summary={summary} onNavigate={navigate} onSelectObject={goToObject} />;
      case 'objects':
      case 'menus':
      case 'forms':
      case 'lists':
        return (
          <ObjectExplorer
            model={model}
            view={navMeta(view.key)}
            selectedKey={selected}
            onSelect={setSelected}
          />
        );
      case 'process':
        return <ProcessPage model={model} summary={summary} onSelectObject={goToObject} />;
      case 'datamodel':
        return <DataModelPage model={model} summary={summary} manifest={data.manifest} onSelectObject={goToObject} />;
      case 'plugins':
        return hasCorrelation ? (
          <div className="space-y-4">
            <PageHead title={t('nav.plugins')} lead="アプリが参照するプラグインと、同一プロジェクト内のソース定義を突き合わせた結果です。ソース未提供のクラスはプラットフォーム標準として分離しています。" />
            <Plugins summary={summary} manifest={data.manifest} />
            <Correlation correlation={data.correlation} />
          </div>
        ) : (
          <>
            <PageHead title={t('nav.plugins')} lead="この解析にはプラグインソースが含まれていません。プラットフォーム標準クラスとの突合は行えません。" />
            <Plugins summary={summary} manifest={data.manifest} />
          </>
        );
      case 'relations':
        return <RelationExplorer model={model} onSelectObject={goToObject} />;
      case 'checks':
        return <CheckCenter model={model} onSelectObject={goToObject} />;
      case 'quality':
        return <QualityCenter model={model} onSelectObject={goToObject} />;
      case 'doc':
        return (
          <DesignCenter
            designDoc={data.designDoc}
            runId={data.meta?.id}
            model={model}
            artifacts={data.artifacts}
            chunks={data.chunks}
            chunkStats={data.chunkStats}
            onSelectObject={goToObject}
          />
        );
      default:
        return <SystemOverview model={model} summary={summary} onNavigate={navigate} onSelectObject={goToObject} />;
    }
  }
}

/** 種別固定の入口ごとの見出し */
function navMeta(key) {
  return {
    menus: { type: OBJ.MENU, title: t('nav.menus'), lead: 'ユーザー入口の一覧です。ターゲットを持たない種別は、画面の実態が静的には確認できないため「未確認」と表示します。' },
    forms: { type: OBJ.FORM, title: t('nav.forms'), lead: 'フォーム定義と項目の一覧です。項目を選ぶと、規約で生成されるカラムとの対応を確認できます。' },
    lists: { type: OBJ.LIST, title: t('nav.lists'), lead: 'データリストの列定義・絞り込み条件・並べ替え・ページング設定です。実行時に組み立てられるクエリは取得できません。' },
  }[key];
}

/** 解析前の画面で使う、簡略化したヘッダ */
function TopBarOnly({ onReanalyze }) {
  return (
    <header className="shrink-0 border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-[1100px] items-center gap-2.5 px-5 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-500 text-[13px] font-bold text-white">J</div>
        <div className="leading-tight">
          <h1 className="text-[14px] font-bold text-ink-900">{t('app.title')}</h1>
          <p className="text-[10px] text-ink-400">{t('app.subtitle')}</p>
        </div>
      </div>
    </header>
  );
}

/** 全局検索。名称・ID・要約・関連先を対象にする */
function searchAll(model, needle) {
  const n = needle.toLowerCase();
  return model.objects.filter(
    (o) =>
      o.name.toLowerCase().includes(n) ||
      o.id.toLowerCase().includes(n) ||
      o.brief.toLowerCase().includes(n) ||
      o.attrs.some((a) => String(a.v).toLowerCase().includes(n)),
  );
}