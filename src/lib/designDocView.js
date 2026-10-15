/**
 * 設計書テキストの解析（表示ロジック）。
 *
 * React に依存しない純粋な関数だけを置く。
 * 画面側（DesignCenter）はここで得た章的范围を使い、
 * 生成そのものは既存の lib/designDoc.js が担当する（別の生成経路を作らない）。
 */

/**
 * 設計書を章へ分割する。
 *
 * 設計書は「## 章」の中に「### 節」が入る階層になっているため、
 * 章の範囲は「次の同レベルの見出しまで」で決める。
 * 単に「次の見出しまで」で切ると、章の内容が配下の節に奪われ目次が空になる。
 *
 * @param {string} md  設計書の Markdown
 * @returns {{title:string, level:number, line:number, end:number, text:string,
 *            subs:{title:string, line:number, end:number, text:string}[]}[]}
 */
export function splitChapters(md) {
  const lines = String(md || '').split('\n');
  const marks = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) marks.push({ level: m[1].length, title: m[2].trim(), line: i });
  });
  if (!marks.length) return [];

  const hasH2 = marks.some((x) => x.level === 2);
  const topLevel = hasH2 ? 2 : 1;
  const lastLine = lines.length;

  /** 自分より浅いか同じ見出しの行を次に見つける */
  const nextBoundary = (from, level) => {
    for (let i = from + 1; i < marks.length; i++) if (marks[i].level <= level) return marks[i].line;
    return lastLine;
  };

  return marks
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.level === topLevel)
    .map(({ m, i }) => {
      const end = nextBoundary(i, topLevel);
      const subs = marks
        .map((s, si) => ({ s, si }))
        .filter(({ s }) => s.level === topLevel + 1 && s.line > m.line && s.line < end)
        .map(({ s, si }) => {
          const subEnd = nextBoundary(si, topLevel + 1);
          return { ...s, end: subEnd, text: lines.slice(s.line, subEnd).join('\n') };
        });
      return { ...m, end, subs, text: lines.slice(m.line, end).join('\n') };
    });
}

/**
 * 章 Titelから、その章に含まれるオブジェクトの照合候補を作る。
 * オブジェクト側の docAnchors と見出しを突き合わせる。
 */
export function matchObjectsByChapter(chapters, objects) {
  const map = new Map();
  for (const c of chapters) {
    const stem = c.title.split('（')[0].trim();
    const matched = objects.filter((o) =>
      o.docAnchors.some((a) => c.title.startsWith(a) || a.startsWith(stem) || c.title.includes(a) || stem.includes(a)),
    );
    if (matched.length) map.set(c.title, matched);
  }
  return map;
}

/**
 * 章を横断して検索する。
 * @returns {{chapter:string, sub:string|null, lineNo:number, line:string}[]}
 */
export function searchDesignDoc(chapters, needle) {
  const n = String(needle || '').trim().toLowerCase();
  if (!n) return [];
  const out = [];
  for (const c of chapters) {
    c.text.split('\n').forEach((line, i) => {
      if (line.toLowerCase().includes(n)) {
        const sub = c.subs.find((s) => i + c.line >= s.line && i + c.line < s.end);
        out.push({ chapter: c.title, sub: sub?.title || null, lineNo: c.line + i + 1, line: line.trim().slice(0, 160) });
      }
    });
  }
  return out;
}

/** 章の範囲からファイル名を安全に作る */
export function chapterFilename(chapter) {
  const safe = String(chapter?.title || 'chapter')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .trim();
  return `${safe || 'chapter'}.md`;
}