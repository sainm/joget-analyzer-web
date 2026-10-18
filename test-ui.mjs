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
import { existsSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';

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
function check(label, ok) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
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
  for (const [label, file] of NAV_ITEMS) {
    await nav(label).click();
    await page.waitForTimeout(label === '設計書' ? 1400 : 900);
    const txt = await page.locator('main').innerText();
    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
    check(`${label}: 見出しが出る`, h1.length > 0);
    check(`${label}: 画面が空でない`, txt.replace(/\s/g, '').length > 40);
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

  console.log('\n[9] オブジェクト一覧 → 詳細の全タブ');
  await nav('オブジェクト一覧').click();
  await page.waitForTimeout(900);
  const rowCount = await page.getByTestId('object-rows').locator('button').count();
  check('オブジェクト行が並んでいる', rowCount > 5);
  await page.getByTestId('object-rows').locator('button').first().click();
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
  const prSvg = await page.locator('.mermaid-host svg').count();
  const prErr = await page.locator('.bg-rose-50').count();
  check('フロー図の SVG が描画されている', prSvg >= 1);
  check('図のエラー枠がない', prErr === 0);
  // 「見つかりません」は flowChart の空プレースホルダ。summary と summary.xpdl を
  // 取り違えると、図は出るのに中身がこのプレースホルダだけになる（サイレント故障）。
  const prSvgText = await svgText();
  check('フロー図が空のプレースホルダではない', !/見つかりません/.test(prSvgText));
  const pr = await page.locator('main').innerText();
  check('ノード一覧がある', /ノード/.test(pr));
  check('遷移表がある', /遷移/.test(pr));
  check('開始・終了が推定である旨がある', /推定/.test(pr));
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
  if (/検出された問題はありません/.test(ck) && !/ルール/.test(ck)) {
    check('検査結果なしの説明が出る', /根拠が取れる静的検査の範囲では問題が見つかりませんでした/.test(ck));
  } else {
    check('適用中のルールが出る', /適用中のルール/.test(ck));
    check('根拠が出る', /根拠:/.test(ck));
    check('検査範囲が出る', /検査範囲:/.test(ck));
    check('解析上の制限が出る', /解析上の制限:/.test(ck));
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
