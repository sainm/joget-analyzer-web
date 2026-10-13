import React from 'react';

export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-ink-200 bg-white shadow-[0_1px_2px_rgba(26,29,36,.04)] ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink-800">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = 'default', hint }) {
  const tones = {
    default: 'text-ink-800',
    brand: 'text-brand-600',
    jade: 'text-jade-500',
    amber: 'text-amber-500',
    rose: 'text-rose-500',
  };
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone] || tones.default}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-400">{hint}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'default' }) {
  const tones = {
    default: 'bg-ink-100 text-ink-600 border-ink-200',
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    jade: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-600 border-rose-200',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[tone] || tones.default}`}>
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50 px-4 py-8 text-center text-sm text-ink-400">{children}</div>;
}

export function Table({ head, children, dense = false }) {
  return (
    <div className="overflow-auto rounded-lg border border-ink-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-ink-50 text-left">
            {head.map((h, i) => (
              <th key={i} className={`border-b border-ink-200 font-semibold text-ink-600 ${dense ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '', mono = false }) {
  return <td className={`border-b border-ink-100 align-top px-3 py-2 text-ink-700 ${mono ? 'font-mono text-[12px]' : ''} ${className}`}>{children}</td>;
}

export function Accordion({ title, meta, children, defaultOpen = false }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 bg-ink-50 px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-100"
      >
        <span className="truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {meta && <span className="text-[11px] font-normal text-ink-400">{meta}</span>}
          <span className={`text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        </span>
      </button>
      {open && <div className="border-t border-ink-100 p-3">{children}</div>}
    </div>
  );
}
