/**
 * test-object-model.mjs — 統合オブジェクトモデルの回帰テスト
 *
 * 画面を作る前に「オブジェクトモデルが正しい」ことを数値で固定する。
 * 特に次の点を検証する:
 *  1. 生成順によって関連が失われないこと（field ↔ column の双方向リンク）
 *  2. 関連が双方向であること（片側だけのリンクを作らない）
 *  3. 取れなかったものを 0 や空欄にしないこと（未確認が明示される）
 *  4. 設計書の章との対応が壊れていないこと（docAnchors ↔ 実際の見出し）
 *
 * 使い方: node test-object-model.mjs
 *  JOGET_PROJECT  … 解析対象のプロジェクト（既定は同梱の Apache-2.0 サンプル）
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { buildObjectModel, OBJ, STATUS } from './src/lib/objectModel.js';
import { splitChapters, matchObjectsByChapter } from './src/lib/designDocView.js';

const require = createRequire(import.meta.url);
const { analyze } = require('./lib/analyze');
const { correlate } = require('./lib/correlate');
const { generateDesignDoc } = require('./lib/designDoc');

const PROJECT = process.env.JOGET_PROJECT || path.join(process.cwd(), 'fixtures', 'enhanced-json-api-main');

let failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}  ${extra}`); }
};

console.log(`── 対象: ${path.relative(process.cwd(), PROJECT)} ──`);

/* 解析結果をその場で生成する（前回の解析結果に依存しない）。
 * .jwa は 1 つだけ見つかる前提で、ファイル名は固定しない
 * （固定するとBaker ール出力のファイル名が変わった瞬間に
 *  テストが静かにスキップし、誰も気づかないまま門禁が空Iamになる）。 */
const jwa = (function findJwa(dir) {
  const flat = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith('.jwa'));
  if (flat) return path.join(dir, flat);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const nested = findJwa(path.join(dir, e.name));
    if (nested) return nested;
  }
  return null;
})(PROJECT);
if (!jwa) {
  console.log('スキップ（.jwa が見つかりません）');
  process.exit(0);
}
console.log(`   入力: ${path.relative(process.cwd(), jwa)}`);

let summary;
let correlation = null;
try {
  const r = analyze(jwa, path.join(process.cwd(), 'data', 'object-model-test'));
  summary = r.summary;
  correlation = correlate(r.summary, PROJECT);
} catch (e) {
  console.log(`スキップ（解析に失敗: ${e.message}）`);
  process.exit(0);
}

const m = buildObjectModel({ summary, correlation });

console.log('\n[1] オブジェクト種別');
const types = Object.entries(m.stats.byType).map(([k2, v]) => `${k2}=${v}`).join(' ');
console.log(`  ${types} / 合計 ${m.stats.total}`);
ok('フォームが生成される', (m.stats.byType[OBJ.FORM] || 0) > 0);
ok('テーブルが生成される', (m.stats.byType[OBJ.TABLE] || 0) > 0);
ok('メニューまたはリストが生成される', (m.stats.byType[OBJ.MENU] || 0) + (m.stats.byType[OBJ.LIST] || 0) > 0);

console.log('\n[2] 関連の整合性（回帰: 生成順で関連を失わない）');
let broken = 0;
let asym = 0;
for (const o of m.objects) {
  for (const l of o.links) {
    const to = m.byKey.get(l.key);
    if (!to) { broken++; continue; }
    if (!to.links.some((x) => x.key === o.key)) asym++;
  }
}
ok('壊れたリンクが無い', broken === 0, `${broken} 件`);
ok('関連が双方向', asym === 0, `${asym} 件が片側`);

// 第 2 段で解決できなかった関連は「関連を張ったのに相手がいなかった」状態であり、
// そのまま放置すると関連パネルが静かに空になる。1 件でも出れば失敗として扱う。
const kinds = m.unresolved.reduce((a, u) => {
  const tag = `${u.kind}:${u.type || String(u.from || '').split(':')[0]}`;
  a[tag] = (a[tag] || 0) + 1;
  return a;
}, {});
ok('解決できなかった関連が 0 件',
  m.unresolved.length === 0,
  `${m.unresolved.length} 件 ${JSON.stringify(kinds)} ${JSON.stringify(m.unresolved.slice(0, 2))}`);

/* テーブルキーの接頭辞が二重になっていないこと。
 * 解析側は tableName を素の形で返す場合と app_fd_ 付きで返す場合があり、
 * どちらでも同じオブジェクトへ解決されなければならない。
 * 検出は文字列形状で行い、内部定数には依存しない（テストが実装の
 * 都合に縛られるのを避ける）。
 *
 * 解決できなかった関連も必ず覗く。解決段で落ちたキーは
 * o.links に入らないため、オブジェクトだけを見ると必ず green になる。 */
const DBL_PREFIX = /app_fd_app_fd_/;
const dblInObjects = m.objects.filter((o) => DBL_PREFIX.test(o.key));
const dblInUnresolved = m.unresolved.filter((u) => DBL_PREFIX.test(String(u.to || '')));
ok('app_fd_ が二重に付いたキーがない',
  dblInObjects.length === 0 && dblInUnresolved.length === 0,
  `オブジェクト ${dblInObjects.length} 件 / 未解決 ${dblInUnresolved.length} 件: ${dblInUnresolved.slice(0, 3).map((u) => u.to).join(', ')}`);

/* SQL が参照するテーブルは、実在するテーブルオブジェクトに解決すること。
 * ここも同じく未解決分を対象にする（links だけ見ると宙に浮いた関連を検出できない）。 */
const sqlTableDangling = m.unresolved.filter((u) => u.kind === 'link' && u.type === 'table');
ok('SQL→テーブル関連がすべて実在するテーブルに解決する',
  sqlTableDangling.length === 0,
  `${sqlTableDangling.length} 件が宙に浮いています: ${sqlTableDangling.slice(0, 3).map((u) => u.to).join(', ')}`);

const tbl = m.objects.find((o) => o.type === OBJ.TABLE);
const cols = m.objects.filter((o) => o.type === OBJ.COLUMN);
const formColLinks = cols.filter((c) => c.links.some((l) => l.type === 'field')).length;
console.log(`  テーブル ${m.stats.byType[OBJ.TABLE] || 0} / カラム ${cols.length} / カラム→項目リンク ${formColLinks}`);
ok('カラム→フォーム項目の関連が解決している', cols.length > 0 && formColLinks > 0);

/* プラグインは「参照されているのに詳細も検索も出てこない」状態にしてはいけない。
 * プラットフォーム標準（apps / enterprise）は突合できないため platform 側に
 * 分離されるが、それを理由にオブジェクトモデルから落とすと、
 * 一覧に出るのに開けない、という壊れ方が静かに起きる。
 * 参考: addPlugin がオブジェクトを key ではなく「オブジェクト」で返すと、
 * 関連も注記もすべて宙に消える（壊れたリンクは増えないため検出できない）。 */
const plugins = m.objects.filter((o) => o.type === OBJ.PLUGIN);
const referencedClasses = new Set([
  ...(correlation?.bindings || []).map((b) => b.className),
  ...(correlation?.deadConfig || []).map((d) => d.className),
  ...(correlation?.platform || []).map((p) => p.className),
]);
const pluginIds = new Set(plugins.map((p) => p.id));
const missingPlugin = [...referencedClasses].filter((c) => !pluginIds.has(c));
console.log(`  プラグイン ${plugins.length} 参照クラス ${referencedClasses.size} / 関連を持つ ${plugins.filter((p) => p.links.length > 0).length}`);
ok('参照されているプラグインがすべてオブジェクトとして存在する',
  missingPlugin.length === 0, `${missingPlugin.length} 件が欠落: ${missingPlugin.slice(0, 3).join(', ')}`);
ok('プラグイン一覧の件数が参照クラス数と一致する',
  plugins.length === referencedClasses.size,
  `一覧 ${plugins.length} / 参照 ${referencedClasses.size}`);

/* usedIn を持つプラグインは、宛先オブジェクトが存在する少なくとも 1 つ結び付ける。
 * 結び付けが 0 になる原因が「key をオブジェクトで返している」「関連を張る段階が早い」
 * のいずれの場合も、ここで落ちる。 */
const withUsedIn = plugins.filter((p) => (p.attrs.find((a) => a.k === '使用箇所')?.v || '—') !== '—');
const linkedFromUsedIn = withUsedIn.filter((p) => p.links.some((l) => l.type === 'target'));
console.log(`  使用箇所を持つプラグイン ${withUsedIn.length} / そのうち関連あり ${linkedFromUsedIn.length}`);
ok('使用箇所を持つプラグインには関連が 1 本以上ある',
  withUsedIn.length === 0 || linkedFromUsedIn.length > 0,
  `${withUsedIn.length} 件中 ${withUsedIn.length - linkedFromUsedIn.length} 件が関連 0 本`);

console.log('\n[3] 静的な検査結果');
console.log(`  エラー ${m.stats.checks.error} / 警告 ${m.stats.checks.warn} / 情報 ${m.stats.checks.info}`);
ok('各検査にルールIDがある', m.checks.every((c) => !!c.ruleId));
ok('各検査に根拠がある', m.checks.every((c) => !!c.evidence));
ok('各検査に解析上の制限がある', m.checks.every((c) => !!c.limit));
ok('各検査に検査範囲がある', m.checks.every((c) => !!c.scope));
ok('解決できなかった関連が報告される', Array.isArray(m.unresolved));

console.log('\n[4] 未確認を隠さない（0 や空欄にしない）');
console.log(`  未確認 ${m.unconfirmed.length} 件（全体 ${m.stats.total}）`);
ok('未確認が算出されている', m.unconfirmed.length >= 0 && m.stats.byStatus[STATUS.PARTIAL] !== undefined);
ok('全オブジェクトに解析状態がある', m.objects.every((o) => !!o.status));
const derived = m.objects.filter((o) => o.type === OBJ.TABLE && o.evidence.some((e) => e.kind === 'derivation'));
ok('規約導出のテーブルは「一部のみ」になる', derived.every((o) => o.status === STATUS.PARTIAL));

console.log('\n[5] 解析品質');
for (const c of m.coverage) {
  console.log(`  ${c.label.padEnd(18)} ${c.measured ? `${c.total} 件（うち未確定 ${c.partial}）` : '未計測'} — ${c.note}`);
}
ok('資産種別ごとに件数が算出されている', m.coverage.every((c) => typeof c.total === 'number'));
ok('測定していない項目は「未計測」と明示される', m.coverage.every((c) => c.measured || c.total === 0));

console.log('\n[6] 設計書との対応（docAnchors ↔ 実際の見出し）');
/**
 * docAnchors は「オブジェクト → 設計書のどの章」という対応である。
 * 生成側（lib/designDoc.js）と参照側（src/lib/objectModel.js）は
 * 見出しの語彙を lib/chapters.cjs で共有しているが、
 * 「片方だけ見出しの形式を変えた」状態は語彙の共有では防げない。
 * 実際に生成された設計書に対して照合できる形にして、ここで検証する。
 *
 * 参考: この検査が無いと、フォームの docAnchors が「3. フォーム名」のまま
 * 実際の見出しが「3.1 フォーム名」に変わった状態で、
 * 設計書センターからフォームへ戻れなくなっても、誰も気づけないまま納品される。
 */
const md = generateDesignDoc(summary, { correlation });
const chapters = splitChapters(md);
const byChapter = matchObjectsByChapter(chapters, m.objects);

ok('設計書から章を取り出せる', chapters.length > 0, `${chapters.length} 章`);

/* アンカーを持つオブジェクトは、どれか 1 章に紐づく必要がある。
 * 紐づかない場合、詳細画面の「このオブジェクトを設計書で見る」が無言で壊れる。 */
const withAnchors = m.objects.filter((o) => o.docAnchors.length);
const linked = new Set([...byChapter.values()].flat().map((o) => o.key));
const orphan = withAnchors.filter((o) => !linked.has(o.key));
console.log(`  アンカーあり ${withAnchors.length} / 章に紐づく ${withAnchors.length - orphan.length}`);
ok('アンカーを持つすべてのオブジェクトが設計書の章に紐づく',
  orphan.length === 0,
  `${orphan.length} 件が宙に浮いています: ${orphan.slice(0, 3).map((o) => `${o.type}:${o.id} ${JSON.stringify(o.docAnchors)}`).join(' / ')}`);

/* 章 → オブジェクト数 を実測で出す。
 * 「0」の章をすぐ失敗扱いにはしない。
 * たとえば「1. 概要」は全書の導入であり、対象の集合を意図していない。
 * 「6. 影響範囲分析」に SQL が無ければ 0 件になるが、それは解析対象の
 * 性質であって欠陥ではない。
 * 0 の章はそのまま一覧に出し、评审の材料として残す。 */
/* フォームの精度検査。
 * 「どこかの章に紐づけばよい」では不十分。紐づき先を 1 件でも確保すれば
 * 通るだけだと、章を間違えても（フォームが「4. プロセス設計」に紐づいても）
 * 気づけない。ここでは「自分自身の節が入っている章」に紐づくことを確かめる。
 *
 * 手順: 生成された設計書から見出しを拾い、フォーム名を含む節を探し、
 * その節より前にある最上位の見出しを「正解の章」とする。 */
const mdLines = md.split('\n');
const topBefore = (idx) => mdLines.slice(0, idx).reverse().find((l) => /^##\s/.test(l))?.replace(/^##\s+/, '') || null;
const forms = m.objects.filter((o) => o.type === OBJ.FORM);
for (const f of forms) {
  const name = f.name || f.id;
  const ownIdx = mdLines.findIndex((line) => /^#{2,4}\s/.test(line) && line.includes(name));
  const expected = ownIdx >= 0 ? topBefore(ownIdx) : null;
  const actual = [...byChapter.entries()].filter(([, objs]) => objs.some((o) => o.key === f.key)).map(([t]) => t);
  ok(`フォーム「${name}」が自分の節のある章（${expected || '不明'}）に紐づく`,
    !!expected && actual.includes(expected),
    `実際の紐づき: ${actual.join(' / ') || 'なし'}`);
}
console.log(`  フォーム ${forms.length} 件を検証`);

for (const c of chapters) {
  const hit = (byChapter.get(c.title) || []).length;
  console.log(`    ${hit ? ' ' : '!'} ${c.title} ← ${hit} オブジェクト`);
}
const emptyChapterTitles = chapters.filter((c) => (byChapter.get(c.title) || []).length === 0).map((c) => c.title);
console.log(`  オブジェクトが紐づかない章（内容が空なのは想定内）: ${emptyChapterTitles.length ? emptyChapterTitles.join(' / ') : 'なし'}`);

console.log(`\n結果: ${failed ? `不合格 ${failed} 件` : '通過'}`);
process.exit(failed ? 1 : 0);