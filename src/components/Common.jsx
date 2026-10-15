import React from 'react';
import { STATUS, STATUS_LABEL, objTypeLabel } from '../lib/objectModel.js';

/**
 * 画面全体で共有する小さな表示部品。
 *
 * 状態は必ず「色 + 文字」で表す。色だけに依存させないため、
 * テキストラベルを省略できる構成にはしない。
 * ラベル語彙は objectModel の STATUS_LABEL（語彙表由来）を引き、
 * ここで同じ文字列を定義し直さない。
 */

const STATUS_STYLE = {
  [STATUS.PARSED]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [STATUS.PARTIAL]: 'border-amber-200 bg-amber-50 text-amber-700',
  [STATUS.UNKNOWN]: 'border-ink-200 bg-ink-100 text-ink-500',
  [STATUS.FAILED]: 'border-rose-200 bg-rose-50 text-rose-700',
};

const STATUS_TEXT = STATUS_LABEL;

const TYPE_STYLE = {
  menu: 'bg-sky-50 text-sky-700 border-sky-200',
  form: 'bg-brand-50 text-brand-700 border-brand-100',
  field: 'bg-ink-50 text-ink-500 border-ink-200',
  datalist: 'bg-violet-50 text-violet-700 border-violet-200',
  process: 'bg-amber-50 text-amber-700 border-amber-200',
  activity: 'bg-amber-50/60 text-amber-600 border-amber-100',
  table: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  column: 'bg-ink-50 text-ink-600 border-ink-200',
  plugin: 'bg-rose-50 text-rose-700 border-rose-200',
  datasource: 'bg-teal-50 text-teal-700 border-teal-200',
  sql: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function StatusTag({ status, withText = true }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[status] || STATUS_STYLE[STATUS.UNKNOWN]}`}
    >
      {withText ? STATUS_TEXT[status] || status : '●'}
    </span>
  );
}

export function TypeTag({ type }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_STYLE[type] || 'border-ink-200 bg-ink-50 text-ink-600'}`}>
      {objTypeLabel(type)}
    </span>
  );
}

/** 空状態。なぜ空なのかを利用者に説明させるため、文言は呼び出し側から渡す */
export function EmptyNote({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50 px-4 py-6 text-center text-[12px] text-ink-400">
      {children}
    </div>
  );
}

/** 詳細セクションの表。列数が少ないときは横スクロールをさせない */
export function SectionTable({ head, rows, note }) {
  if (!rows?.length) return null;
  return (
    <div>
      <div className="max-h-[420px] overflow-auto rounded-md border border-ink-200">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0">
            <tr className="bg-ink-50 text-left">
              {head.map((h, i) => (
                <th key={i} className="border-b border-ink-200 px-2.5 py-1.5 font-semibold text-ink-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-ink-50/40">
                {r.map((c, j) => (
                  <td key={j} className="border-b border-ink-100 px-2.5 py-1.5 align-top text-ink-700">
                    {c === '—' || c === '' ? <span className="text-ink-300">—</span> : <span className={j === 0 ? 'font-mono text-[11px]' : ''}>{String(c)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-1 text-[11px] text-ink-400">{note}</p>}
    </div>
  );
}

/** 小さな区分バッジ（件数の区切りなど） */
export function Pill({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-ink-100 text-ink-600',
    brand: 'bg-brand-50 text-brand-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    jade: 'bg-emerald-50 text-emerald-700',
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`}>{children}</span>;
}