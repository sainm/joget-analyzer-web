/**
 * test-ui.mjs — UI スモークテスト（ローカルプロジェクトのディレクトリが主入口）
 *
 * 前提: サーバーが http://localhost:3000 で起動していること
 * 使い方: node test-ui.mjs
 *
 * 画面は日本語のみ。言語切替のテストは存在しない。
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

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} → ${r.failure()?.errorText}`));

const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n), fullPage: true }); console.log('  📷', n); };
const check = (label, ok) => console.log(`  ${ok ? '✓' : '✗'} ${label}`);

try {
  console.log('[1] ホームページを開く（既定は「ローカルプロジェクト」）');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
  await page.waitForTimeout(900);
  await shot('A1-home-local.png');
  console.log('  事前入力されたパス:', await page.locator('input[placeholder*="projects"]').inputValue());
  check('html lang が ja', (await page.evaluate(() => document.documentElement.lang)) === 'ja');
  check('タイトルが日本語', (await page.title()).includes('Joget アプリ解析ツール'));
  const head0 = await page.locator('header.sticky').innerText();
  check('ヘッダが日本語', head0.includes('Joget アプリ解析ツール'));
  const main0 = await page.locator('main').innerText();
  check('入力方法のタブが日本語', main0.includes('ローカルプロジェクト') && main0.includes('ファイルをアップロード'));

  console.log('\n[2] ディレクトリ選択');
  await page.getByRole('button', { name: '参照' }).click();
  await page.waitForTimeout(900);
  await shot('A2-dir-picker.png');
  console.log('  移動できるサブディレクトリ数:', await page.locator('ul li button').count());
  await page.getByRole('button', { name: '閉じる' }).click();
  await page.waitForTimeout(300);

  console.log('\n[3] プロジェクトディレクトリを指定して事前確認');
  const input = page.locator('input[placeholder*="projects"]');
  await input.fill(PROJECT);
  await page.getByRole('button', { name: '認識', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('A3-preview.png');
  const previewTxt = await page.locator('main').innerText();
  check('.jwa を認識', previewTxt.includes('.jwa') && previewTxt.includes('APP_'));
  check('Maven を認識', /Maven|pom\.xml|\.java/.test(previewTxt));

  console.log('\n[4] 解析を開始');
  await page.getByRole('button', { name: '解析開始' }).click();
  await page.waitForSelector('nav', { timeout: 60000 });
  await page.waitForTimeout(1600);
  await shot('A4-overview.png');

  console.log('\n[5] 各タブを走査（日本語の文言を同時に検証）');
  const tabs = [
    ['影響分析', 'A5-impact.png', ['書き込み対象テーブル', '検出された問題']],
    ['アプリ↔ソース', 'A5b-correlation.png', ['コンポーネント別の突合', '無効と確認された設定項目']],
    ['プラグインとデータソース', 'A6-plugins.png', ['プラグインソース一覧', 'クラス呼び出し関係図']],
    ['可視化', 'A7-graphs.png', ['業務フロー図']],
    ['設計書', 'A8-doc.png', []],
    ['RAG チャンク', 'A9-chunks.png', ['チャンク閲覧', 'チャンク総数']],
  ];
  for (const [label, f, expect] of tabs) {
    await page.getByRole('button', { name: label }).first().click();
    await page.waitForTimeout(label === '可視化' ? 2500 : 900);
    const txt = await page.locator('main').innerText();
    if (expect.length) console.log(`  ${label}: ${expect.map((e) => `${txt.includes(e) ? '✓' : '✗'}${e}`).join(' ')}`);
    await shot(f);
  }

  console.log('\n[6] 可視化のサブ図を走査（日本語のみ）');
  await page.getByRole('button', { name: '可視化' }).first().click();
  await page.waitForTimeout(1200);
  for (const [label, re] of [
    ['業務フロー図', /業務フロー/],
    ['データモデル ER 図', /データモデル/],
    ['読み書き影響図', /読み書き影響/],
    ['メニュー構成図', /メニュー構成/],
    ['プラグイン呼び出し関係図', /呼び出し関係/],
  ]) {
    await page.getByRole('button', { name: re }).first().click();
    await page.waitForTimeout(2000);
    const svg = await page.locator('.mermaid-host svg').count();
    const err = await page.locator('.bg-rose-50').count();
    console.log(`  ${label}: svg=${svg} エラー枠=${err}`);
    await shot(`A10-graph-${label.replace(/[ /]/g, '_')}.png`);
  }

  console.log('\n[6b] ER 図の内容アサーション（回帰：テーブルモデルが data/ に依存しない）');
  await page.getByRole('button', { name: /データモデル/ }).first().click();
  await page.waitForTimeout(1500);
  // innerText ではなく textContent を使う：mermaid ソースは折りたたまれた <details> 内にあり innerText では取得できない
  const erSrc = (await page.locator('main details pre').first().textContent()) || '';
  check('ER 図にエンティティ ejasa_form を含む', erSrc.includes('ejasa_form'));
  check('空のプレースホルダ EMPTY ではない', !erSrc.includes('EMPTY'));
  check('ER 図の svg が描画されている', (await page.locator('.mermaid-host svg').count()) === 1);

  console.log('\n[7] 突合ビューの内容アサーション');
  await page.getByRole('button', { name: 'アプリ↔ソース' }).first().click();
  await page.waitForTimeout(1000);
  const ct = await page.locator('main').innerText();
  [
    ['無効な設定項目の警告を表示', ct.includes('無効と確認された設定項目')],
    ['autoHandleWorkflowVariable を挙げている', ct.includes('autoHandleWorkflowVariable')],
    ['ソースに命中したコンポーネント EnhancedJsonTool', ct.includes('EnhancedJsonTool')],
    ['コンポーネント別の突合', ct.includes('コンポーネント別の突合')],
    ['プラットフォーム標準のグループ', ct.includes('プラットフォーム標準')],
  ].forEach(([n, ok]) => check(n, ok));

  // 最初のコンポーネントを展開
  await page.locator('button:has-text("EnhancedJsonApiFormLoadBinder")').first().click();
  await page.waitForTimeout(800);
  const dt = await page.locator('main').innerText();
  check('展開後に「アプリの実設定」を含む', dt.includes('アプリの実設定'));
  check('展開後に「Java コードの読取」を含む', dt.includes('Java コードの読取'));
  await shot('A5c-correlation-detail.png');

  console.log('\n[8] プラグイン一覧エリアの内容アサーション');
  await page.getByRole('button', { name: 'プラグインとデータソース' }).first().click();
  await page.waitForTimeout(900);
  const ptxt = await page.locator('main').innerText();
  [
    ['EnhancedJsonTool を含む', ptxt.includes('EnhancedJsonTool')],
    ['設定項目数を表示', /設定項目\s*\d+/.test(ptxt)],
    ['クラス呼び出し関係図を含む', ptxt.includes('クラス呼び出し関係図')],
  ].forEach(([n, ok]) => check(n, ok));

  console.log('\n[9] 設計書（日本語のみ・単一ファイル）');
  await page.getByRole('button', { name: '設計書' }).first().click();
  await page.waitForTimeout(900);
  const docTxt = await page.locator('.doc-md').innerText();
  check('2.3 節を含む', docTxt.includes('2.3'));
  check('見出しが日本語', docTxt.includes('アプリ設定 ↔ プラグインソースの突合'));
  check('設計書内に言語切替ボタンが無い', (await page.locator('main').getByRole('button', { name: '日本語' }).count()) === 0);
  const dlHrefs = await page.locator('main a[href*="download"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  check('ダウンロードは design_doc.md', dlHrefs.some((h) => String(h).includes('design_doc.md')));
  check('中国語版の成果物リンクが無い', !dlHrefs.some((h) => String(h).includes('_zh') || String(h).includes('_ja')));
  await shot('A11-doc.png');

  console.log('\n[10] 実行環境の言語設定に依存しない（日本語固定）');
  check('ヘッダに言語切替が無い', (await page.locator('header.sticky').getByRole('button', { name: '日本語' }).count()) === 0);
  check('ページエラーなし（この時点まで）', errors.length === 0);

  console.log('\n[11] プロジェクト分離のアサーション（回帰：他プロジェクトのファイルを混ぜない）');
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
  check('プロジェクト内の jwa と maven が同一プロジェクトに属する', one.chosen && one.chosen.mavenRoot === one.chosen.root);

  console.log('\n[12] ブラウザ言語が日本語でも英語でも日本語 UI（納品先：日本）');
  for (const locale of ['ja-JP', 'en-US']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale });
    const lp = await ctx.newPage();
    await lp.goto(BASE, { waitUntil: 'load', timeout: 30000 });
    await lp.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
    await lp.waitForTimeout(600);
    const h = await lp.locator('header.sticky').innerText();
    const m = await lp.locator('main').innerText();
    console.log(`  [${locale}] タイトル=${h.includes('Joget アプリ解析ツール')} ホーム文言=${m.includes('ローカルプロジェクトを指定') && m.includes('解析開始')} lang=${await lp.evaluate(() => document.documentElement.lang)}`);
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
} finally {
  await browser.close();
}

console.log('\n═══ 結果 ═══');
console.log('ページエラー:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ✗', e.slice(0, 300)));
console.log('失敗したリクエスト:', failedRequests.length);
failedRequests.slice(0, 10).forEach((e) => console.log('  ✗', e.slice(0, 200)));
process.exit(errors.length ? 1 : 0);
