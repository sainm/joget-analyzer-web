import React from 'react';
import { STATUS, STATUS_LABEL, objTypeLabel, BASIS_LABEL, BASIS_SHORT, CAUSE_LABEL, CAUSE_DESC } from '../lib/objectModel.js';

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

/* 成因の色。状態（一部のみ＝amber 等）と同じ色を使うと、
 * 「状態」と「成因」の二つの軸が混ざって見えるので別の色を割り当てる。
 * 定義の欠落・参照先未確認は利用者が確認すべき可能性があるので
 * 暖色～赤系、規約からの導出とソース未提供は静的解析の制約なので寒色～無彩色。 */
const CAUSE_STYLE = {
  'definition-gap': 'border-amber-300 bg-amber-100 text-amber-800',
  'unresolved-ref': 'border-rose-200 bg-rose-50 text-rose-700',
  'derived': 'border-sky-200 bg-sky-50 text-sky-700',
  'no-source': 'border-ink-200 bg-ink-100 text-ink-600',
};

/**
 * 積み上げバー用の塗り色。バッジと同じ色相で、どの区間がどの成因かを
 * 色だけに頼らず下の行（文字 + 件数）と対応させる。
 * 色は表示の都合なので語彙（ラベル・説明）とは別に、ここに置く。
 */
export const CAUSE_FILL = {
  'definition-gap': 'bg-amber-400',
  'unresolved-ref': 'bg-rose-400',
  'derived': 'bg-sky-400',
  'no-source': 'bg-ink-300',
};

/**
 * 未確認の成因バッジ。
 * 状態（StatusTag）が「どこまで読めたか」、こちらは「なぜ確定できなかったか」。
 * 色に加えて必ず文字を出し、正式な説明は title に置く。
 * 語彙は objectModel の CAUSE_LABEL / CAUSE_DESC を引き、ここで定義し直さない。
 */
export function CauseTag({ cause }) {
  const label = CAUSE_LABEL[cause];
  if (!label) return null;
  return (
    <span
      title={CAUSE_DESC[cause]}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${CAUSE_STYLE[cause] || CAUSE_STYLE['no-source']}`}
    >
      {label}
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

/** 種別の語彙（form / data / audit / unknown）はモデル側にあるので、
 *  セルの文字列（BASIS_LABEL の値）から逆引きする。一致しなければ素の文字列。 */
const basisKeyOfText = (text) => Object.keys(BASIS_LABEL).find((k) => BASIS_LABEL[k] === text) || null;

const BASIS_STYLE = {
  form: 'border-brand-200 bg-brand-50 text-brand-700',
  data: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  audit: 'border-violet-200 bg-violet-50 text-violet-700',
  unknown: 'border-ink-200 bg-ink-100 text-ink-500',
};

/**
 * カラムの出処バッジ。
 * 一覧では短いラベルで識別させ、正式な説明は title に置く。
 * 色に加えて必ず文字を出す（色だけに依存させない）。
 */
export function BasisTag({ basis }) {
  const short = BASIS_SHORT[basis];
  if (!short) return <span className="text-ink-700">{String(basis)}</span>;
  return (
    <span
      title={BASIS_LABEL[basis]}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${BASIS_STYLE[basis] || BASIS_STYLE.unknown}`}
    >
      {short}
    </span>
  );
}

/** 詳細セクションの表。列数が少ないときは横スクロールをさせない
 *  badge={{ column, kind: 'basis' }} を渡すと、その列のセルを
 *  出処の語彙に一致したときだけバッジにする（一致しなければ素の文字列）。 */
export function SectionTable({ head, rows, note, badge }) {
  if (!rows?.length) return null;
  const badgeColumn = badge?.kind === 'basis' ? badge.column : -1;
  const cell = (c, j) => {
    const basis = j === badgeColumn ? basisKeyOfText(c) : null;
    if (basis) return <BasisTag basis={basis} />;
    if (c === '—' || c === '') return <span className="text-ink-300">—</span>;
    return <span className={j === 0 ? 'font-mono text-[11px]' : ''}>{String(c)}</span>;
  };
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
                    {cell(c, j)}
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