/**
 * test-ui.mjs — UI スモークテスト（新しい情報アーキテクチャ版）
 *
 * 前提: サーバーが http://localhost:3000 で起動していること
 * 使い方: node test-ui.mjs
 *
 * 画面は日本語のみ。言語切替のテストは存在しない。
 *
 * 検証の方針:
 *  - サイドナビの全項目を順に開き、各画面で「日本語の見出し」と
 *    「空でないこと」を確認する（画面が真っ白でも失敗にする）。
 *  - 主要な画面（オブジェクト詳細・データモデル・設計書センター）は
 *    内容のアサーションまで行う。
 *  - Mermaid を置いた画面は SVG が実際に出ていることを確認する。
 *    （prop 名を間違えると code が undefined になり、図もエラーも出ない
 *      サイレント故障になるので、ここで捕まえる）
 *  - ページエラーと失敗リクエストはすべて失敗として数える。
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

/* 成因の語彙は統合オブジェクトモデルが持つ。画面の断言も同じ定義元と
 * 突き合わせる（ここに文言を書き直すと、モデル側の変更に追いつかない）。 */
const require = createRequire(import.meta.url);
const { CAUSE_LABEL, CAUSE_DESC, OBJ } = require('./lib/objectModel.js');

/* [14] の「未計測のルール」の期待値は、解析エンジンからその場で組む
 * （理由は下の findJwa の直前の注を参照）。 */
const { analyze } = require('./lib/analyze.js');
const { correlate } = require('./lib/correlate.js');
const { scanPluginSource } = require('./lib/pluginScan.js');
const { buildObjectModel } = require('./lib/objectModel.js');

const CANDIDATES = [
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
  path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
];
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) { console.error('Chromium が見つかりません'); process.exit(1); }

const OUT = path.join(process.cwd(), 'data', 'shots');
mkdirSync(OUT, { recursive: true });

// 同梱の Apache-2.0 サンプルを既定の解析対象にする（顧客アプリは同梱しない）
const PROJECT = process.env.JOGET_PROJECT || path.join(process.cwd(), 'fixtures', 'enhanced-json-api-main');
const SELF = process.cwd();
// 同梱フィクスチャの置き場（常にこのパス）
const FIXTURES = path.join(process.cwd(), 'fixtures');
// 検証対象プロジェクトの親ディレクトリ。既定では FIXTURES と同じになる
const WORKSPACE = path.dirname(PROJECT);
const BASE = 'http://localhost:3000';

/* [14] の「未計測のルール」は、モデルが突合の有無から決めた値と突き
 * 合わせる。画面だけを見た「未計測の行がない」は空洞的に真になる——
 * 未計測の表示が丸ごと消えても（あるいは計測済みの行にすり替わって
 * も）緑のまま通ってしまう。実際にその注入をしてみて緑のままだった
 * ため、期待値は解析エンジンからその場で組む（test-object-model.mjs
 * と同じ経路。.jwa ファイル名は固定しない）。 */
const findJwa = (dir) => {
  const flat = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.jwa'));
  if (flat) return path.join(dir, flat);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const nested = findJwa(path.join(dir, e.name));
    if (nested) return nested;
  }
  return null;
};
const jwaPath = findJwa(PROJECT);
if (!jwaPath) {
  console.error('モデルの再構築に失敗: .jwa が見つかりません', PROJECT);
  process.exit(1);
}
const analyzed = analyze(jwaPath, path.join(process.cwd(), 'data', 'ui-test-model'));
let correlation = null;
try {
  correlation = correlate(analyzed.summary, scanPluginSource(PROJECT));
} catch (e) {
  console.log('  （プラグインソースの走査に失敗。突合なしで続行）:', e.message);
}
const expectedModel = buildObjectModel({ summary: analyzed.summary, correlation });
const expectedRules = expectedModel.checkRules;
console.log(`  モデル再構築: ルール ${expectedRules.length} 件（未計測 ${expectedRules.filter((r) => !r.measured).length} 件）/ 未確認 ${expectedModel.unconfirmed.length} 件`);

const errors = [];
const failedRequests = [];
let passed = 0;
const failures = [];

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} → ${r.failure()?.errorText}`));

const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n), fullPage: true }); console.log('  📷', n); };
/* 属性の値を待って取りに行く。getAttribute() は要素を待たないうえ
 * 値の変化も待たないので、描画直後に呼ぶと古い値（または null）を
 * 拾って「退化」と誤判定する。状態が変わる瞬間の断言はこれを使う。 */
const waitForAttr = async (loc, name, value, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await loc.getAttribute(name)) === value) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
/* 失敗したときだけ補足を出す。件数のように「いくつ対いくつ」で落ちる
 * 断言は、差が出たことだけ分かっても原因が追えない。 */
function check(label, ok, extra = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && extra ? `  ${extra}` : ''}`);
  if (ok) passed++;
  else failures.push(label);
}
// サイドナビは DOM 内で最初の <nav>。件数バッジが付くため name は部分一致で拾う
const sideNav = () => page.locator('nav').first();
const nav = (name) => sideNav().getByRole('button', { name });
// 画面内のボタンは main に限定する。サイドナビの項目名と画面内のタブ名が
// ぶつかる（「関連探索」と「関連」、「設計書」と「設計書」）ため、
// ページ全体の getByRole だと誤った要素を叩いて画面遷移してしまう。
const inMain = () => page.locator('main');
// SVG は HTMLElement ではないため innerText が常に空になる。textContent で取る。
const svgText = () => page.locator('.mermaid-host svg').first().textContent().catch(() => '');

try {
  console.log('[1] ホームページを開く（既定は「ローカルプロジェクト」）');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
  await page.waitForTimeout(900);
  await shot('A1-home-local.png');
  console.log('  事前入力されたパス:', await page.locator('input[placeholder*="projects"]').inputValue());
  check('html lang が ja', (await page.evaluate(() => document.documentElement.lang)) === 'ja');
  check('タイトルが日本語', (await page.title()).includes('Joget アプリ解析ツール'));
  const head0 = await page.getByRole('banner').innerText();
  check('ヘッダが日本語', head0.includes('Joget アプリ解析ツール'));
  const main0 = await page.locator('main').innerText();
  check('入力方法の説明が日本語', main0.includes('ローカルプロジェクト') && main0.includes('ファイルをアップロード'));

  console.log('\n[2] ディレクトリ選択');
  await page.getByRole('button', { name: '参照' }).click();
  await page.waitForTimeout(900);
  await shot('A2-dir-picker.png');
  console.log('  移動できるサブディレクトリ数:', await page.locator('ul li button').count());
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.waitForTimeout(300);

  console.log('\n[3] プロジェクトディレクトリを指定して事前確認');
  await page.locator('input[placeholder*="projects"]').fill(PROJECT);
  await page.getByRole('button', { name: '認識', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('A3-preview.png');
  const previewTxt = await page.locator('main').innerText();
  check('.jwa を認識', previewTxt.includes('.jwa') && previewTxt.includes('APP_'));
  check('Maven を認識', /Maven|pom\.xml|\.java/.test(previewTxt));

  console.log('\n[4] 解析を開始');
  await page.getByRole('button', { name: '解析開始' }).click();
  await page.waitForSelector('nav', { timeout: 60000 });
  await page.waitForTimeout(1800);
  await shot('A4-overview.png');

  console.log('\n[5] サイドナビの構成（グループと項目が日本語で出ているか）');
  const navText = await page.locator('nav').first().innerText();
  for (const g of ['プロジェクトと概要', 'アプリ構成', 'データ構造', '拡張コンポーネント', '関連と検査', '設計書']) {
    check(`ナビグループ「${g}」`, navText.includes(g));
  }
  const NAV_ITEMS = [
    ['システム概要', 'A5-overview.png'],
    ['解析品質', 'A5b-quality.png'],
    ['オブジェクト一覧', 'A5c-objects.png'],
    ['メニュー構成', 'A5d-menus.png'],
    ['フォーム', 'A5e-forms.png'],
    ['データリスト', 'A5f-lists.png'],
    ['プロセス定義', 'A5g-process.png'],
    ['データモデル', 'A5h-datamodel.png'],
    ['プラグイン', 'A5i-plugins.png'],
    ['関連探索', 'A5j-relations.png'],
    ['静的チェック', 'A5k-checks.png'],
    ['設計書', 'A5l-doc.png'],
  ];
  console.log('\n[6] 全画面を順に開く（見出し・日本語・中身の存在）');
  /* プロセスを持たないアプリ（XPDL が空）では、プロセス定義ページは
   * 「見つかりません」という空状態を出すのが正しい。正文の長さだけで
   * 判定すると、正しい空状態を退化と誤判定する。期待値はモデルから取る。 */
  const hasNoProcesses = (expectedModel.stats.byType[OBJ.PROCESS] || 0) === 0;
  for (const [label, file] of NAV_ITEMS) {
    await nav(label).click();
    await page.waitForTimeout(label === '設計書' ? 1400 : 900);
    const txt = await page.locator('main').innerText();
    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
    check(`${label}: 見出しが出る`, h1.length > 0);
    const honestEmpty = label === 'プロセス定義' && hasNoProcesses && /プロセス（XPDL）が見つかりません/.test(txt);
    check(`${label}: 画面が空でない`, txt.replace(/\s/g, '').length > 40 || honestEmpty);
    await shot(file);
  }

  console.log('\n[7] システム概要の内容アサーション');
  await nav('システム概要').click();
  await page.waitForTimeout(900);
  const ov = await page.locator('main').innerText();
  check('規模カードが出る', ov.includes('規模'));
  check('メニュー構成が出る', ov.includes('メニュー構成'));
  check('命名規約の注記がある', /app_fd_/.test(ov) && /命名規約/.test(ov));
  check('解析の限界が明示されている', ov.includes('実データベースのメタデータ'));
  check('未検出を「未計測」としている', ov.includes('未計測'));
  /* 未確認の内訳（成因）。画面に「行がある」だけでは、件数がずれても
   * 順序が入れ替わっても通るので、モデルの内訳と 1 対 1 で突き合わせる。
   * 行の末尾は件数（説明文に数字が混じっても末尾の数字を拾う）。 */
  if (expectedModel.causeSummary.length > 0) {
    const causeRows = page.getByTestId('cause-summary-rows').locator('li');
    await causeRows.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check('概要に未確認の内訳が出る', (await causeRows.count()) === expectedModel.causeSummary.length,
      `行 ${await causeRows.count()} / モデル ${expectedModel.causeSummary.length}`);
    const rowTexts = await causeRows.allInnerTexts();
    const actualCounts = rowTexts.map((s) => Number((s.match(/(\d+)\s*$/) || [])[1]));
    const expectedCounts = expectedModel.causeSummary.map((c) => c.count);
    check('内訳の件数と順序がモデルと一致する',
      JSON.stringify(actualCounts) === JSON.stringify(expectedCounts),
      `画面 ${actualCounts.join(',')} / モデル ${expectedCounts.join(',')}`);
    const rowBadges = await page.getByTestId('cause-summary-rows').locator('li [title]').count();
    /* バッジの数は「画面の行数」ではなく「モデルの行数」と比べる。
     * 画面の行数と比べると、内訳が丸ごと消えたときに 0 === 0 で
     * 空洞的に真になる（実際に U4 注入で緑のまま通った）。 */
    check('内訳の各行に成因バッジがある', rowBadges === expectedModel.causeSummary.length,
      `バッジ ${rowBadges} / モデル ${expectedModel.causeSummary.length}`);
    const descHits = expectedModel.causeSummary.filter((c) => rowTexts.some((s) => s.includes(CAUSE_DESC[c.cause]))).length;
    check('内訳の各行に成因の説明がある', descHits === expectedModel.causeSummary.length,
      `${descHits} / ${expectedModel.causeSummary.length}`);
  } else {
    console.log('  （未確認 0 件のため内訳の表示はスキップ）');
  }

  console.log('\n[8] 解析品質の内容アサーション');
  await nav('解析品質').click();
  await page.waitForTimeout(900);
  const ql = await page.locator('main').innerText();
  check('資産種別ごとの到達範囲が出る', ql.includes('資産種別ごとの解析状況'));
  check('未計測の表現がある', ql.includes('未計測'));
  check('未確認の一覧がある', ql.includes('未確認の一覧'));
  check('「未確認は障害ではない」という説明がある', /実運用に問題があるかではなく/.test(ql));
  await shot('A6-quality.png');

  console.log('\n[8b] データモデルの出処バッジ');
  await nav('データモデル').click();
  await page.waitForTimeout(900);
  /* 既定で先頭のテーブルが選ばれる。カラム一覧の出処が色付きバッジに
   * 折りたたまれているかを見る。
   * 文字列だけの確認では不十分。長い説明文（BASIS_LABEL）にも短いラベルが
   * 含まれるため、「フォーム定義」が正文に出ていても退化を検出できない。
   * バッジ要素（title に正式な説明を持つ）の文字を直接比べる。 */
  const dmTxt = await page.locator('main').innerText();
  check('出処の凡例が出る', dmTxt.includes('出処：'));
  const basisBadge = page.locator('main [title*="命名規約で生成"]').first();
  check('出処がバッジとして存在する', (await basisBadge.count()) > 0);
  check('バッジの文字が短いラベルになっている',
    (await basisBadge.count()) > 0 && (await basisBadge.innerText()).trim() === 'フォーム定義');
  check('バッジに正式な説明が title で付いている',
    (await basisBadge.count()) > 0 && (await basisBadge.getAttribute('title')).includes('命名規約で生成'));
  await shot('A6b-datamodel-basis.png');

  console.log('\n[8c] 解析品質の成因（なぜ確認できなかったか）');
  await nav('解析品質').click();
  await page.waitForTimeout(900);
  /* 状態（StatusTag）が「どこまで読めたか」、成因は「なぜ読めなかったか」。
   * 同じ未確認でも、ソースが無いだけのものとアプリ定義自体が欠けている
   * ものは利用者の次の動作が違うので、行として出て絞り込めることを見る。
   * 絞り込みの検証は「先頭の成因行」で行う。特定の成因の有無は解析対象に
   * よって変わるため、ここに固有の成因名やオブジェクト名を書かない
   * （書きどめると、その対象でしか通らない門禁になる）。
   *
   * count() と getAttribute() は要素を待たない。描画が終わる前に数えると
   * 「まだ無い」を取り違えになるので、状態が変わるたびに要素の出現を待つ。 */
  const causeRows = page.getByTestId('cause-rows').locator('button[aria-pressed]');
  await causeRows.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const ql2 = await page.locator('main').innerText();
  check('成因の内訳の見出しが出る', ql2.includes('未確認の成因'));
  check('成因の説明が出る', ql2.includes('なぜ確認できなかったか'));
  check('成因の行が出る', (await causeRows.count()) > 0);
  const firstCause = causeRows.first();
  check('成因の行に件数が出る', /\d/.test(await firstCause.innerText()));
  const itemLis = page.getByTestId('unconfirmed-rows').locator('li');
  const causeBadges = page.getByTestId('unconfirmed-rows').locator('li [title]');
  check('一覧の全項目に成因バッジが出る',
    (await itemLis.count()) > 0 && (await causeBadges.count()) === (await itemLis.count()));
  /* 行が絞り込みになる。件数と絞り込み後の行数が一致すること、
   * 残ったバッジがすべてその成因であることを見る。バッジの title は
   * モデルの CAUSE_DESC で、行のバッジと同じ title を持つ。種別が違う
   * ものが混ざると title が違い、この件数で検出できる。 */
  const firstN = Number((await firstCause.innerText()).match(/\d+/)[0]);
  await firstCause.click();
  await itemLis.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const filteredN = await itemLis.count();
  check('成因で絞り込める', filteredN === firstN && firstN > 0, `行 ${filteredN} / 件数 ${firstN}`);
  const firstTitle = await firstCause.locator('[title]').first().getAttribute('title');
  const sameCauseBadges = page.getByTestId('unconfirmed-rows').locator(`li [title="${firstTitle}"]`);
  check('絞り込み後のバッジがすべてその成因', (await sameCauseBadges.count()) === filteredN);
  check('絞り込み中の行が押下状態になる', await waitForAttr(firstCause, 'aria-pressed', 'true'));
  await firstCause.click();
  await page.waitForTimeout(200);
  check('もう一度押すと絞り込みが外れる', await waitForAttr(firstCause, 'aria-pressed', 'false'));
  /* 詳細側にも同じ語彙で出る。一覧と詳細で言い方が分かれると、
   * 利用者がどちらを信じてよいか判断できない。
   * 対象は「未確認」で絞った先頭のオブジェクト。種別は解析対象に
   * よって変わるので、オブジェクト一覧から選ぶ（ここでも固有名を書かない）。 */
  await nav('オブジェクト一覧').click();
  await page.waitForTimeout(900);
  await inMain().getByRole('button', { name: '未確認', exact: true }).click();
  await page.waitForTimeout(500);
  if ((await page.getByTestId('object-rows').locator('button').count()) === 0) {
    await inMain().getByRole('button', { name: '一部のみ', exact: true }).click();
    await page.waitForTimeout(500);
  }
  await page.getByTestId('object-rows').locator('button').first().click();
  const detailCause = page.getByTestId('detail-cause');
  await detailCause.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const causeText = (await detailCause.count()) > 0 ? await detailCause.innerText() : '';
  check('対象の詳細に成因が出る',
    causeText.includes('成因：') && Object.values(CAUSE_LABEL).some((l) => causeText.includes(l)),
    causeText.slice(0, 30));
  await shot('A6c-quality-cause.png');

  console.log('\n[9] オブジェクト一覧 → 詳細の全タブ');
  await nav('オブジェクト一覧').click();
  /* 直前の [8c] が「未確認」で絞ったままなので、まず解析状態の絞り込みを
   * 解除する（解除しないと行数は「未確認の件数」になり、小さなアプリでは
   * 数件しか出ない）。種別側の「すべて」ではなく、状態側の「解析状態」を
   * 押す——種別の絞り込みは元から all なので押しても状態は変わらない。
   * 件数はモデルの総数と突き合わせ、DOM がその件数になるまで待つ
   * （count() は要素も更新も待たない）。 */
  await inMain().getByRole('button', { name: '解析状態', exact: true }).click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="object-rows"] button').length === n,
    expectedModel.objects.length,
    { timeout: 10000 },
  ).catch(() => {});
  const objectRows = page.getByTestId('object-rows').locator('button');
  const rowCount = await objectRows.count();
  check('オブジェクト行が並んでいる', rowCount === expectedModel.objects.length,
    `行 ${rowCount} / モデル ${expectedModel.objects.length}`);
  /* 見出しの件数は rows.length（＝画面が数えた件数）、行数は実際の DOM。
   * 両者が食い違うのは、同じ key の行が二重に出ているか、前の描画が
   * 残っているときで、どちらも一覧から対象を開けなくなる不具合になる。
   * 件数と行数は同じ画面の別々の経路から取るので、片方が壊れても
   * もう片方は正しい——一致を見れば二重描画を捕まえられる。 */
  const shownCount = Number((await page.getByTestId('object-count').innerText()).replace(/[^\d]/g, ''));
  check('一覧の行数が件数表示と一致する（二重描画が無い）', shownCount === rowCount,
    `表示 ${shownCount} / 行 ${rowCount}`);
  await objectRows.first().click();
  await page.waitForTimeout(700);
  const det = await page.locator('main').innerText();
  check('詳細が開く', det.includes('属性と構成') && det.includes('解析の根拠'));
  for (const [tab, expect] of [
    ['属性と構成', /カラム|項目|定義/],
    ['関連', /関連の根拠|含まれるもの|根拠が取れる関連/],
    ['解析の根拠', /アプリ定義|プラグインソース|規約からの導出/],
    ['設計書', /設計書|章/],
  ]) {
    await inMain().getByRole('button', { name: new RegExp('^' + tab) }).first().click();
    await page.waitForTimeout(500);
    const t2 = await page.locator('main').innerText();
    check(`タブ「${tab}」に内容がある`, expect.test(t2));
  }
  await shot('A7-object-detail.png');

  console.log('\n[10] メニュー構成（種別固定の入口）');
  await nav('メニュー構成').click();
  await page.waitForTimeout(900);
  const mn = await page.locator('main').innerText();
  check('メニューが並ぶ', /メニュー/.test(mn));
  check('target を持たない種別の説明がある', /画面の実態が静的には確認できない/.test(mn));
  await shot('A8-menus.png');

  console.log('\n[11] プロセス定義（フロー図が出ること）');
  await nav('プロセス定義').click();
  await page.waitForTimeout(2600);
  const pr = await page.locator('main').innerText();
  if (hasNoProcesses) {
    /* プロセスを持たないアプリでは、図を描かずに「見つかりません」と
     * 言うのが正しい。空のプレースホルダ図を描くと「解析に失敗した」
     * ように見えるため、図が無いことも併せて確かめる。 */
    check('プロセスが無い旨が説明される', /プロセス（XPDL）が見つかりません/.test(pr));
    check('プロセスが無いときに空の図を描かない', (await page.locator('.mermaid-host svg').count()) === 0);
  } else {
    const prSvg = await page.locator('.mermaid-host svg').count();
    const prErr = await page.locator('.bg-rose-50').count();
    check('フロー図の SVG が描画されている', prSvg >= 1);
    check('図のエラー枠がない', prErr === 0);
    // 「見つかりません」は flowChart の空プレースホルダ。summary と summary.xpdl を
    // 取り違えると、図は出るのに中身がこのプレースホルダだけになる（サイレント故障）。
    const prSvgText = await svgText();
    check('フロー図が空のプレースホルダではない', !/見つかりません/.test(prSvgText));
    check('ノード一覧がある', /ノード/.test(pr));
    check('遷移表がある', /遷移/.test(pr));
    check('開始・終了が推定である旨がある', /推定/.test(pr));
  }
  await shot('A9-process.png');

  console.log('\n[12] データモデル（テーブル / ER 図 / 読み書き影響 / SQL）');
  await nav('データモデル').click();
  await page.waitForTimeout(1200);
  const dm0 = await page.locator('main').innerText();
  check('命名規約の注記がある', /app_fd_/.test(dm0));
  check('実DBのメタデータ未参照が明示されている', /実データベースのメタデータは参照していない/.test(dm0));

  await inMain().getByRole('button', { name: /^テーブル関係図/ }).click();
  await page.waitForTimeout(2600);
  const erSvg = await page.locator('.mermaid-host svg').count();
  check('ER 図の SVG が描画されている', erSvg >= 1);
  const erSvgText = await svgText();
  check('ER 図が空のプレースホルダではない', !/見つかりません/.test(erSvgText));
  const erMain = await page.locator('main').innerText();
  check('ER 図が空でない', /ejasa|form|table|テーブル/i.test(erMain));
  await shot('A10-datamodel-er.png');

  await inMain().getByRole('button', { name: /^SQL/ }).click();
  await page.waitForTimeout(700);
  const sqlTab = await page.locator('main').innerText();
  check('SQL タブが開く', /SQL/.test(sqlTab));
  await shot('A11-datamodel-sql.png');

  console.log('\n[13] 関連探索（起点を選ぶと図と表が出る）');
  await nav('関連探索').click();
  await page.waitForTimeout(900);
  const rl0 = await page.locator('main').innerText();
  check('起点未選択の説明が出る', /起点となるオブジェクトを選んでください/.test(rl0));
  const sel = page.locator('main select').first();
  const optCount = await sel.locator('option').count();
  check('起点候補がある', optCount > 1);
  // 既定は関係図。テーブルは「参照される側」なので、逆方向も辿れて初めて中身が出る
  await sel.selectOption({ index: 1 });
  await page.waitForTimeout(2600);
  const relSvg = await page.locator('.mermaid-host svg').count();
  const relErr = await page.locator('.bg-rose-50').count();
  check('関係図の SVG が描画されている', relSvg >= 1);
  check('図のエラー枠がない', relErr === 0);
  const relSvgText = await svgText();
  check('関係図が空のプレースホルダではない', !/見つかりません/.test(relSvgText));
  await inMain().getByRole('button', { name: '一覧', exact: true }).click();
  await page.waitForTimeout(700);
  const rl = await page.locator('main').innerText();
  check('関連の一覧に根拠が出る', /この関連の根拠/.test(rl));
  await shot('A12-relations.png');

  console.log('\n[14] 静的チェック（ルール ID・根拠・検査範囲・制限）');
  await nav('静的チェック').click();
  await page.waitForTimeout(1000);
  const ck = await page.locator('main').innerText();
  /* ルールのサマリは結果の有無に関わらず出る。0 件は「調べたが何も
   * 出なかった」事実、未計測は「調べられなかった」事実で、両方の区別が
   * ここでしか示せない。結果が空のアプリでは従来このブロックごと消えて
   * いたため、「何を調べたか」が確認できない状態だった。 */
  check('適用中のルールが出る', /適用中のルール/.test(ck));
  check('絞り込みの説明が出る', /行を選ぶと一覧を絞り込めます/.test(ck));
  const ruleLis = page.getByTestId('check-rule-rows').locator('li');
  check('ルールの行が出る', (await ruleLis.count()) > 0);
  const ruleTexts = await ruleLis.allInnerTexts();
  /* 行の先頭はルール ID のバッジ（大文字、ハイフンはあってもなくてもよい）。
   * 「構造」のようにハイフンなしの ID もあるので、ハイフンを必須にすると
   * 正しい行を落とす。範囲・制限のラベルはモデルの語彙を画面が引く。 */
  check('ルールの行に ID・範囲・制限が出る',
    ruleTexts.length > 0 && ruleTexts.every((s) => {
      const first = s.split('\n')[0].trim();
      return /^[A-Z]+(-[A-Z]+)?$/.test(first) && s.includes('検査範囲:') && s.includes('解析上の制限:');
    }));
  /* 計測済みの行は絞り込みになり、未計測の行はならない。計っていない
   * ものを選んで空結果を見せることは 0 と未計測の混同になる。
   * 「未計測の行がないから通る」は空洞的な真なので、モデルが突合の
   * 有無から決めた計測可否と 1 対 1 で突き合わせる。未計測の表示が
   * 丸ごと消えても、計測済みの行にすり替わっても紅になる。 */
  const ruleButtons = page.getByTestId('check-rule-rows').locator('li button[aria-pressed]');
  check('計測済みのルールが絞り込みになる', (await ruleButtons.count()) > 0);
  const expectedById = Object.fromEntries(expectedRules.map((r) => [r.ruleId, r]));
  const rowIds = ruleTexts.map((s) => s.split('\n')[0].trim());
  check('ルールの行がモデルのサマリと 1 対 1 で対応する',
    rowIds.length === expectedRules.length && rowIds.every((id) => expectedById[id]),
    `行 ${rowIds.length} / モデル ${expectedRules.length}`);
  const badRows = [];
  for (const [i, id] of rowIds.entries()) {
    const exp = expectedById[id];
    if (!exp) { badRows.push(`${id}: モデルに無い`); continue; }
    const isButton = (await ruleLis.nth(i).locator('button[aria-pressed]').count()) > 0;
    if (exp.measured !== isButton) badRows.push(`${id}: モデル measured=${exp.measured} / 画面 button=${isButton}`);
    if (exp.measured) {
      const m = ruleTexts[i].match(/(\d+)\s*件/);
      if (!m || Number(m[1]) !== exp.count) badRows.push(`${id}: 件数 ${m ? m[1] : 'なし'} / モデル ${exp.count}`);
    } else if (!ruleTexts[i].includes('未計測')) {
      badRows.push(`${id}: 未計測の表示がない`);
    }
  }
  check('計測可否・件数がモデルと一致する', badRows.length === 0, badRows.join(' | '));
  const checkLis = page.getByTestId('check-rows').locator('li');
  if ((await checkLis.count()) > 0) {
    check('根拠が出る', /根拠:/.test(ck));
    check('検査範囲が出る', /検査範囲:/.test(ck));
    check('解析上の制限が出る', /解析上の制限:/.test(ck));
    /* 件数 > 0 の先頭行を選んで絞り込み検証。0 件の行を選ぶと件数一致が
     * 自明になるので、絞り込みとして意味がない。行の規則数は解析対象に
     * よって変わるので固有名は書かない。 */
    let target = null;
    const btnN = await ruleButtons.count();
    for (let i = 0; i < btnN; i++) {
      const b = ruleButtons.nth(i);
      const m = (await b.innerText()).match(/(\d+)\s*件/);
      if (m && Number(m[1]) > 0) { target = { b, n: Number(m[1]), text: await b.innerText() }; break; }
    }
    if (target) {
      await target.b.click();
      await checkLis.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      const filteredN = await checkLis.count();
      check('ルールで絞り込める', filteredN === target.n && target.n > 0, `行 ${filteredN} / 件数 ${target.n}`);
      /* 残った行のバッジがすべてそのルール ID。種別の違うものが混ざると
       * バッジが違い、この件数で検出できる。 */
      const rid = target.text.split('\n')[0].trim();
      const badges = await page.getByTestId('check-rows').locator('li span.font-mono').allInnerTexts();
      check('絞り込み後のバッジがすべてそのルール',
        badges.length === filteredN && badges.every((s) => s.trim() === rid));
      check('絞り込み中の行が押下状態になる', await waitForAttr(target.b, 'aria-pressed', 'true'));
      await target.b.click();
      check('もう一度押すと絞り込みが外れる', await waitForAttr(target.b, 'aria-pressed', 'false'));
    } else {
      check('件数 > 0 のルール行がある', false, 'どのルールも 0 件');
    }
    /* 0 件のルールを選んだときの空表示。「調べたが 0 件」と「調べられな
     * かった（未計測）」は意味が逆なので、取り違えないことを見る。
     * 0 件のルールは解析対象によっては無い（rfq には無い）ため、
     * モデルに無ければスキップする（素材固有名は書かない）。 */
    const zeroRule = expectedRules.find((r) => r.measured && r.count === 0);
    if (zeroRule) {
      const zeroBtn = page.getByTestId('check-rule-rows').locator('li', { hasText: zeroRule.ruleId }).locator('button[aria-pressed]').first();
      await zeroBtn.click();
      const emptyBox = page.getByTestId('check-empty');
      await emptyBox.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      const emptyTxt = (await emptyBox.count()) > 0 ? await emptyBox.innerText() : '';
      check('0 件のルールで「調べた結果 0 件」と出る', emptyTxt.includes('調べた結果 0 件でした'));
      check('0 件を未計測と言わない（検査範囲つき）', emptyTxt.includes('未計測ではありません') && emptyTxt.includes('検査範囲:'));
      await zeroBtn.click();
      await page.waitForTimeout(300);
    } else {
      console.log('  （計測済みで 0 件のルールが無いため 0 件表示はスキップ）');
    }
    /* 件数 > 0 のルールを選び、検索語で 0 行にする。条件で隠れているだけの
     * ときに「0 件」と言うと嘘になるので、件数を出して条件を変えるよう
     * 促す文言になっていることを見る。 */
    if (target) {
      await target.b.click();
      const searchBox = page.locator('main input[placeholder*="ルール・文言・対象で検索"]');
      await searchBox.fill('ZZZ_MATCH_NOTHING');
      await page.waitForTimeout(400);
      const hiddenTxt = (await page.getByTestId('check-empty').count()) > 0
        ? await page.getByTestId('check-empty').innerText() : '';
      check('隠れているだけのときに 0 件と言わない', hiddenTxt.includes(`には ${target.n} 件あります`), hiddenTxt.slice(0, 60));
      await searchBox.fill('');
      await target.b.click();
      await page.waitForTimeout(300);
    }
  } else {
    check('検査結果なしの説明が出る', /根拠が取れる静的検査の範囲では問題が見つかりませんでした/.test(ck));
  }
  await shot('A13-checks.png');

  console.log('\n[15] 設計書センター（章ナビ・検索・書き出し）');
  await nav('設計書').click();
  await page.waitForTimeout(1400);
  const dc = await page.locator('main').innerText();
  check('目次が出る', /目次|章/.test(dc));
  const dlHrefs = await page.locator('main a[href*="download"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('全文書き出しは design_doc.md', dlHrefs.some((h) => String(h).includes('design_doc.md')));
  check('中国語版の成果物リンクが無い', !dlHrefs.some((h) => String(h).includes('_zh') || String(h).includes('_ja')));

  // 章内検索
  await page.locator('main input[placeholder*="設計書内を検索"]').fill('フォーム');
  await page.waitForTimeout(600);
  const dcSearch = await page.locator('main').innerText();
  check('章内検索が件数を返す', /件/.test(dcSearch));

  // 生成ファイルタブ（成果物一覧）
  await inMain().getByRole('button', { name: '生成ファイル' }).click();
  await page.waitForTimeout(700);
  const dcFiles = await page.locator('main').innerText();
  check('生成ファイル一覧が出る', /app_summary\.json/.test(dcFiles) && /design_doc\.md/.test(dcFiles));
  check('RAG チャンクも一覧にある', /rag_chunks\.jsonl/.test(dcFiles));
  await shot('A14-doc-files.png');

  // RAG チャンクタブ（技術的な確認用）
  await inMain().getByRole('button', { name: 'RAG チャンク' }).click();
  await page.waitForTimeout(900);
  const dcChunks = await page.locator('main').innerText();
  check('チャンク閲覧が出る', /チャンク閲覧/.test(dcChunks));
  await shot('A15-doc-chunks.png');

  console.log('\n[16] グローバル検索（ツールバー）');
  await page.getByTestId('global-search').fill('form');
  await page.waitForTimeout(900);
  const gs = await page.getByTestId('global-search-results').innerText();
  check('検索結果件数が出る', /該当/.test(gs));
  check('検索結果から対象を選べる', (await page.getByTestId('global-search-results').locator('button').count()) > 0);
  await page.getByTestId('global-search').fill('');
  await page.waitForTimeout(400);
  await shot('A16-global-search.png');

  console.log('\n[17] 言語切替が存在しない（納品先：日本）');
  check('ヘッダに言語切替が無い', (await page.getByRole('banner').getByRole('button', { name: '日本語' }).count()) === 0);
  check('本文に言語切替が無い', (await page.locator('main').getByRole('button', { name: '日本語' }).count()) === 0);
  check('この時点でページエラーなし', errors.length === 0);

  console.log('\n[18] プロジェクト分離のアサーション（回帰：他プロジェクトのファイルを混ぜない）');
  const scope = async (p) => fetch(`${BASE}/api/fs/discover?path=${encodeURIComponent(p)}`).then((r) => r.json());
  const self = await scope(SELF);
  check('ツール自身のディレクトリは拒否', self.kind === 'invalid');
  console.log('    エラーメッセージ:', String(self.error || '').slice(0, 70));
  check('拒否メッセージが日本語', /解析ツール自身/.test(String(self.error || '')));

  // fixtures/ は「ツールの中」にあるが、ツールのコードではなく解析対象のサンプルなので
  // 自己拒否の例外になっている。ここを検証しないと、素材を置いても解析できない。
  //
  // 配下のプロジェクト数は手元のフィクスチャ次第（顧客アプリは同梱しない）なので、
  // 「2 個である」ではなく「個数と曖昧判定が一致しているか」という不変条件で検証する。
  // これで、同梱サンプルだけの環境（プロジェクト 1 個）でも成立する。
  const fx = await scope(FIXTURES);
  const n = (fx.projects || []).length;
  check('fixtures/ は例外として解析可能（自己拒否の対象外）', fx.kind !== 'invalid');
  console.log(`    fixtures/ 直下のプロジェクト数=${n}（同梱サンプルのみの環境では 1）`);
  check('fixtures/ 配下のプロジェクトが認識されている', n >= 1);
  check('プロジェクト数と曖昧判定が一致', fx.ambiguous === (n > 1));
  check('複数プロジェクト時は自動選択しない', n <= 1 || !fx.chosen);
  check('単一プロジェクト時は自動選択する', n !== 1 || !!fx.chosen);
  check(
    '同梱の Apache-2.0 サンプルをプロジェクトとして認識',
    (fx.projects || []).some((p) => /enhanced-json-api-main/.test(String(p.root))),
  );

  // 検証対象の親ディレクトリ。既定では fixtures/ と同一なので、重複クエリを避けて再利用する
  const wsParent = await (WORKSPACE === FIXTURES ? Promise.resolve(fx) : scope(WORKSPACE));
  check('親ディレクトリ直下でも曖昧判定が同じ', wsParent.ambiguous === fx.ambiguous);
  console.log(`    projects=${(wsParent.projects || []).length}`);

  const one = await scope(PROJECT);
  check('単一プロジェクトは正常に選択', one.ambiguous === false && !!one.chosen && one.projects.length === 1);
  // Maven ルートは「同一プロジェクトなら root と一致」「Maven を含まない
  // 純アプリパッケージなら null」「別のプロジェクトを指してはならない」の
  // 3 通りを許す。mavenRoot === root を無条件に要求すると、
  // プラグインソースを持たない正当な案件（.jwa のみ）だけが不合格になる。
  check(
    'jwa と maven が相互に別プロジェクトを案内しない',
    one.chosen && (one.chosen.mavenRoot === null || one.chosen.mavenRoot === one.chosen.root),
    `root=${one.chosen?.root} mavenRoot=${one.chosen?.mavenRoot}`,
  );

  console.log('\n[19] ブラウザ言語が日本語でも英語でも日本語 UI（納品先：日本）');
  for (const locale of ['ja-JP', 'en-US']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale });
    const lp = await ctx.newPage();
    await lp.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await lp.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
    await lp.waitForTimeout(600);
    const h = await lp.getByRole('banner').innerText();
    const m = await lp.locator('main').innerText();
    check(`[${locale}] タイトルが日本語`, h.includes('Joget アプリ解析ツール'));
    check(`[${locale}] ホーム文言が日本語`, m.includes('ローカルプロジェクト') && m.includes('解析開始'));
    check(`[${locale}] html lang が ja`, (await lp.evaluate(() => document.documentElement.lang)) === 'ja');
    if (locale === 'ja-JP') {
      await lp.screenshot({ path: path.join(OUT, 'A20-ja-default.png'), fullPage: true });
      console.log('  📷 A20-ja-default.png');
    }
    await ctx.close();
  }
} catch (e) {
  console.error('\n実行時例外:', e.message);
  await shot('A99-error.png').catch(() => {});
  errors.push('FLOW: ' + e.message);
  failures.push('実行時例外: ' + e.message);
} finally {
  await browser.close();
}

console.log('\n═══ 結果 ═══');
console.log(`チェック: ${passed} 通過 / ${failures.length} 失敗`);
failures.slice(0, 30).forEach((f) => console.log('  ✗', f));
console.log('ページエラー:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ✗', e.slice(0, 300)));
console.log('失敗したリクエスト:', failedRequests.length);
failedRequests.slice(0, 10).forEach((e) => console.log('  ✗', e.slice(0, 200)));
const bad = failures.length + errors.length + failedRequests.length;
if (bad) console.log(`結果: 不合格（${bad} 件）`);
else console.log('結果: 通過');
process.exit(bad ? 1 : 0);
