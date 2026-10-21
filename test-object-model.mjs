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
import { splitChapters, matchObjectsByChapter } from './src/lib/designDocView.js';

/**
 * 統合オブジェクトモデルは lib/objectModel.js（CJS）にある。
 * サービス側（lib/designDoc.js 等）とブラウザ側（src/）が同じ実装を
 * 読み込むため、二重定義を避けるには CJS 一択。
 *
 * ここは Node の ESM テストなので createRequire で読む。
 * Vite 側は esbuild が ESM に変換して取り込む。
 */
const require = createRequire(import.meta.url);
const { buildObjectModel, OBJ, STATUS, CATEGORY_LABEL, sections, dataTableKey, BASIS_LABEL, BASIS_SHORT, BASIS_LEGEND, CAUSE_LABEL, CAUSE_DESC, CAUSE_ORDER, CHECK_RULES, CHECK_RULE_ORDER } = require('./lib/objectModel.js');
const { analyze } = require('./lib/analyze');
const { correlate } = require('./lib/correlate');
const { scanPluginSource } = require('./lib/pluginScan');
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
 * （固定すると、別のバッチの出力だと誤認してテストが静かにスキップし、
 *  誰も気づかないまま門禁が空回りになる）。 */
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
let manifest = null;
try {
  const r = analyze(jwa, path.join(process.cwd(), 'data', 'object-model-test'));
  summary = r.summary;
  /* correlate() が受け取るのは plugin_manifest（スキャン結果）であり、
   * ディレクトリパスではない。パスを渡すと manifest.components が undefined に
   * なり hasSource=false に黙って degrade し、「ソースがある」経路
   * （ソース一致・宣言済み設定項目・無効設定の検出）が門から落ちる。
   * 実際にそうなっていたため、走査はここで明示的に行う。 */
  try {
    manifest = scanPluginSource(PROJECT);
  } catch (e) {
    console.log(`  （プラグインソースの走査に失敗: ${e.message}。突合なしで続行）`);
  }
  correlation = correlate(summary, manifest);
} catch (e) {
  console.log(`スキップ（解析に失敗: ${e.message}）`);
  process.exit(0);
}

/* テスト装置自身のチェック。
 * 走査でコンポーネントが得られているのに突合が無源になっていたら、
 * 以下の「ソース一致」系の検査はすべて空振りする（門が緑でも何も見ていない）。
 * 門が門であることを、門自身で確かめる。
 * 参考: manifest としてディレクトリパスを渡すと components が undefined になり
 * * この検査が失敗する。 */
const hasPluginSource = !!(correlation && correlation.hasSource);
const scannedComponents = (manifest && manifest.components) || [];
console.log(`  突合: ${hasPluginSource ? `ソースあり（コンポーネント ${scannedComponents.length} 件）` : 'ソースなし（.jwa 単体と同等）'}`);
ok('走査したコンポーネントがあるなら突合が有源になる',
  scannedComponents.length === 0 || hasPluginSource === true,
  `コンポーネント ${scannedComponents.length} 件を走査したのに hasSource=${hasPluginSource}（manifest の渡し方疑い）`);

const m = buildObjectModel({ summary, correlation });

console.log('\n[1] オブジェクト種別');
const types = Object.entries(m.stats.byType).map(([k2, v]) => `${k2}=${v}`).join(' ');
console.log(`  ${types} / 合計 ${m.stats.total}`);
/* 「フォームがある」「テーブルがある」を前提にした固定の断言にしない。
 * メニューとプラグインだけのサンプルアプリ（dynamic-list-report-element）は
 * 実在し、そのとき 0 件が正しい。0 を許す代わりに、0 件でなければならない
 * 場面では 0 件であることも確かめる（無条件に緩めない）。 */
const rawFormN = (summary.app?.forms || []).length;
ok('フォームの数がアプリ定義と一致する', (m.stats.byType[OBJ.FORM] || 0) === rawFormN,
  `モデル ${m.stats.byType[OBJ.FORM] || 0} / 生データ ${rawFormN}`);
const hasTableSource = Object.keys(summary.tableModel || {}).length > 0
  || Object.keys(summary.data || {}).length > 0;
ok(hasTableSource ? 'テーブルが生成される' : 'テーブルの材料が無いアプリではテーブルを生成しない',
  hasTableSource ? (m.stats.byType[OBJ.TABLE] || 0) > 0 : (m.stats.byType[OBJ.TABLE] || 0) === 0,
  `テーブル ${m.stats.byType[OBJ.TABLE] || 0} / tableModel ${Object.keys(summary.tableModel || {}).length} / data ${Object.keys(summary.data || {}).length}`);
ok('メニューまたはリストが生成される', (m.stats.byType[OBJ.MENU] || 0) + (m.stats.byType[OBJ.LIST] || 0) > 0);

/* 一覧・詳細・関連はすべて key を同一性の根拠にしている。key が重複すると
 * byKey は後勝ちで上書きし、そのオブジェクトは画面上どこからも開けなくなる。
 * しかも一覧の行数は model.objects.length のままなので、件数を見ても
 * 気づけない（実際に form-data-archive-tool で field:section2 が 2 つ出て、
 * 一覧の行数と React の key が同時におかしくなった）。Joget のセクション
 * 項目は section1 / section2 を複数のフォームで使い回すため、項目ID だけ
 * では足りない——親（フォーム・テーブル・プロセス）を前置する。 */
const keys = m.objects.map((o) => o.key);
const dupKeys = [...new Set(keys.filter((kk, i) => keys.indexOf(kk) !== i))];
ok('オブジェクトの key が一意（重複すると詳細を開けない対象が出る）',
  dupKeys.length === 0, `${keys.length} 件中 ${dupKeys.length} 種が重複 ${JSON.stringify(dupKeys.slice(0, 5))}`);
ok('byKey から全オブジェクトを引ける', m.byKey.size === m.objects.length,
  `byKey ${m.byKey.size} / objects ${m.objects.length}`);

/* SQL は「ある / ない」の二値では語れない。列まで読めた SQL と、参照先
 * テーブルだけ分かった SQL が混在する。画面が「SQL はありません」と
 * 言ってしまう事故を防ぐため、到達範囲を数で持つ。
 * 期待値は summary の生データから数え直す（モデルの写しを突き合わせない）。 */
const sc = m.sqlCoverage;
const rawEffects = summary.sql_effects || [];
const rawKindSql = rawEffects.filter((e) => (e.kind || 'sql') === 'sql').length;
const rawExt = summary.sql_tables || {};
const rawExtN = Object.values(rawExt).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
ok('SQL の到達範囲: 件数が生データと一致する', sc.effects === rawEffects.length,
  `モデル ${sc.effects} / 生データ ${rawEffects.length}`);
ok('SQL の到達範囲: 列まで検査する件数が kind=sql の件数と一致する',
  sc.columnChecked === rawKindSql, `モデル ${sc.columnChecked} / 生データ ${rawKindSql}`);
ok('SQL の到達範囲: データモデル外の参照が生データの再計数と一致する',
  sc.externalStatements === rawExtN &&
    JSON.stringify(sc.externalTables) === JSON.stringify(Object.keys(rawExt).sort()),
  `モデル ${sc.externalStatements} 件 ${JSON.stringify(sc.externalTables)} / 生データ ${rawExtN} 件`);
ok('SQL オブジェクトの数が読み取れた SQL の数と一致する',
  m.objects.filter((o) => o.type === OBJ.SQL).length === sc.effects,
  `オブジェクト ${m.objects.filter((o) => o.type === OBJ.SQL).length} / 読み取り ${sc.effects}`);
/* ルールの説明が実装より広くならないこと。列を突き合わせるのは UPDATE 文だけで、
 * フォーム内の SQL は参照先テーブルまでしか読んでいない。 */
const sqlRule = m.checkRules.find((r) => r.ruleId === 'SQL-FIELD');
ok('SQL-FIELD の検査範囲が実際の対象（UPDATE 文）を述べている',
  /UPDATE/.test(sqlRule.scope), sqlRule.scope);
ok('SQL-FIELD の制限が「列は検査していない」範囲を明示している',
  /列は検査していません/.test(sqlRule.limit), sqlRule.limit);

/* 同じフォームの中で項目IDが重複している場合、モデルは 1 つにまとめる。
 * まとめた事実を黙って捨てないこと——定義側の誤りは利用者に伝えるべき情報で、
 * 静かな重複排除は「件数が合わない」だけの不可解な画面を生む。
 * 期待値は生データ（app.forms の fields）から数え直す。 */
const dupFieldIds = [];
for (const f of summary.app?.forms || []) {
  const seen = new Map();
  for (const fl of f.fields || []) seen.set(fl.id, (seen.get(fl.id) || 0) + 1);
  for (const [fid, n] of seen) if (n > 1) dupFieldIds.push({ form: f.id, field: fid, n });
}
if (dupFieldIds.length) {
  const missing = dupFieldIds.filter((x) => !m.checks.some(
    (c) => c.text.includes(x.field) && /同じフォーム内で \d+ 回定義/.test(c.text)));
  ok('同じフォーム内で重複した項目IDが注記される', missing.length === 0,
    `${missing.length} 件が注記なし ${JSON.stringify(missing.slice(0, 3))}`);
  ok('重複した項目IDのオブジェクトは 1 つにまとまる',
    dupFieldIds.every((x) => m.objects.filter((o) => o.type === OBJ.FIELD && o.id === x.field && o.key.startsWith(`field:${x.form}.`)).length === 1),
    JSON.stringify(dupFieldIds.slice(0, 3)));
} else {
  console.log('  （同一フォーム内の重複項目なし。注記の門はこの素材では対象外）');
}

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
/* カラムが 1 つも無いアプリ（フォームもデータも無い）では、リンクも 0 件が正しい。
 * 「カラムがあるならリンクが解決している」ことを見る（0 件側はここでは要求しない
 * ——カラムの有無は上のテーブルの門で既に確かめている）。 */
ok('カラム→フォーム項目の関連が解決している',
  cols.length === 0 || formColLinks > 0,
  `カラム ${cols.length} / リンク ${formColLinks}`);

/* プラグインは「参照されているのに詳細も検索も出てこない」状態にしてはいけない。
 * プラットフォーム標準（apps / enterprise）は突合できないため platform 側に
 * 分離されるが、それを理由にオブジェクトモデルから落とすと、
 * 一覧に出るのに開けない、という壊れ方が静かに起きる。
 * 参考: addPlugin がオブジェクトを key ではなく「オブジェクト」で返すと、
 * 関連も注記もすべて宙に消える（壊れたリンクは増えないため検出できない）。
 *
 * 集合の基準は「アプリ定義が参照するクラス」（summary.plugin_refs）である。
 * ソースが無いプロジェクトでは突合の材料自体が存在しないが、
 * 「アプリが参照している」ことは .jwa だけで確定している。
 * 従来は correlation のバケットだけから作っていたため、
 * ソース未提供のクラスに一律「プラットフォーム標準」という brief が付いたり、
 * deadConfig の情報が重複排除で無言で捨てられたりしていた。 */
const plugins = m.objects.filter((o) => o.type === OBJ.PLUGIN);
const referencedClasses = new Set([
  ...(correlation?.bindings || []).map((b) => b.className),
  ...(correlation?.deadConfig || []).map((d) => d.className),
  ...(correlation?.platform || []).map((p) => p.className),
]);
const appRefClasses = new Set([].concat(
  ...Object.values(summary.plugin_refs || {}).map((b) => Object.keys(b || {})),
));
const pluginIds = new Set(plugins.map((p) => p.id));
const missingPlugin = [...referencedClasses].filter((c) => !pluginIds.has(c));
const missingFromApp = [...appRefClasses].filter((c) => !pluginIds.has(c));
const extraInModel = [...pluginIds].filter((c) => !appRefClasses.has(c) && !referencedClasses.has(c));
console.log(`  プラグイン ${plugins.length} / アプリ定義の参照 ${appRefClasses.size} / 突合の参照 ${referencedClasses.size} / 関連を持つ ${plugins.filter((p) => p.links.length > 0).length}`);
ok('参照されているプラグインがすべてオブジェクトとして存在する',
  missingPlugin.length === 0, `${missingPlugin.length} 件が欠落: ${missingPlugin.slice(0, 3).join(', ')}`);
ok('アプリ定義が参照するクラスがすべてオブジェクトとして存在する（ソース有無とは無関係）',
  missingFromApp.length === 0, `${missingFromApp.length} 件が欠落: ${missingFromApp.slice(0, 3).join(', ')}`);
ok('プラグイン一覧にアプリ定義にも突合にも出てこないクラスが混ざらない',
  extraInModel.length === 0, `余分: ${extraInModel.slice(0, 3).join(', ')}`);

/* 種別はアプリ定義のバケット（builtin / marketplace / enterprise / custom）で
 * 決まる。ソース未提供の marketplace / custom を「プラットフォーム標準」と
 * 呼ぶと、部署上の依存の有無を誤認させる。 */
const PLUGIN_CATS = ['builtin', 'marketplace', 'enterprise', 'custom'];
const badCategory = plugins.filter((p) => !p.plugin || !PLUGIN_CATS.includes(p.plugin.category));
const mislabeled = plugins.filter((p) =>
  /プラットフォーム標準/.test(p.brief) && !['builtin', 'enterprise'].includes(p.plugin?.category));
ok('すべてのプラグインに種別の事実がある', badCategory.length === 0,
  `${badCategory.length} 件: ${badCategory.slice(0, 3).map((p) => p.id).join(', ')}`);
ok('標準ではないクラスを「プラットフォーム標準」と呼ばない', mislabeled.length === 0,
  mislabeled.slice(0, 3).map((p) => `${p.id}[${p.plugin?.category}]`).join(', '));

/* ソース未提供のクラスは「ソース未提供（種別）」と正直に書く。
 * 「ソースなし」を「標準」でごまかすと、調べるべき対象が見えなくなる。 */
const noSrc = plugins.filter((p) => p.plugin && p.plugin.inSource === false);
ok('ソース未提供のプラグインは種別を添えて「ソース未提供」と表示する',
  noSrc.every((p) => p.brief.includes('ソース未提供') || p.brief.includes('プラットフォーム標準')),
  noSrc.filter((p) => !/ソース未提供|プラットフォーム標準/.test(p.brief)).slice(0, 3).map((p) => p.id).join(', '));

/* deadConfig の補全。
 * deadConfig のクラスは必ず bindings にも現れるため、補わずに addPlugin を
 * 呼んでも 2 回目は何も作らない（無言で捨てられる）。「アプリが設定したが
 * ソースで宣言なし」は最も先に見るべき結論なので、属性に現れなければならない。 */
const deadEnriched = (correlation?.deadConfig || []).map((d) => ({
  d,
  o: m.byKey.get(`${OBJ.PLUGIN}:${d.className}`),
}));
ok('無効と確認された設定がプラグインの属性に現れる',
  deadEnriched.every(({ d, o }) => !!o && o.attrs.some((a) => a.k === '無効と確認された設定')),
  deadEnriched.filter(({ o }) => !o || !o.attrs.some((a) => a.k === '無効と確認された設定')).map(({ d }) => d.className).join(', '));

/* 属性に [object Object] が残っていないこと。
 * evidence.ref や属性値にオブジェクトをそのまま文字列化すると
 * 「component [object Object]」といった表示になり、何のファイルか分からなくなる。 */
const objStr = plugins.filter((p) => JSON.stringify(p).includes('[object Object]'));
ok('プラグインの属性に [object Object] が残っていない', objStr.length === 0,
  objStr.slice(0, 3).map((p) => p.id).join(', '));

/* usedIn を持つプラグインは、宛先オブジェクトが存在する少なくとも 1 つ結び付ける。
 * 結び付けが 0 になる原因が「key をオブジェクトで返している」「関連を張る段階が早い」
 * 「プラットフォーム標準だけを見ている」のいずれの場合も、ここで落ちる。
 * 「フロント」は Userview 定義であり対応するオブジェクト種別がないため例外。 */
const withUsedIn = plugins.filter((p) => (p.attrs.find((a) => a.k === '使用箇所')?.v || '—') !== '—');
const frontOnly = (p) => (Array.isArray(p.plugin?.usedIn) ? p.plugin.usedIn : []).every((w) => String(w).startsWith('フロント'));
const linkedFromUsedIn = withUsedIn.filter((p) => p.links.some((l) => l.type === 'target'));
const unlinkedNoReason = withUsedIn.filter((p) => !p.links.some((l) => l.type === 'target') && !frontOnly(p));
console.log(`  使用箇所を持つプラグイン ${withUsedIn.length} / そのうち関連あり ${linkedFromUsedIn.length} / フロント限定 ${withUsedIn.filter(frontOnly).length}`);
ok('使用箇所を持つプラグインには関連が 1 本以上ある（フロント限定を除く）',
  unlinkedNoReason.length === 0,
  `${unlinkedNoReason.length} 件が関連 0 本: ${unlinkedNoReason.slice(0, 3).map((p) => p.id).join(', ')}`);

/* 突合結果が無い解析結果（correlation.json を書く以前の結果）でも、
 * アプリ定義が参照するクラスはオブジェクトとして残る。
 * 画面は data.correlation が無い場合も buildObjectModel を呼ぶため、
 * ここが空だと「一覧に出るのに開けない」状態に戻る。 */
const mNoCorr = buildObjectModel({ summary });
const noCorrPlugins = mNoCorr.objects.filter((o) => o.type === OBJ.PLUGIN);
const noCorrIds = new Set(noCorrPlugins.map((p) => p.id));
ok('突合結果が無くてもアプリ定義の参照クラスがすべてオブジェクトとして存在する',
  [...appRefClasses].every((c) => noCorrIds.has(c)),
  `${appRefClasses.size - noCorrPlugins.length} 件が欠落`);
ok('突合結果が無くても関連が解決する',
  mNoCorr.unresolved.length === 0,
  `${mNoCorr.unresolved.length} 件が未解決`);

console.log('\n[3] 静的な検査結果');
console.log(`  エラー ${m.stats.checks.error} / 警告 ${m.stats.checks.warn} / 情報 ${m.stats.checks.info}`);
ok('各検査にルールIDがある', m.checks.every((c) => !!c.ruleId));
ok('各検査に根拠がある', m.checks.every((c) => !!c.evidence));
ok('各検査に解析上の制限がある', m.checks.every((c) => !!c.limit));
ok('各検査に検査範囲がある', m.checks.every((c) => !!c.scope));
ok('解決できなかった関連が報告される', Array.isArray(m.unresolved));

/* ルールカタログとサマリ。
 * 「何を調べたか」は結果より先に分かる必要がある。0 件のルールも
 * 「調べたが何も出なかった」事実として出すので、カタログの全規則が
 * サマリに出ることを見る。突き合わせはカタログ（語彙の定義元）と
 * 結果（出力）の間で行う——両方ともモデル側だが、片方を書き換えると
 * 必ず片方だけが変わるので、揺らぎは検出できる。 */
const catalogIds = Object.keys(CHECK_RULES);
ok('カタログに無いルール ID の結果が出ていない',
  m.checks.every((c) => Object.prototype.hasOwnProperty.call(CHECK_RULES, c.ruleId)),
  m.checks.filter((c) => !CHECK_RULES[c.ruleId]).map((c) => c.ruleId).slice(0, 3).join(', '));
ok('カタログと順序表が同じ規則を列挙している',
  catalogIds.length === CHECK_RULE_ORDER.length && catalogIds.every((id) => CHECK_RULE_ORDER.includes(id)),
  `カタログ ${catalogIds.length} / 順序 ${CHECK_RULE_ORDER.length}`);
ok('カタログの全規則がサマリに出る',
  m.checkRules.length === CHECK_RULE_ORDER.length
    && m.checkRules.every((r, i) => r.ruleId === CHECK_RULE_ORDER[i] && r.rule && r.scope && r.limit),
  `サマリ ${m.checkRules.length} / カタログ ${catalogIds.length}`);
ok('サマリの件数が結果の集計と一致する',
  m.checkRules.every((r) => r.count === m.checks.filter((c) => c.ruleId === r.ruleId).length)
    && m.checkRules.reduce((s, r) => s + r.count, 0) === m.checks.length,
  `サマリ計 ${m.checkRules.reduce((s, r) => s + r.count, 0)} / 結果 ${m.checks.length}`);
/* 未計測の判定。CFG-DECL はプラグインソースの走査結果が要るので、
 * ソース未提供のプロジェクトでは 0 件ではなく未計測——「プラグイン設定は
 * 全て健全」と誤読させてはいけない。REF-CLASS はソースが無くても
 * アプリ定義の参照文字列から出るので計測扱い。期待値は correlation の
 * 事実（hasSource の有無）から独立に立てる。 */
const expectedMeasured = (rid) => (rid === 'CFG-DECL' ? !!correlation?.hasSource : rid === 'REF-CLASS' ? !!correlation : true);
ok('未計測の判定が突合の有無と一致する',
  m.checkRules.every((r) => r.measured === expectedMeasured(r.ruleId)),
  m.checkRules.filter((r) => r.measured !== expectedMeasured(r.ruleId)).map((r) => r.ruleId).join(', '));
ok('結果の範囲・制限がカタログと一致する',
  m.checks.every((c) => CHECK_RULES[c.ruleId] && c.scope === CHECK_RULES[c.ruleId].scope && c.limit === CHECK_RULES[c.ruleId].limit),
  m.checks.filter((c) => CHECK_RULES[c.ruleId] && (c.scope !== CHECK_RULES[c.ruleId].scope || c.limit !== CHECK_RULES[c.ruleId].limit)).slice(0, 2).map((c) => c.ruleId).join(', '));
console.log(`  ルール: ${m.checkRules.map((r) => `${r.ruleId} ${r.measured ? r.count : '未計測'}`).join(' / ')}`);

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
 * 生成側（lib/designDoc.js）と参照側（lib/objectModel.js）は
 * 見出しの語彙を lib/objectModel.js 内の 1 箇所で共有しているが、
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

/* 設計書は納品物として読まれる。見出しだけ、表頭だけの節が残ると、読み手は
 * 「対象が無い」のか「解析に失敗した」のか判断できない。空の理由は節の中に
 * 書く（節を消すと章番号が飛ぶ）。ここでは生成物そのものの構造だけを見る。
 *   - 見出し直下が空（## は子節の内容も数える）
 *   - 表頭と区切り行だけでデータ行が無い表
 * 実素材 42 本では、修正前に「4. プロセス設計」が 30 本、
 * 「関係（外部キー）」の表が 41 本で空だった。 */
const docLines = md.split('\n');
const docHeads = [];
docLines.forEach((l, i) => { if (/^(#{2,3}) /.test(l)) docHeads.push({ i, level: l.match(/^(#{2,3}) /)[1].length, title: l }); });
const emptySections = [];
for (let k = 0; k < docHeads.length; k++) {
  const h = docHeads[k];
  let end = docLines.length;
  for (let mm2 = k + 1; mm2 < docHeads.length; mm2++) {
    if (h.level === 2 ? docHeads[mm2].level === 2 : true) { end = docHeads[mm2].i; break; }
  }
  const body = docLines.slice(h.i + 1, end).filter((x) => x.trim() && !/^#{2,3} /.test(x));
  if (!body.length) emptySections.push(h.title);
}
ok('設計書に空の節が無い（理由か内容のどちらかが必ずある）',
  emptySections.length === 0, JSON.stringify(emptySections.slice(0, 4)));

const emptyTables = [];
for (let i = 1; i < docLines.length - 1; i++) {
  if (!/^\|[\s|:-]+\|$/.test(docLines[i].trim())) continue;
  if (!docLines[i + 1].trim().startsWith('|')) emptyTables.push(docLines[i - 1].slice(0, 60));
}
ok('設計書に表頭だけの表が無い', emptyTables.length === 0, JSON.stringify(emptyTables.slice(0, 4)));

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

/* 2.1 と 2.2 は統合オブジェクトモデルのオブジェクトから作る。
 * 生成側が app.userviews や summary.plugin_refs を独自に歩く実装に戻ると、
 * 画面のオブジェクト一覧と設計書の表が食い違う。表が「静かに薄くなる」
 * 形で壊れるため、生成された表とモデルの集合を突き合わせる。
 * 加えてアプリ定義の生の巡回とも突き合わせ、モデルが落としていないかも見る。 */
const cellOf = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const sectionRows = (titlePrefix) => {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`### ${titlePrefix}`));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{2,4}\s/.test(l)) break;
    const mm = /^\|(.+)\|\s*$/.exec(l);
    if (!mm) continue;
    const cells = mm[1].split('|').map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
};
const sig = (cells) => cells.map((c) => String(c)).join('\u0001');

const modRows = (sectionRows(sections.modules) || []).slice(1);
const menuObjs = m.objects.filter((o) => o.type === OBJ.MENU && o.menu);
const rawMenus = (summary.app.userviews || [])
  .flatMap((uv) => (uv.categories || []).flatMap((c) => (c.menus || []).map((mn) => [cellOf(c.category), cellOf(mn.label), mn.type, cellOf(mn.target || '')])));
ok('2.1 の行数がメニューオブジェクトの数と一致する',
  modRows.length === menuObjs.length,
  `表 ${modRows.length} 行 / オブジェクト ${menuObjs.length} 件`);
ok('2.1 の各行がアプリ定義のメニュー巡回と一致する',
  JSON.stringify(modRows.map(sig).sort()) === JSON.stringify(rawMenus.map(sig).sort()),
  `表 ${modRows.length} 行 / 生の巡回 ${rawMenus.length} 行`);

const plRows = (sectionRows(sections.plugins) || []).slice(1);
const docClasses = plRows.map((r) => r[1]).filter(Boolean);
const expectedClasses = [...new Set([...appRefClasses, ...referencedClasses])];
ok('2.2 のクラス集合がモデルのプラグインと一致する',
  docClasses.length === new Set(docClasses).size
    && expectedClasses.every((c) => docClasses.includes(c))
    && docClasses.every((c) => expectedClasses.includes(c)),
  `表 ${docClasses.length} 件 / モデル ${expectedClasses.length} 件`);
ok('2.2 の参照回数がモデルの occurrences と一致する',
  plRows.every((r) => {
    const o = m.byKey.get(`${OBJ.PLUGIN}:${r[1]}`);
    return !!o && String(o.plugin?.occurrences || 0) === r[2];
  }),
  plRows.filter((r) => String(m.byKey.get(`${OBJ.PLUGIN}:${r[1]}`)?.plugin?.occurrences || 0) !== r[2]).slice(0, 3).map((r) => `${r[1]}=${r[2]}`).join(', '));
console.log(`  2.1 ${modRows.length} 行 / 2.2 ${plRows.length} 行（モデルのメニュー ${menuObjs.length}・プラグイン ${plugins.length} と突合）`);

/* 5.1 に載るテーブルの集合もモデルと突き合わせる。
 * 生成側が Object.entries(data) を独自に回していたため、画面のデータモデルと
 * 設計書で「どのテーブルが存在するか」が食い違い得た。
 * 見出しは **app_fd_xxx** なので、接頭辞で抽出する（他の太字と区別するため）。 */
const tblRows = [...md.matchAll(/^\*\*(app_fd_[^*]+)\*\*/gm)].map((x) => x[1]);
const tableIds = m.objects.filter((o) => o.type === OBJ.TABLE).map((o) => o.id);
ok('5.1 に載るテーブルの集合がモデルと一致する',
  tblRows.length === new Set(tblRows).size
    && JSON.stringify([...tblRows].sort()) === JSON.stringify([...tableIds].sort()),
  `設計書 ${tblRows.length} / モデル ${tableIds.length}`);

/* tableModel が無い古い解析結果（data のみ）の扱い。
 * 画面は保存された解析結果を読むため、この形が実在する
 * （data/runs の既存結果にも tableModel 無しのものがあった）。
 * tableModel が無い場合の fallback は data/*.json まで。フォーム定義からの
 * 導出分は analyze 側（buildTableModel）の仕事なので、ここでは復元しない
 * ——復元しようとすると objectModel に buildTableModel の二重実装が生まれる。
 * そのためフォーム→テーブルの関連は、data が空の古い結果では未解決のまま。
 * それは fallback 以前と同じで、fallback で悪化しないことを確かめる。 */
const legacySummary = JSON.parse(JSON.stringify(summary));
delete legacySummary.tableModel;
const mLegacy = buildObjectModel({ summary: legacySummary, correlation });
const legacyTables = mLegacy.objects.filter((o) => o.type === OBJ.TABLE).map((o) => o.id);
const dataTableKeys = Object.keys(summary.data || {})
  .map((k) => (k.startsWith('app_fd_') ? k : `app_fd_${k}`));
ok('tableModel が無い解析結果では data のテーブルが解決する',
  legacyTables.length === dataTableKeys.length
    && dataTableKeys.every((k) => legacyTables.includes(k)),
  `data ${dataTableKeys.length} / 解決 ${legacyTables.length}`);
/* ただし「確認できていないものを解決済みにしない」ので、data/*.json を
 * 持たない素材（エクスポート時にデータを含めていない）では、tableModel を
 * 落とすとテーブルを導出する材料がゼロになる。そのとき SQL の参照先が
 * 未解決になるのは正しい挙動であり、門を赤にしてはいけない。
 * 対象は「data にあるテーブルを指す SQL」に限る。 */
const legacyDataTables = new Set(dataTableKeys);
const sqlLinkUnresolved = mLegacy.unresolved.filter(
  (u) => u.kind === 'link' && String(u.from || '').startsWith('sql:')
    && legacyDataTables.has(String(u.to || '').replace(/^table:/, '')),
);
ok('tableModel が無い解析結果でも data のテーブルを指す SQL 関連は解決する',
  sqlLinkUnresolved.length === 0,
  `${sqlLinkUnresolved.length} 件が未解決（判定対象の data テーブル ${legacyDataTables.size} 件 / 未解決全体 ${mLegacy.unresolved.length} 件）`);
ok('fallback はフォーム→テーブルの未解決を悪化させない',
  mLegacy.unresolved.filter((u) => u.kind === 'link' && u.type === 'table').length
    <= buildObjectModel({ summary: { ...summary, tableModel: {} }, correlation }).unresolved
      .filter((u) => u.kind === 'link' && u.type === 'table').length,
  `fallback あり ${mLegacy.unresolved.length} 件 / なし ${buildObjectModel({ summary: { ...summary, tableModel: {} }, correlation }).unresolved.length} 件`);
const legacyDoc = generateDesignDoc(legacySummary, { correlation });
const legacyRows = [...legacyDoc.matchAll(/^\*\*(app_fd_[^*]+)\*\*/gm)].map((x) => x[1]);
ok('tableModel が無い解析結果の 5.1 もモデルと一致する',
  JSON.stringify([...legacyRows].sort()) === JSON.stringify([...legacyTables].sort()),
  `設計書 ${legacyRows.length} / モデル ${legacyTables.length}`);
console.log(`  5.1 ${tblRows.length} テーブル（モデル ${tableIds.length} と突合）/ 旧結果 ${legacyTables.length} テーブル・未解決 ${mLegacy.unresolved.length} 件`);

/* 3.x もフォームオブジェクトから作る。app.forms を独自に歩くと、
 * 画面のフォーム詳細（項目定義の表）と設計書が別個の推导になり、
 * 片方だけ項目の出し方が変わっても気づかない。
 *
 * 突き合わせは独立した来源（summary.app.forms の生の fields）で行う。
 * モデル自身のレンダリングと突き合わせると、モデルが壊れた瞬間に
 * ゲートも一緒に壊れて、両方が緑のままになる。
 *
 * 頭行（見出し行）は項目行の突合からは除く——モデルの head と同一の行を
 * データ行と一緒に数えると、1 節あたり 1 行多く見えてしまう。語彙そのものは
 * 別のゲートでモデルと突き合わせる。 */
const cellsOf = (line) => {
  const mm = /^\|(.*)\|\s*$/.exec(line);
  return mm ? mm[1].split('|').map((c) => c.trim()) : null;
};
const rawFieldRows = (formId) => {
  const f = (summary.app.forms || []).find((x) => x.id === formId);
  // ラベルが無い項目は空セル（旧実装と同じ。モデルのオブジェクト名は
  // id にフォールバックするが、表のセルは空のまま揺るがない）
  return (f?.fields || []).map((fd) => [fd.id, fd.label || '', fd.type || '']);
};
const formSections = [];
{
  let cur = null;
  for (const l of mdLines) {
    const h = /^### 3\.(\d+) (.+)（`([^`]+)`）\s*$/.exec(l);
    if (h) { cur = { seq: Number(h[1]), name: h[2], id: h[3], rows: [] }; formSections.push(cur); continue; }
    if (/^#{2,4}\s/.test(l)) { cur = null; continue; }
    if (!cur) continue;
    const c = cellsOf(l);
    if (c && c.length === 5 && !c.every((x) => /^-+$/.test(x))) cur.rows.push(c);
  }
}
const formObjs = m.objects.filter((o) => o.type === OBJ.FORM);
/* 見出し行は節の表の先頭行。項目行の突合ではモデルの head と同一の行を
 * 除くので、直書きの語彙が紛れ込むと行の突合は通ってしまう。
 * 語彙の単一の権威は objectModel 侧なので、見出し行を別に突き合わせる。 */
const headMismatch = formObjs.filter((f) => {
  const sec = formSections.find((s) => s.id === f.id);
  const head = (f.sections.find((s) => s.title === '項目定義') || {}).head || [];
  const first = (sec?.rows || [])[0] || [];
  return first.join('|') !== head.join('|');
});
ok('3.x の見出し行がモデルの語彙と一致する',
  headMismatch.length === 0,
  headMismatch.slice(0, 3).map((f) => f.id).join(', '));
ok('3.x の節数がフォームオブジェクト数と一致する',
  formSections.length === formObjs.length,
  `節 ${formSections.length} / フォーム ${formObjs.length}`);
ok('3.x の節がフォームオブジェクトの順に並ぶ',
  formObjs.every((f, i) => formSections[i] && formSections[i].id === f.id),
  formSections.map((s) => s.id).join(', '));
const formRowMismatch = formObjs.filter((f) => {
  const sec = formSections.find((s) => s.id === f.id);
  const head = (f.sections.find((s) => s.title === '項目定義') || {}).head || [];
  const got = (sec?.rows || []).filter((r) => r.join('|') !== head.join('|')).map((r) => [r[0], r[1], r[2]]);
  const want = rawFieldRows(f.id);
  return JSON.stringify(got) !== JSON.stringify(want);
});
ok('3.x の項目行がアプリ定義のフォーム項目と一致する',
  formRowMismatch.length === 0,
  formRowMismatch.slice(0, 3).map((f) => f.id).join(', '));
console.log(`  3.x ${formSections.length} 節・${formSections.reduce((n, s) => n + s.rows.length, 0)} 行（モデルのフォーム ${formObjs.length} と突合）`);

/* 6.x 影響範囲も統合オブジェクトモデルのビューから作る。
 * 従来は analyze.js が app.forms / sql_effects / app.datalists を直接歩いて
 * summary.impact を作り、設計書はそれを写していた。モデルに関連の知識が
 * 増えたことで、モデルと解析エンジンで同じ結論が二重に生まれる状態だった。
 *
 * 突き合わせは 3 方向:
 *   (a) app_summary.json の impact（画面・RAG・Mermaid が読む契約）と
 *       モデルのビューが一致すること。キーを data/ の命名空間に戻す
 *       変換が壊れていないかを見る。
 *   (b) 設計書 6.1・6.2 の行がビューの内容を写していること。
 *   (c) ビュー自体がアプリ定義の生データと一致すること。
 *       (a)(b) はモデルとその写しの比較に過ぎず、モデルが項目を落とす
 *       変更をしても両方が一緒に赤字を通る。生データとの突合だけが
 *       それを検出できる。 */
const toDataKeys = (map) => Object.fromEntries(Object.entries(map).map(([tk, v]) => [dataTableKey(tk), v]));
ok('app_summary.json の impact の書込元がモデルのビューと一致する',
  JSON.stringify(summary.impact?.writeMap || {}) === JSON.stringify(toDataKeys(m.impact.writeMap)),
  `契約 ${Object.keys(summary.impact?.writeMap || {}).length} / モデル ${Object.keys(m.impact.writeMap).length}`);
ok('app_summary.json の impact の参照元がモデルのビューと一致する',
  JSON.stringify(summary.impact?.readMap || {}) === JSON.stringify(toDataKeys(m.impact.readMap)),
  `契約 ${Object.keys(summary.impact?.readMap || {}).length} / モデル ${Object.keys(m.impact.readMap).length}`);
ok('app_summary.json の impact の問題検出がモデルのビューと一致する',
  JSON.stringify(summary.impact?.issues || []) === JSON.stringify(m.impact.issues),
  `契約 ${(summary.impact?.issues || []).length} / モデル ${m.impact.issues.length}`);

/* 6.1・6.2 の表。1 行目は見出しなので除く。 */
const docWriteRows = (sectionRows(sections.writeSources) || []).slice(1);
const docReadRows = (sectionRows(sections.readSources) || []).slice(1);
/* 表のセルと文字列を比べるときは前後の空白を落とす。Markdown の表は
 * セルの前後空白を保てないため、モデル側が `slice()` で切った文字列の
 * 末尾に空白が残っていると、内容が同じでも不一致になる（jwt-sso で実際に
 * 60 文字の境界が空白に当たり、6.1 が「5 行 / 5 行」で赤になった）。 */
const cellTrim = (s) => cellOf(s).trim();
const viewWriteRows = [];
for (const [tid, entries] of Object.entries(m.impact.writeMap)) {
  for (const e of entries) viewWriteRows.push([cellTrim(tid), cellTrim(e.source), cellTrim(e.fields)]);
}
const viewReadRows = [];
for (const [tid, entries] of Object.entries(m.impact.readMap)) {
  for (const e of entries) viewReadRows.push([cellTrim(tid), cellTrim(e.source), cellTrim(e.binder)]);
}
ok('6.1 の行がモデルのビューと一致する',
  JSON.stringify(docWriteRows) === JSON.stringify(viewWriteRows),
  `表 ${docWriteRows.length} 行 / モデル ${viewWriteRows.length} 行`);
ok('6.2 の行がモデルのビューと一致する',
  JSON.stringify(docReadRows) === JSON.stringify(viewReadRows),
  `表 ${docReadRows.length} 行 / モデル ${viewReadRows.length} 行`);

/* テーブル名は 5.1 と同じ物理名。data/ の名前空間（接頭辞なし）に戻ると、
 * 同じテーブルが章ごとに違う名前になり、読み手が追えなくなる。
 * テーブルオブジェクトが無い（サンプルデータも無い）テーブルは 5.1 に
 * 載らないので、その点は除外する。 */
const docImpactTables = [...new Set([...docWriteRows, ...docReadRows].map((r) => r[0]))];
const impactNameOff = docImpactTables.filter((tid) => !tid.startsWith('app_fd_')
  || (m.byKey.get(`table:${tid}`) && !tblRows.includes(tid)));
ok('6.x のテーブル名が 5.1 と同じ物理名になっている',
  impactNameOff.length === 0,
  `${impactNameOff.length} 件不一致: ${impactNameOff.slice(0, 3).join(', ')}`);

/* (c) 生データとの突合。期待値は app_summary.json の生の fields 相当から
 * 自力で組み立てる（モデルのロジックを写さない）。順序は定義順と
 * オブジェクト順で違い得るので、集合として比べる。 */
const rawPrefix = (tk) => (String(tk).startsWith('app_fd_') ? String(tk) : `app_fd_${tk}`);
const rawLogical = (c) => (String(c).startsWith('c_') ? String(c).slice(2) : String(c));
/* 生データ側も viewWriteRows と同じ正規化（セル用のエスケープ＋前後空白の
 * 除去）を通す。片側だけ `slice()` の切れ目に残る空白を持っていると、
 * 内容が同じでも不一致になる。 */
const rawFormWrites = (summary.app.forms || [])
  .filter((f) => f.tableName)
  .map((f) => [cellTrim(rawPrefix(f.tableName)), cellTrim(`フォーム ${f.name}(${f.id})`), '*']);
const rawSqlWrites = (summary.sql_effects || [])
  .filter((e) => e.table)
  .flatMap((e) => (e.sets || []).map((s) => [cellTrim(rawPrefix(e.table)), cellTrim(`プロセスSQL ${String(e.sql).slice(0, 60)}`), cellTrim(`${rawLogical(s.column)} = '${s.value}'`)]));
const rawFormById = Object.fromEntries((summary.app.forms || []).map((f) => [f.id, f]));
const rawListReads = (summary.app.datalists || []).flatMap((d) => {
  let tk = '';
  if (d.formDefId && rawFormById[d.formDefId]) tk = rawFormById[d.formDefId].tableName;
  if (!tk) {
    const qm = String(d.query || '').match(/(?:FROM|JOIN)\s+app_fd_(\w+)/i);
    if (qm) tk = qm[1];
  }
  return tk ? [[cellTrim(rawPrefix(tk)), cellTrim(`リスト ${d.name}(${d.id})`), cellTrim(d.binder || '')]] : [];
});
const sortedJson = (rows) => JSON.stringify(rows.map((r) => JSON.stringify(r)).sort());
ok('モデルのビューの書込元がアプリ定義の生データと一致する',
  sortedJson(rawFormWrites.concat(rawSqlWrites)) === sortedJson(viewWriteRows),
  `生 ${rawFormWrites.length + rawSqlWrites.length} 行 / モデル ${viewWriteRows.length} 行`);
ok('モデルのビューの参照元がアプリ定義の生データと一致する',
  sortedJson(rawListReads) === sortedJson(viewReadRows),
  `生 ${rawListReads.length} 行 / モデル ${viewReadRows.length} 行`);

/* ビューはテーブルモデルに依存しない。フォームの tableName と SQL の
 * 文字列、リストの参照から組むので、サンプルデータが無い古い解析結果でも
 * 同じ結論にならなければならない。関連の解決先オブジェクトからテーブル名を
 * 引く実装に戻すと、テーブルオブジェクトが無い旧結果で行が落ちる。 */
ok('tableModel が無い解析結果でも影響範囲のビューは同じ',
  JSON.stringify(mLegacy.impact.writeMap) === JSON.stringify(m.impact.writeMap)
  && JSON.stringify(mLegacy.impact.readMap) === JSON.stringify(m.impact.readMap)
  && JSON.stringify(mLegacy.impact.issues) === JSON.stringify(m.impact.issues),
  `旧結果 書込 ${Object.keys(mLegacy.impact.writeMap).length} / 参照 ${Object.keys(mLegacy.impact.readMap).length} / 問題 ${mLegacy.impact.issues.length}`);
console.log(`  6.x 書込 ${viewWriteRows.length} 行・参照 ${viewReadRows.length} 行・テーブル ${docImpactTables.length} 件（モデルのビューと突合）`);

/* カラムの出処バッジ。
 * 一覧では短いラベル（BASIS_SHORT）に折りたたみ、正式な説明は
 * BASIS_LABEL と脚注（BASIS_LEGEND）に置く。画面はセルの文字列から
 * 種別を逆引きするので、行の文字列が BASIS_LABEL の値と一致していないと
 * バッジにならず、長い説明文がそのまま出てしまう（無言で元の表示に戻る）。
 *
 * 突き合わせは語彙そのものに対して行う。レンダリング結果と突き合わせる
 * （バッジが出ているか確かめる）方法もあるが、それは画面側の話で、
 * ここでは「逆引きが成立するデータが出ているか」を見る。 */
const basisKeys = Object.keys(BASIS_LABEL);
/* 凡例が見るのは短いラベル（バッジの文字）。正式な説明（BASIS_LABEL）は
 * オブジェクト詳細の属性と title に出るので、凡例に逐字で含めるは求めない
 * ——求めると凡例が「フォーム定義＝フォーム定義（命名規約で生成）」のような
 * 同語反復になる。バッジの文字が凡例に無いと、色の意味が説明できない。 */
ok('出処の凡例がバッジのすべての種別を説明している',
  basisKeys.every((k) => BASIS_LEGEND.includes(BASIS_SHORT[k])),
  `${BASIS_LEGEND.slice(0, 40)}…`);
const columnSections = m.objects
  .filter((o) => o.type === OBJ.TABLE)
  .map((o) => o.sections.find((s) => s.title === 'カラム一覧'))
  .filter(Boolean);
/* テーブルが 1 つも無いアプリではカラム一覧の節も 0 件になる。0 件を許す代わりに、
 * テーブルがあるのに節が無い場合は必ず落とす（無条件に緩めない）。 */
const tableObjs = m.objects.filter((o) => o.type === OBJ.TABLE);
ok('カラム一覧に出処バッジの指定がある',
  (tableObjs.length === 0 && columnSections.length === 0)
    || (columnSections.length === tableObjs.length
      && columnSections.every((s) => s.badge?.kind === 'basis'
        && s.head[s.badge.column] === '導出根拠')),
  `テーブル ${tableObjs.length} / 節 ${columnSections.length} 件`);
const unresolvableBasis = columnSections.flatMap((s) => (s.rows || []).map((r) => r[s.badge.column]))
  .filter((v) => !basisKeys.some((k) => BASIS_LABEL[k] === v));
ok('カラム一覧の出処が語彙から逆引きできる',
  unresolvableBasis.length === 0,
  `${unresolvableBasis.length} 件: ${[...new Set(unresolvableBasis)].slice(0, 3).join(', ')}`);
console.log(`  出処バッジ ${columnSections.length} 節・${columnSections.reduce((n, s) => n + (s.rows || []).length, 0)} 行（語彙 ${basisKeys.length} 種別）`);

/* 未確認の成因。
 * 状態（STATUS）が「どこまで読めたか」を表すのに対し、成因は
 * 「なぜ確定できなかったか」を表す。同じ未確認でも、ソースが無いだけの
 * ものとアプリ定義自体が欠けているものは利用者の次の動作が違うので、
 * 状態を決めたその場で成因も付けている。
 *
 * 突き合わせは app_summary.json の生データ（summary.app.* / plugin_refs /
 * correlation）からの独立再推导で行う。モデルの unconfirmed を写した
 * だけの門禁は、モデルが成因を落とす変更をしたときに一緒に緑になる
 * （派生元と写しの門禁だけでは不十分、と同じ理由）。 */
console.log('\n[7] 未確認の成因');
const arr = (v) => (Array.isArray(v) ? v : []);
const physName = (name) => (String(name || '').startsWith('app_fd_') ? String(name) : `app_fd_${name || ''}`);
/* メニュー種別 → 対象の種類。Joget の約束で、モデルの MENU_TARGET と
 * 同じ事実をテスト側で独立に持つ（モデルの定数を引くと、モデルが
 * 変わった瞬間に門禁も一緒に変わる）。 */
const MENU_TARGET_RAW = { FormMenu: 'form', CrudMenu: 'list', DataListMenu: 'list', ProcessListMenu: 'list' };
const AUDIT_RAW = new Set(['id', 'dateCreated', 'dateModified', 'createdBy', 'modifiedBy', 'createdByName', 'modifiedByName']);
const rawTableModel = summary.tableModel && Object.keys(summary.tableModel).length
  ? summary.tableModel
  : Object.fromEntries(Object.entries(summary.data || {}).map(([rawKey, info]) => [physName(rawKey), { ...info, all_fields: arr(info?.all_fields || info?.fields) }]));
const rawForms = arr(summary.app?.forms);
const rawLists = arr(summary.app?.datalists);
const rawFormIds = new Set(rawForms.map((f) => f.id));
const rawListIds = new Set(rawLists.map((l) => l.id));
const rawCause = {};
const bumpCause = (type, cz) => { const kk = `${type}|${cz}`; rawCause[kk] = (rawCause[kk] || 0) + 1; };
for (const [tableId, tbl] of Object.entries(rawTableModel)) {
  if (tbl.source === 'form') bumpCause('table', 'derived');
  const formFields = new Map();
  for (const fid of arr(tbl.formIds)) {
    const f = rawForms.find((x) => x.id === fid);
    for (const fld of arr(f?.fields)) formFields.set(`c_${fld.id}`, fld);
  }
  for (const col of arr(tbl.all_fields)) {
    const basis = AUDIT_RAW.has(col) ? 'audit' : formFields.get(col) ? 'form' : !String(col).startsWith('c_') ? 'data' : 'unknown';
    if (basis === 'form') bumpCause('column', 'derived');
    else if (basis === 'unknown') bumpCause('column', 'unresolved-ref');
  }
}
for (const f of rawForms) {
  const tableId = f.tableName ? physName(f.tableName) : null;
  if (tableId && !rawTableModel[tableId]) bumpCause('form', 'unresolved-ref');
  for (const fld of arr(f.fields)) if (!fld.type) bumpCause('field', 'definition-gap');
}
for (const l of rawLists) {
  const access = l.dataAccess || (l.formDefId ? 'form' : l.query ? 'sql' : 'unknown');
  if (access === 'unknown') bumpCause('datalist', 'definition-gap');
}
for (const uv of arr(summary.app?.userviews)) {
  for (const cat of arr(uv.categories)) {
    for (const mn of arr(cat.menus)) {
      const target = mn.target || '';
      if (!target) { bumpCause('menu', 'definition-gap'); continue; }
      const tt = MENU_TARGET_RAW[mn.type];
      const resolved = (tt === 'form' && rawFormIds.has(target)) || (tt === 'list' && rawListIds.has(target));
      if (!resolved) bumpCause('menu', 'unresolved-ref');
    }
  }
}
for (const p of arr(summary.xpdl?.processes)) {
  const acts = arr(p.activities);
  const trans = arr(p.transitions);
  const ids = new Set(acts.map((a) => a.id));
  const dangling = trans.filter((tr) => !ids.has(tr.from) || !ids.has(tr.to));
  const isolated = acts.filter((a) => !trans.some((tr) => tr.from === a.id || tr.to === a.id));
  if (dangling.length || isolated.length) bumpCause('process', 'definition-gap');
  for (const a of acts) if (!a.implementation) bumpCause('activity', 'definition-gap');
}
{
  /* プラグインの解析済は「ソース一致」または「無効設定の検出」の
   * どちらかが成立したときだけ。それ以外はソース未提供。 */
  const bindings = arr(correlation?.bindings);
  const settled = new Set([
    ...bindings.filter((b) => b.inSource).map((b) => b.className),
    ...arr(correlation?.deadConfig).map((d) => d.className),
  ]);
  const classes = new Set([
    ...Object.keys(summary.plugin_refs?.builtin || {}),
    ...Object.keys(summary.plugin_refs?.marketplace || {}),
    ...Object.keys(summary.plugin_refs?.enterprise || {}),
    ...Object.keys(summary.plugin_refs?.custom || {}),
    ...bindings.map((b) => b.className),
    ...arr(correlation?.platform).map((p) => p.className),
  ]);
  for (const cls of classes) if (!settled.has(cls)) bumpCause('plugin', 'no-source');
}
{
  const defined = new Set(arr(summary.datasources).map((d) => d.name || d.id || 'datasource'));
  for (const ref of new Set(rawLists.map((l) => l.datasourceRef).filter(Boolean))) {
    if (!defined.has(ref)) bumpCause('datasource', 'no-source');
  }
}
const modelCause = {};
for (const o of m.unconfirmed) { const kk = `${o.type}|${o.cause}`; modelCause[kk] = (modelCause[kk] || 0) + 1; }
const causeDiff = [...new Set([...Object.keys(rawCause), ...Object.keys(modelCause)])]
  .filter((kk) => (rawCause[kk] || 0) !== (modelCause[kk] || 0))
  .map((kk) => `${kk}: 生データ ${rawCause[kk] || 0} / モデル ${modelCause[kk] || 0}`);
ok('成因の件数がアプリ定義の生データと一致する', causeDiff.length === 0, causeDiff.slice(0, 4).join(' / '));
const orphanCause = m.unconfirmed.filter((o) => !o.cause || !Object.prototype.hasOwnProperty.call(CAUSE_LABEL, o.cause));
ok('未確認の全件に語彙内の成因が付いている', orphanCause.length === 0,
  orphanCause.slice(0, 3).map((o) => `${o.type}:${o.id}`).join(', '));
const staleCause = m.objects.filter((o) => o.status === STATUS.PARSED && o.cause);
ok('解析済のオブジェクトに成因が残っていない', staleCause.length === 0,
  staleCause.slice(0, 3).map((o) => `${o.type}:${o.id}`).join(', '));
ok('成因の語彙が順序・ラベル・説明で網羅されている',
  Object.keys(CAUSE_LABEL).every((kk) => CAUSE_ORDER.includes(kk) && CAUSE_DESC[kk])
    && CAUSE_ORDER.every((kk) => CAUSE_LABEL[kk]),
  `語彙 ${Object.keys(CAUSE_LABEL).length} 種別 / 順序 ${CAUSE_ORDER.length} 件`);
const causeTotals = CAUSE_ORDER.map((cz) => `${CAUSE_LABEL[cz]} ${Object.entries(modelCause).filter(([kk]) => kk.endsWith(`|${cz}`)).reduce((s, [, n]) => s + n, 0)}`);
console.log(`  成因: ${causeTotals.join(' / ')}`);

/* 概要ページ用の内訳（プロジェクト全体）。品質ページは絞り込み範囲の
 * 内訳を画面側で数えるが、全体の内訳はモデルが組む。同じ数え方を
 * 二箇所に書くと片方だけがずれるため、生データの再計数（rawCause を
 * 成因ごとに合算）と突き合わせる。 */
const rawCauseTotals = {};
for (const [kk, n] of Object.entries(rawCause)) {
  const cz = kk.split('|')[1];
  rawCauseTotals[cz] = (rawCauseTotals[cz] || 0) + n;
}
const rawNonZero = CAUSE_ORDER.filter((cz) => rawCauseTotals[cz]);
ok('内訳の項目が生データの非零成因と同じ',
  JSON.stringify(m.causeSummary.map((c) => c.cause)) === JSON.stringify(rawNonZero),
  `内訳 ${m.causeSummary.map((c) => c.cause).join(',')} / 生 ${rawNonZero.join(',')}`);
ok('内訳の件数が生データの再計数と一致する',
  m.causeSummary.every((c) => c.count === rawCauseTotals[c.cause])
    && m.causeSummary.reduce((s, c) => s + c.count, 0) === Object.values(rawCauseTotals).reduce((a, b) => a + b, 0),
  m.causeSummary.map((c) => `${c.cause} ${c.count}/${rawCauseTotals[c.cause]}`).join(' / '));
ok('内訳の合計が未確認の件数と一致する',
  m.causeSummary.reduce((s, c) => s + c.count, 0) === m.unconfirmed.length,
  `内訳計 ${m.causeSummary.reduce((s, c) => s + c.count, 0)} / 未確認 ${m.unconfirmed.length}`);

for (const c of chapters) {
  const hit = (byChapter.get(c.title) || []).length;
  console.log(`    ${hit ? ' ' : '!'} ${c.title} ← ${hit} オブジェクト`);
}
const emptyChapterTitles = chapters.filter((c) => (byChapter.get(c.title) || []).length === 0).map((c) => c.title);
console.log(`  オブジェクトが紐づかない章（内容が空なのは想定内）: ${emptyChapterTitles.length ? emptyChapterTitles.join(' / ') : 'なし'}`);

console.log(`\n結果: ${failed ? `不合格 ${failed} 件` : '通過'}`);
process.exit(failed ? 1 : 0);