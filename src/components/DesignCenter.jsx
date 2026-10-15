import React, { useMemo, useState } from 'react';
import { t } from '../i18n.js';
import { downloadUrl } from '../lib/api.js';
import { splitChapters, matchObjectsByChapter, searchDesignDoc, chapterFilename } from '../lib/designDocView.js';
import { PageHead } from './Shell.jsx';
import { EmptyNote } from './Common.jsx';
import Chunks from './Chunks.jsx';

/**
 * 設計書センター。
 *
 * 生成済みの design_doc.md を章（節）へ分割し、目次・プレビュー・検索・
 * 単章/全文の書き出しを提供する。
 *
 * 分割と検索のロジックは src/lib/designDocView.js にあり、ここは表示に徹する。
 * 生成処理は既存の lib/designDoc.js が担う（別の生成経路を作らない）。
 *
 * 設計書自体が主眼だが、「この解析で何が生成されたか」と「RAG 用チャンク」は
 * 主導航に入れない技術的な確認事項なので、この画面のタブとして退避させる。
 */
const TABS = [
  { key: 'doc', label: 'dc.tab.doc' },
  { key: 'files', label: 'dc.tab.files' },
  { key: 'chunks', label: 'dc.tab.chunks' },
];

export default function DesignCenter({ designDoc, runId, model, artifacts, chunks, chunkStats, onSelectObject }) {
  const [tab, setTab] = useState('doc');
  const [active, setActive] = useState(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);

  const chapters = useMemo(() => splitChapters(designDoc), [designDoc]);
  const current = chapters.find((c) => c.title === active) || chapters[0];

  const objectsByChapter = useMemo(
    () => (model ? matchObjectsByChapter(chapters, model.objects) : new Map()),
    [chapters, model],
  );

  function runSearch(text) {
    setQ(text);
    setHits(text.trim() ? searchDesignDoc(chapters, text) : []);
  }

  if (!designDoc) {
    return (
      <>
        <PageHead title={t('nav.doc')} />
        <EmptyNote>{t('dc.empty')}</EmptyNote>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={t('nav.doc')}
        lead="解析結果から生成した設計書です。章ごとに内容と対象オブジェクトを確認でき、章単位でも全文でも書き出せます。"
        right={
          <div className="flex gap-2">
            {runId && tab === 'doc' && (
              <a
                href={downloadUrl(runId, 'design_doc.md')}
                className="rounded-md bg-ink-900 px-3 py-1.5 text-[12px] font-medium text-white transition hover:bg-ink-800"
              >
                {t('dc.exportAll')}（Markdown）
              </a>
            )}
            {tab === 'doc' && (
              <button
                onClick={() => downloadText(current?.text || '', chapterFilename(current))}
                disabled={!current}
                className="rounded-md border border-ink-200 px-3 py-1.5 text-[12px] font-medium text-ink-600 transition enabled:hover:bg-ink-50 disabled:opacity-50"
              >
                {t('dc.exportOne')}
              </button>
            )}
          </div>
        }
      />

      {/* 主眼は設計書。他の 2 つは技術的な確認用なので、同じ画面のタブに寄せる */}
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
              tab === x.key ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50'
            }`}
          >
            {t(x.label)}
          </button>
        ))}
      </div>

      {tab === 'files' && <ArtifactList artifacts={artifacts} runId={runId} />}
      {tab === 'chunks' && <Chunks chunks={chunks} chunkStats={chunkStats} runId={runId} />}
      {tab === 'doc' && (
        <div className="flex gap-4">
          {/* 目次 */}
          <aside className="w-[290px] shrink-0">
            <div className="mb-2">
              <input
                value={q}
                onChange={(e) => runSearch(e.target.value)}
                placeholder={t('dc.search')}
                className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] outline-none placeholder:text-ink-400 focus:border-brand-300"
              />
              {q && (
                <div className="mt-1 text-[11px] text-ink-500">
                  {t('dc.hits', { n: hits.length })}
                </div>
              )}
            </div>
            <nav className="max-h-[calc(100vh-230px)] overflow-y-auto rounded-lg border border-ink-200 bg-white">
              {chapters.map((c) => (
                <button
                  key={c.title}
                  onClick={() => setActive(c.title)}
                  className={`block w-full border-b border-ink-100 px-3 py-2 text-left transition last:border-b-0 ${
                    current?.title === c.title ? 'bg-brand-50' : 'hover:bg-ink-50'
                  }`}
                >
                  <span className={`block text-[12px] ${current?.title === c.title ? 'font-semibold text-brand-700' : 'text-ink-700'}`}>
                    {c.title}
                  </span>
                  <span className="block text-[10px] text-ink-400">
                    {t('dc.lines', { n: c.end - c.line })}
                    {c.subs.length ? ` / 節 ${c.subs.length}` : ''}
                  </span>
                </button>
              ))}
            </nav>
          </aside>

          {/* プレビュー */}
          <div className="min-w-0 flex-1">
            {q && (
              <section className="mb-3 rounded-lg border border-ink-200 bg-white">
                <header className="border-b border-ink-100 px-4 py-2 text-[12px] font-semibold text-ink-700">
                  検索結果（{hits.length} 件）
                </header>
                <ul className="max-h-[220px] divide-y divide-ink-100 overflow-y-auto">
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button
                        onClick={() => setActive(h.chapter)}
                        className="flex w-full items-baseline gap-2 px-4 py-1.5 text-left transition hover:bg-ink-50"
                      >
                        <span className="shrink-0 font-mono text-[10px] text-ink-400">{h.chapter}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-600">{h.line}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {current ? (
              <section className="rounded-lg border border-ink-200 bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2.5">
                  <h2 className="text-[14px] font-bold text-ink-900">{current.title}</h2>
                  <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-600">{t('dc.generated')}</span>
                  <span className="ml-auto text-[11px] text-ink-400">{t('dc.lines', { n: current.end - current.line })}</span>
                </header>

                {current.subs.length > 0 && (
                  <div className="border-b border-ink-100 px-4 py-2">
                    <div className="mb-1 text-[11px] font-medium text-ink-500">この章の節</div>
                    <ul className="flex flex-wrap gap-1">
                      {current.subs.map((s) => (
                        <li key={s.title}>
                          <a
                            href={`#${anchorOf(s)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              const el = document.getElementById(anchorOf(s));
                              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className="rounded border border-ink-200 bg-white px-1.5 py-0.5 text-[11px] text-ink-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                          >
                            {s.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {objectsByChapter.get(current.title)?.length > 0 && (
                  <div className="border-b border-ink-100 px-4 py-2">
                    <div className="mb-1 text-[11px] font-medium text-ink-500">{t('dc.jumpToObject')}</div>
                    <div className="flex flex-wrap gap-1">
                      {objectsByChapter.get(current.title).slice(0, 20).map((o) => (
                        <ObjectChip key={o.key} obj={o} onOpen={onSelectObject} />
                      ))}
                    </div>
                  </div>
                )}

                <article className="doc-md max-h-[calc(100vh-320px)] overflow-y-auto px-5 py-4">
                  <Markdown text={current.text} idPrefix={`c${current.line}-`} />
                </article>
              </section>
            ) : (
              <EmptyNote>{t('dc.selectChapter')}</EmptyNote>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** 生成されたファイルの一覧。ダウンロードはサーバの成果物 API に委ねる */
function ArtifactList({ artifacts, runId }) {
  const list = artifacts || [];
  if (!list.length) {
    return <EmptyNote>{t('dc.noArtifacts')}</EmptyNote>;
  }
  return (
    <section className="rounded-lg border border-ink-200 bg-white">
      <header className="border-b border-ink-100 px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-ink-800">{t('dc.artifacts')}</h2>
        <p className="mt-0.5 text-[11px] text-ink-400">{t('dc.artifactsHint')}</p>
      </header>
      <ul className="divide-y divide-ink-100">
        {list.map((a) => (
          <li key={a.name} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="font-mono text-[12px] font-medium text-ink-800">{a.name}</span>
            <span className="text-[12px] text-ink-500">{a.label}</span>
            <span className="ml-auto text-[11px] tabular-nums text-ink-400">{formatSize(a.size)}</span>
            {runId && (
              <a
                href={downloadUrl(runId, a.name)}
                className="rounded-md border border-ink-200 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-ink-50"
              >
                {t('dc.download')}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ObjectChip({ obj, onOpen }) {
  return (
    <button
      onClick={() => onOpen?.(obj.key)}
      title={obj.id}
      className="max-w-[220px] truncate rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 text-[11px] text-ink-600 transition enabled:hover:border-brand-300 enabled:hover:bg-brand-50 enabled:hover:text-brand-700"
    >
      {obj.name}
    </button>
  );
}

/** 節のアンカー。章ごとに同じ見出し名が現れても衝突しないよう接頭辞を付ける */
function anchorOf(sub) {
  return `sec-${sub.line}-${sub.title.replace(/[^A-Za-z0-9]+/g, '-').slice(0, 24)}`;
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 最小限の Markdown 描画。
 * 見出し・表・リスト・コード・強調だけを扱い、
 * 生の HTML を挿さない（解析結果が外部入力であるため）。
 */
function Markdown({ text, idPrefix = '' }) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const [code, next] = collect(lines, i + 1, (l) => !l.startsWith('```'));
      out.push(<pre key={`p${i}`}><code>{code}</code></pre>);
      i = next;
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const L = ['h1', 'h2', 'h3', 'h4'][h[1].length - 1] || 'h4';
      // 節へのジャンプが使えるよう、見出しに安定した id を付ける
      out.push(
        React.createElement(
          L,
          { key: `h${i}`, id: `${idPrefix}sec-${i}-${h[2].replace(/[^A-Za-z0-9]+/g, '-').slice(0, 24)}` },
          inline(h[2]),
        ),
      );
      i++;
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const head = splitRow(line);
      let j = i + 2;
      const body = [];
      while (j < lines.length && /^\|.*\|\s*$/.test(lines[j])) {
        body.push(splitRow(lines[j]));
        j++;
      }
      out.push(
        <table key={i}>
          <thead><tr>{head.map((c, x) => <th key={x}>{inline(c)}</th>)}</tr></thead>
          <tbody>{body.map((r, x) => <tr key={x}>{r.map((c, y) => <td key={y}>{inline(c)}</td>)}</tr>)}</tbody>
        </table>,
      );
      i = j;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      out.push(<ul key={`ul-${i}`}>{items.map((x, n) => <li key={n}>{inline(x)}</li>)}</ul>);
      continue;
    }

    if (line.trim() === '') { i++; continue; }
    out.push(<p key={i}>{inline(line)}</p>);
    i++;
  }
  return out;
}

/** ``` 開始から閉じまでを取り、続きの行番号を返す */
function collect(lines, from, until) {
  const buf = [];
  let i = from;
  while (i < lines.length && !until(lines[i])) {
    buf.push(lines[i]);
    i++;
  }
  return [buf.join('\n'), i + 1];
}

function splitRow(line) {
  return line.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
}

/** インライン要素。HTML は挿入せず、テキストと強調だけを描画する */
function inline(s) {
  const parts = String(s).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 3) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <span key={i}>{p}</span>;
  });
}