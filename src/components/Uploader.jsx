import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Badge } from './ui.jsx';
import { listDir, discover } from '../lib/api.js';
import { t } from '../i18n.js';

const fmtSize = (n) => (!n ? '0 B' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

/** 前回解析したパス：リロード後に復元するが、既定ではツール自身のディレクトリを指さない */
const LAST_PATH_KEY = 'joget-analyzer-last-path';

/* ── ディレクトリ選択 ───────────────────────────────────────────── */
function DirPicker({ onPick, onClose }) {
  const [cur, setCur] = useState(null);
  const [loading, setLoading] = useState(false);
  const [goto, setGoto] = useState('');

  const load = useCallback((p) => {
    setLoading(true);
    listDir(p)
      .then((d) => {
        setCur(d);
        setGoto(d.path);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(''); }, [load]);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => cur?.parent && load(cur.parent)}
          disabled={!cur?.parent}
          className="shrink-0 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-600 hover:bg-ink-50 disabled:opacity-40"
        >
          {t('up.dirUp')}
        </button>
        <input
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(goto)}
          className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 py-1 font-mono text-[11px] text-ink-600 outline-none focus:border-brand-300"
        />
        <button onClick={() => load(goto)} className="shrink-0 rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-600 hover:bg-ink-50">
          {t('up.dirGo')}
        </button>
        <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-400 hover:text-ink-600">
          {t('up.dirClose')}
        </button>
      </div>

      {loading && <div className="py-3 text-center text-xs text-ink-400">{t('up.dirLoading')}</div>}

      {cur && !loading && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onPick(cur.path)}
              className="rounded-md bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
            >
              {t('up.dirPick')}
            </button>
            <span className="text-[11px] text-ink-500">
              {t('up.dirCounts', { n: cur.dirs.length })}
              {cur.jwas.length > 0 && ` · ${t('up.dirHasJwa', { n: cur.jwas.length })}`}
              {cur.isMavenRoot && ` · ${t('up.dirHasPom')}`}
            </span>
          </div>
          <ul className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-ink-200 bg-white p-1">
            {cur.dirs.length === 0 && cur.jwas.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-ink-400">{t('up.dirEmpty')}</li>
            )}
            {cur.dirs.map((d) => (
              <li key={d.path}>
                <button
                  onClick={() => load(d.path)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-ink-700 hover:bg-brand-50"
                >
                  <span className="text-ink-400">📁</span>
                  <span className="truncate">{d.name}</span>
                  {d.maven && <Badge tone="jade">Maven</Badge>}
                  {d.jwa > 0 && <Badge tone="brand">{d.jwa} .jwa</Badge>}
                </button>
              </li>
            ))}
            {cur.jwas.map((j) => (
              <li key={j.path}>
                <button
                  onClick={() => onPick(j.path)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-ink-700 hover:bg-brand-50"
                >
                  <span className="text-ink-400">📦</span>
                  <span className="truncate">{j.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-ink-400">{fmtSize(j.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ── 事前確認の結果 ─────────────────────────────────────────────── */
function Preview({ info, onPickProject }) {
  if (!info) return null;
  if (info.kind === 'missing' || info.kind === 'invalid' || (info.kind === 'file' && !info.jwaFiles.length)) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{info.error || '—'}</div>;
  }
  // 複数プロジェクトの併存：勝手に 1 つを選ばず、ユーザーに明示指定させる（プロジェクト間の混在を防ぐ）
  if (info.ambiguous) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="text-xs text-amber-700">{t('up.ambiguous', { n: info.projects.length })}</div>
        <div className="mt-2 space-y-1">
          {info.projects.map((g) => (
            <button
              key={g.root}
              onClick={() => onPickProject && onPickProject(g.root)}
              className="block w-full truncate rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-left font-mono text-[11px] text-ink-700 transition hover:border-brand-300 hover:bg-brand-50"
              title={g.root}
            >
              {g.root}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="truncate font-mono text-[11px] text-ink-500">{info.projectRoot || info.root}</span>
        {info.projectRoot && info.projectRoot !== info.root && (
          <span className="shrink-0 rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-400">
            {t('up.scopedNotice')}
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
          <div className="text-[11px] text-ink-400">{t('up.jwaSection')}</div>
          {info.jwaFiles.length === 0 ? (
            <div className="mt-0.5 text-[12px] text-amber-500">{t('up.noJwa')}</div>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {info.jwaFiles.slice(0, 4).map((j) => (
                <li key={j.rel} className="truncate font-mono text-[11px] text-ink-700">
                  {j.rel} <span className="text-ink-400">{fmtSize(j.size)}</span>
                </li>
              ))}
              {info.jwaFiles.length > 1 && (
                <li className="text-[11px] text-ink-400">{t('up.multiJwa', { n: info.jwaFiles.length })}</li>
              )}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-ink-100 bg-ink-50 px-3 py-2">
          <div className="text-[11px] text-ink-400">{t('up.mavenSection')}</div>
          {!info.maven ? (
            <div className="mt-0.5 text-[12px] text-ink-400">{t('up.noMaven')}</div>
          ) : (
            <ul className="mt-0.5 space-y-0.5 font-mono text-[11px] text-ink-700">
              <li className="truncate">{info.maven.root}</li>
              <li className="text-ink-500">
                {t('up.mavenStats', { j: info.maven.javaFiles, p: info.maven.propertyFiles, m: info.maven.messageFiles })}
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── アップロード領域 ───────────────────────────────────────────── */
function DropZone({ label, hint, accept, files, onFiles, multiple }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const handle = useCallback((fl) => {
    const arr = Array.from(fl || []);
    if (arr.length) onFiles(multiple ? arr : [arr[0]]);
  }, [onFiles, multiple]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current && inputRef.current.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed px-5 py-6 text-center transition ${
        over ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-ink-50 hover:border-brand-300 hover:bg-brand-50/40'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => handle(e.target.files)} />
      <div className="text-sm font-semibold text-ink-700">{label}</div>
      <div className="mt-1 text-xs text-ink-400">{hint}</div>
      {files && files.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {files.map((f) => (
            <Badge key={f.name} tone="brand">{f.name} · {fmtSize(f.size)}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── メインコンポーネント ───────────────────────────────────────── */
export default function Uploader({ onAnalyze, onAnalyzeProject, busy, runs, onOpenRun }) {
  const [mode, setMode] = useState('local');
  const [pathInput, setPathInput] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [info, setInfo] = useState(null);
  const [checking, setChecking] = useState(false);

  const [jwa, setJwa] = useState([]);
  const [plugins, setPlugins] = useState([]);

  // 既定ではツール自身のディレクトリを指さない：前回解析したパスを優先し、無ければ空のままにする
  useEffect(() => {
    let last = '';
    try { last = localStorage.getItem(LAST_PATH_KEY) || ''; } catch (e) { /* ignore */ }
    if (!last) return;
    setPathInput(last);
    discover(last).then(setInfo).catch(() => {});
    // マウント時に 1 度だけ実行する（言語切替で再確認は不要）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = (p) => {
    if (!p || !p.trim()) return;
    setChecking(true);
    discover(p).then(setInfo).catch(() => setInfo(null)).finally(() => setChecking(false));
  };

  const startLocal = (p) => {
    try { localStorage.setItem(LAST_PATH_KEY, p); } catch (e) { /* ignore */ }
    onAnalyzeProject({ path: p });
  };

  const canLocal =
    !!info && info.kind !== 'missing' && info.kind !== 'invalid' && !info.ambiguous &&
    (info.projects || []).length > 0 && !busy;
  const canUpload = jwa.length === 1 && !busy;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1">
        {[
          { k: 'local', l: 'mode.local', d: 'mode.local.desc' },
          { k: 'upload', l: 'mode.upload', d: 'mode.upload.desc' },
        ].map((m) => (
          <button
            key={m.k}
            onClick={() => setMode(m.k)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-left transition ${
              mode === m.k ? 'bg-brand-50 ring-1 ring-brand-100' : 'hover:bg-ink-50'
            }`}
          >
            <div className={`text-sm font-semibold ${mode === m.k ? 'text-brand-700' : 'text-ink-600'}`}>{t(m.l)}</div>
            <div className="mt-0.5 text-[11px] text-ink-400">{t(m.d)}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {mode === 'local' ? (
          <Card title={t('up.localTitle')} subtitle={t('up.localSubtitle')}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && check(pathInput)}
                  placeholder={t('up.placeholder')}
                  className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2.5 font-mono text-[12px] text-ink-700 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-50"
                />
                <button
                  onClick={() => check(pathInput)}
                  title={t('up.detectTitle')}
                  className="shrink-0 rounded-lg border border-ink-200 px-3 py-2.5 text-sm text-ink-600 hover:bg-ink-50"
                >
                  {t('up.detect')}
                </button>
                <button
                  onClick={() => setShowPicker((v) => !v)}
                  className="shrink-0 rounded-lg border border-ink-200 px-3 py-2.5 text-sm text-ink-600 hover:bg-ink-50"
                >
                  {t('up.browse')}
                </button>
              </div>

              {showPicker && (
                <DirPicker
                  onClose={() => setShowPicker(false)}
                  onPick={(p) => {
                    setPathInput(p);
                    setShowPicker(false);
                    check(p);
                  }}
                />
              )}

              {/* 高さを固定：事前確認の結果が出入りしてもボタンが動かず、クリックが外れないようにする */}
              <div className="min-h-[104px]">
                {checking ? (
                  <div className="flex h-[104px] items-center justify-center text-xs text-ink-400">{t('up.checking')}</div>
                ) : (
                  <Preview
                    info={info}
                    onPickProject={(r) => {
                      setPathInput(r);
                      check(r);
                    }}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={!canLocal}
                  onClick={() => startLocal(pathInput)}
                  className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                    canLocal ? 'bg-brand-500 hover:bg-brand-600' : 'cursor-not-allowed bg-ink-300'
                  }`}
                >
                  {busy ? t('up.running') : t('up.start')}
                </button>
                <span className="text-xs text-ink-400">
                  {info?.kind === 'missing' ? t('up.noPath') : t('up.localHint')}
                </span>
              </div>
            </div>
          </Card>
        ) : (
          <Card title={t('up.uploadTitle')} subtitle={t('up.uploadSubtitle')}>
            <div className="space-y-4">
              <DropZone
                label={t('up.dropJwa')}
                hint={t('up.dropJwaHint')}
                accept=".jwa,.zip"
                files={jwa}
                onFiles={setJwa}
              />
              <DropZone
                label={t('up.dropPlugin')}
                hint={t('up.dropPluginHint')}
                accept=".zip"
                files={plugins}
                onFiles={setPlugins}
                multiple
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  disabled={!canUpload}
                  onClick={() => onAnalyze({ jwa: jwa[0], pluginFiles: plugins })}
                  className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                    canUpload ? 'bg-brand-500 hover:bg-brand-600' : 'cursor-not-allowed bg-ink-300'
                  }`}
                >
                  {busy ? t('up.running') : t('up.start')}
                </button>
                <span className="text-xs text-ink-400">
                  {jwa.length !== 1 ? t('up.needJwa') : t('up.localHint')}
                </span>
              </div>
            </div>
          </Card>
        )}

        <Card title={t('up.history')} subtitle={t('up.historyCount', { n: (runs || []).length })}>
          {(runs || []).length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">{t('up.historyEmpty')}</p>
          ) : (
            <ul className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {runs.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onOpenRun(r.id)}
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    <div className="truncate text-sm font-medium text-ink-800">{r.appName || r.jwaName || r.inputPath}</div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={r.source === 'local' ? 'jade' : 'default'}>
                        {r.source === 'local' ? t('up.badgeLocal') : t('up.badgeUpload')}
                      </Badge>
                      <Badge>{r.stats?.forms ?? 0} {t('c.forms')}</Badge>
                      <Badge>{r.stats?.tables ?? 0} {t('c.tables')}</Badge>
                      {r.pluginName && <Badge tone="jade">{t('up.badgePlugins')}</Badge>}
                      {r.stats?.issues > 0 && <Badge tone="rose">{r.stats.issues}</Badge>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
