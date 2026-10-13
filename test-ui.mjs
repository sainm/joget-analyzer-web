// UI 冒烟测试：本机工程目录为主要入口
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
if (!exe) { console.error('找不到 Chromium'); process.exit(1); }

const OUT = path.join(process.cwd(), 'data', 'shots');
mkdirSync(OUT, { recursive: true });

const PROJECT = '/Users/sainm/work/demo/joget/enhanced-json-api-main';
const BASE = 'http://localhost:3000';
const errors = [];
const failedRequests = [];

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} → ${r.failure()?.errorText}`));

const shot = async (n) => { await page.screenshot({ path: path.join(OUT, n), fullPage: true }); console.log('  📷', n); };

try {
  console.log('[1] 打开首页（默认「本机工程目录」）');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
  await page.waitForTimeout(900);
  await shot('A1-home-local.png');
  console.log('  预填路径:', await page.locator('input[placeholder*="projects"]').inputValue());

  console.log('\n[2] 目录选择器');
  await page.getByRole('button', { name: '浏览' }).click();
  await page.waitForTimeout(900);
  await shot('A2-dir-picker.png');
  const dirBtns = await page.locator('ul li button').count();
  console.log('  可进入的子目录:', dirBtns);
  await page.getByRole('button', { name: '收起' }).click();
  await page.waitForTimeout(300);

  console.log('\n[3] 指向工程目录并预检');
  const input = page.locator('input[placeholder*="projects"]');
  await input.fill(PROJECT);
  await page.getByRole('button', { name: '识别', exact: true }).click();
  await page.waitForTimeout(1200);
  await shot('A3-preview.png');
  const previewTxt = await page.locator('main').innerText();
  console.log('  识别到 .jwa :', previewTxt.includes('.jwa') && previewTxt.includes('APP_'));
  console.log('  识别到 Maven:', /Maven|pom\.xml|\.java/.test(previewTxt));

  console.log('\n[4] 开始分析');
  await page.getByRole('button', { name: '开始分析' }).click();
  await page.waitForSelector('nav', { timeout: 60000 });
  await page.waitForTimeout(1600);
  await shot('A4-overview.png');

  console.log('\n[5] 遍历各页签');
  const tabs = [
    ['影响分析', 'A5-impact.png'],
    ['应用↔源码', 'A5b-correlation.png'],
    ['插件与数据源', 'A6-plugins.png'],
    ['可视化', 'A7-graphs.png'],
    ['设计书', 'A8-doc.png'],
    ['RAG 分块', 'A9-chunks.png'],
  ];
  for (const [t, f] of tabs) {
    await page.getByRole('button', { name: t }).first().click();
    await page.waitForTimeout(t === '可视化' ? 2500 : 900);
    await shot(f);
  }

  console.log('\n[6] 遍历可视化子图');
  await page.getByRole('button', { name: '可视化' }).first().click();
  await page.waitForTimeout(1200);
  for (const [label, re] of [
    ['业务流程图', /业务流程/],
    ['数据模型 ER 图', /数据模型/],
    ['读写影响图', /读写影响/],
    ['菜单结构图', /菜单结构/],
    ['插件调用关系图', /调用关系/],
  ]) {
    await page.getByRole('button', { name: re }).first().click();
    await page.waitForTimeout(2000);
    const svg = await page.locator('.mermaid-host svg').count();
    const err = await page.locator('.bg-rose-50').count();
    console.log(`  ${label}: svg=${svg} 错误框=${err}`);
    await shot(`A10-graph-${label.replace(/[ /]/g, '_')}.png`);
  }

  console.log('\n[6b] ER 图内容断言（回归：表模型不依赖 data/）');
  await page.getByRole('button', { name: /数据模型/ }).first().click();
  await page.waitForTimeout(1500);
  // 用 textContent（而非 innerText）：mermaid 源码在折叠的 <details> 里，innerText 取不到
  const erSrc = (await page.locator('main details pre').first().textContent()) || '';
  console.log('  ER 图含实体 ejasa_form:', erSrc.includes('ejasa_form'));
  console.log('  不是空占位 EMPTY:', !erSrc.includes('EMPTY'));
  const erSvg = await page.locator('.mermaid-host svg').count();
  console.log('  ER 图 svg 渲染:', erSvg === 1);

  console.log('\n[7] 联动视图内容断言');
  await page.getByRole('button', { name: '应用↔源码' }).first().click();
  await page.waitForTimeout(1000);
  const ct = await page.locator('main').innerText();
  [
    ['显示无效配置告警', ct.includes('确认无效的配置项')],
    ['命名了 autoHandleWorkflowVariable', ct.includes('autoHandleWorkflowVariable')],
    ['命中源码组件 EnhancedJsonTool', ct.includes('EnhancedJsonTool')],
    ['逐组件对照标题', ct.includes('逐组件对照')],
    ['平台内置分组', ct.includes('平台')],
  ].forEach(([n, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${n}`));

  // 展开第一个组件
  await page.locator('button:has-text("EnhancedJsonApiFormLoadBinder")').first().click();
  await page.waitForTimeout(800);
  const dt = await page.locator('main').innerText();
  console.log('  展开后含「应用实际配置」:', dt.includes('应用实际配置'));
  console.log('  展开后含「Java 代码读取」:', dt.includes('Java 代码读取'));
  await shot('A5c-correlation-detail.png');

  console.log('\n[8] 插件清单区内容断言');
  await page.getByRole('button', { name: '插件与数据源' }).first().click();
  await page.waitForTimeout(900);
  const ptxt = await page.locator('main').innerText();
  [
    ['含 EnhancedJsonTool', ptxt.includes('EnhancedJsonTool')],
    ['含配置项数量', /\d+\s*配置项/.test(ptxt)],
    ['含 TokenApiUtil 工具类', ptxt.includes('TokenApiUtil')],
    ['含调用关系图', ptxt.includes('类级调用关系图')],
  ].forEach(([n, ok]) => console.log(`  ${ok ? '✓' : '✗'} ${n}`));

  console.log('\n[9] 设计书语言切换（文档内独立切换）');
  await page.getByRole('button', { name: '设计书' }).first().click();
  await page.waitForTimeout(700);
  const zhDoc = await page.locator('.doc-md').innerText();
  console.log('  中文设计书含 2.3 节:', zhDoc.includes('2.3 应用配置'));
  await page.locator('main').getByRole('button', { name: '日本語' }).click();
  await page.waitForTimeout(800);
  const jaTxt = await page.locator('.doc-md').innerText();
  console.log('  日文设计书含 2.3 节:', jaTxt.includes('2.3'));
  await shot('A11-doc-ja.png');

  console.log('\n[10] 界面语言切换为日文');
  await page.locator('header.sticky').getByRole('button', { name: '日本語' }).click();
  await page.waitForTimeout(900);
  await shot('A12-ui-ja-doc.png');
  const headJa = await page.locator('header.sticky').innerText();
  console.log('  标题已日文化:', headJa.includes('Joget アプリ解析ツール'));
  console.log('  页签已日文化:', ['概要', '影響分析', 'アプリ↔ソース', '設計書'].every((x) => headJa.includes(x)));
  // 界面语言变为日语后，设计书应自动跟随（不再依赖文档内切换）
  const docFollow = await page.locator('.doc-md').innerText();
  console.log('  设计书自动跟随日文:', docFollow.includes('2.3') && !docFollow.includes('应用配置'));

  const jaTabs = [
    ['概要', 'A13-ja-overview.png', ['アプリ情報', 'フォーム定義']],
    ['影響分析', 'A14-ja-impact.png', ['書き込み対象テーブル', '検出された問題']],
    ['アプリ↔ソース', 'A15-ja-correlation.png', ['コンポーネント別の突合', '無効な設定項目']],
    ['プラグインとデータソース', 'A16-ja-plugins.png', ['プラグインソース一覧', 'クラス呼び出し関係図']],
    ['可視化', 'A17-ja-graphs.png', ['業務フロー図']],
    ['RAG チャンク', 'A18-ja-chunks.png', ['チャンク閲覧', 'チャンク総数']],
  ];
  for (const [label, f, expect] of jaTabs) {
    await page.getByRole('button', { name: label }).first().click();
    await page.waitForTimeout(label === '可視化' ? 2500 : 900);
    const txt = await page.locator('main').innerText();
    console.log(`  ${label}: ${expect.map((e) => `${txt.includes(e) ? '✓' : '✗'}${e}`).join(' ')}`);
    await shot(f);
  }

  console.log('\n[11] 切回中文');
  await page.locator('header.sticky').getByRole('button', { name: '中文' }).click();
  await page.waitForTimeout(700);
  const backZh = await page.locator('header.sticky').innerText();
  console.log('  标题已切回中文:', backZh.includes('Joget 应用分析器'));
  console.log('  语言选择已持久化:', await page.evaluate(() => localStorage.getItem('joget-analyzer-lang')));
  await shot('A19-back-to-zh.png');
  console.log('\n[12] 工程隔离断言（回归：不参杂其他项目文件）');
  const scope = async (p, lang) => {
    const res = await fetch(`${BASE}/api/fs/discover?path=${encodeURIComponent(p)}${lang ? '&lang=ja' : ''}`).then((r) => r.json());
    return res;
  };
  const self = await scope('/Users/sainm/work/demo/joget/joget-analyzer-web');
  console.log('  工具自身目录被拒:', self.kind === 'invalid', '|', String(self.error || '').slice(0, 40));
  const ws = await scope('/Users/sainm/work/demo/joget');
  console.log('  工作区父目录 → 判为多工程:', ws.ambiguous === true, `| projects=${(ws.projects || []).length}`);
  console.log('  多工程时不擅自选定:', !ws.chosen);
  const one = await scope(PROJECT);
  console.log('  单一工程正常选定:', one.ambiguous === false && !!one.chosen && one.projects.length === 1);
  console.log('  工程内 jwa 与 maven 归属同一工程:', one.chosen && one.chosen.mavenRoot === one.chosen.root);
  const jaSelf = await scope('/Users/sainm/work/demo/joget/joget-analyzer-web', true);
  console.log('  拒绝文案已日文化:', /解析ツール自身/.test(String(jaSelf.error || '')));

  console.log('\n[13] 日文浏览器默认语言（交付日本）');
  const jaCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ja-JP' });
  const jaPage = await jaCtx.newPage();
  await jaPage.goto(BASE, { waitUntil: 'load', timeout: 30000 });
  await jaPage.waitForSelector('input[placeholder*="projects"]', { timeout: 10000 });
  await jaPage.waitForTimeout(700);
  const jaHead = await jaPage.locator('header.sticky').innerText();
  console.log('  未做任何点击即为日文界面:', jaHead.includes('Joget アプリ解析ツール'));
  const jaMain = await jaPage.locator('main').innerText();
  console.log('  首页文案为日文:', jaMain.includes('ローカルプロジェクトを指定') && jaMain.includes('解析開始'));
  console.log('  产物名映射为日文:', jaMain.includes('設計書') || jaMain.includes('プロジェクト構成'));
  console.log('  html lang:', await jaPage.evaluate(() => document.documentElement.lang));
  console.log('  document.title:', await jaPage.evaluate(() => document.title));
  await jaPage.screenshot({ path: path.join(OUT, 'A20-ja-autodetect.png'), fullPage: true });
  console.log('  📷 A20-ja-autodetect.png');
  await jaCtx.close();
} catch (e) {
  console.error('\n运行时异常:', e.message);
  await shot('A99-error.png').catch(() => {});
  errors.push('FLOW: ' + e.message);
} finally {
  await browser.close();
}

console.log('\n═══ 结果 ═══');
console.log('页面错误:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  ✗', e.slice(0, 300)));
console.log('失败请求:', failedRequests.length);
failedRequests.slice(0, 10).forEach((e) => console.log('  ✗', e.slice(0, 200)));
process.exit(errors.length ? 1 : 0);
