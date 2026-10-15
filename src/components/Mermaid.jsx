import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

let inited = false;
function ensureInit() {
  if (inited) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    fontFamily: 'Inter, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif',
    themeVariables: {
      primaryColor: '#eef4ff',
      primaryBorderColor: '#2a63e0',
      primaryTextColor: '#1f4cb4',
      lineColor: '#8b95a7',
      fontSize: '13px',
    },
    flowchart: { curve: 'basis', htmlLabels: true, useMaxWidth: true },
    er: { useMaxWidth: true },
  });
  inited = true;
}

let seq = 0;

export default function Mermaid({ code, className = '' }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!code || !ref.current) return;
    let cancelled = false;
    ensureInit();
    const id = `mmd-${++seq}`;
    mermaid
      .render(id, code)
      .then(({ svg }) => {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setErr('');
        }
      })
      .catch((e) => {
        if (!cancelled) setErr(String((e && e.message) || e));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className={className}>
      <div className="mermaid-host flex justify-center overflow-auto py-2" ref={ref} />
      {err && (
        <pre className="mt-2 overflow-auto rounded-lg bg-rose-50 p-3 text-[11px] text-rose-600">{err}</pre>
      )}
    </div>
  );
}
