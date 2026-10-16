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
 * 章の見出しから、その章に含まれるオブジェクトの照合候補を作る。
 * オブジェクト側の docAnchors と見出しを突き合わせる。
 *
 * docAnchors は 1 要素がそのまま「見出しの完全一致」ではないことがある。
 * フォームのように「章番号（連番は生成時に決まる）」と「名前」で分かれる場合は
 * 2 要素で 1 組を表す（objectModel.js の FORM_PREFIX 経由）。
 * 完全一致しかladoないままだと、連番の有無による食い違いで
 * 照合結果が空になり、誰もそれに気づかないまま納品される。
 */
export function matchObjectsByChapter(chapters, objects) {
  const map = new Map();
  for (const c of chapters) {
    const stem = c.title.split('（')[0].trim();
    const matched = objects.filter((o) => anchorsMatch(o.docAnchors, c.title, stem));
    if (matched.length) map.set(c.title, matched);
  }
  return map;
}

/**
 * 見出し 1 本と、docAnchors の 1 組が対応するか。
 *
 * 照合は 3 段（すべて緩く、見出しをsplitして比べる）：
 *  1. 見出しがアンカーの前方一致（完全一致より事故が少ない）
 *  2. アンカーが見出しの前方一致（番号付き節のケース）
 *  3. 双方が同じ章番号を持つ（節の連番を無視して照合）
 *
 * 緩くてよい。docAnchors は章の索引であって本文の引用ではないため、
 * 節が多少ずれていても、将来この節が移動しても壊れない。
 */
function anchorsMatch(anchors, title, stem) {
  if (!anchors.length) return false;
  const norm = (s) => String(s).trim().replace(/^#+\s*/, '');
  const t = norm(title);
  const s = norm(stem);
  return anchors.some((a) => {
    const x = norm(a);
    if (!x) return false;
    if (t.startsWith(x) || x.startsWith(t)) return true;
    if (s.startsWith(x) || x.startsWith(s)) return true;
    // 節見出し「3.1 フォーム名（`id`）」と、アンカー「3.」+「フォーム名」の組。
    // アンカーが「章番号だけ」で終わっており、かつ章番号が一致するなら、その章の配下とみなす。
    const chapterOf = (v) => (/^\d+\./.exec(v)?.[0] || null);
    const ax = chapterOf(x);
    const ts = chapterOf(t);
    if (ax && ts && ax === ts) return true;
    return false;
  });
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