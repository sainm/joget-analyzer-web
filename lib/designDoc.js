/**
 * lib/designDoc.js — 由 app_summary.json 生成 Markdown 设计书（SOP 第 6 阶段）
 * 支持多语言：zh=中文（默认）, ja=日本語（日文项目）
 */
'use strict';

const T = {
  zh: {
    title: '{name} 设计书', thItem: '项', thValue: '值', appId: '应用 ID', version: '版本', package: '所属包',
    created: '创建时间', modified: '修改时间', forms: '表单', datalists: '数据列表', workflows: '工作流', tables: '数据表',
    h1: '## 1. 概述',
    overview: '本设计书由 Joget 应用包 **{name}**（appId: `{appId}`）逆向解析生成，描述应用的功能设计、流程设计、数据模型与影响范围，可作为二次开发、迁移或评审的基线文档。',
    overview2: '应用包含 {forms} 个表单、{datalists} 个数据列表、{menus} 个前台菜单入口、{workflows} 条工作流，底层 {tables} 张数据表。',
    h2: '## 2. 系统架构与模块划分',
    arch: '采用 Joget 四层结构：**Userview（前台菜单）→ Datalist（数据展示）→ Form（数据录入）→ Process（流程驱动）**，底层为表单自动生成的数据库表。',
    h21: '### 2.1 功能模块（按菜单分组）', thModule: '模块', thMenu: '菜单', thType: '类型', thTarget: '目标',
    h22: '### 2.2 组件与插件清单', thCategory: '分类', thClass: '类名', thRefs: '引用次数', thUsedIn: '用于',
    h23: '### 2.3 应用配置 ↔ 插件源码联动',
    bindIntro: '本工程同时提供了插件源码。下表中「应用实际配置」来自 .jwa 内各定义 JSON，「源码声明」来自插件 properties 定义文件，两者逐类对齐。共引用 {n} 个插件类，其中 {b} 个在源码中命中，{u} 个缺源码。',
    thBindClass: '组件类', thBindWhere: '应用中使用位置', thBindAppCfg: '应用实际配置', thBindSrcDecl: '源码声明项数', thBindGap: '差异',
    thBindRead: '代码读取项数',
    bindDeadTitle: '#### ⚠ 确认无效的配置项（应用已设置，但整个插件工程都不认识）',
    bindDeadLine: '**{cls}** 配置了 {keys}，该参数在插件 properties 定义与 Java 源码中均不存在（使用位置：{where}；组件源码：{file}）。应确认是否为旧版本遗留或被删除的参数。',
    bindNoSource: '（本工程未提供插件源码，无法做联动比对）',
    bindGapTitle: '#### 配置项差异明细',
    bindCacheTitle: '#### 走默认值的配置项（源码已声明、应用未配置）',
    bindGapUnknown: '应用设置了源码未声明的参数',
    bindGapUnset: '源码声明但应用未配置',
    bindMissingTitle: '#### 引用了但源码中找不到的插件类（评估无法闭环）',
    bindUnusedTitle: '#### 源码中存在但本应用从未引用的类',
    bindPlatformTitle: '#### 平台内置插件（无需源码）',
    bindNone: '（无）',
    catBuiltin: 'Joget 内置', catMarketplace: '市场插件', catEnterprise: '企业版插件', catCustom: '自研插件',
    deployDeps: '**部署依赖**：', h3: '## 3. 功能设计', tableLabel: '数据表：`{t}`',
    thField: '字段', thLabel: '标签', thFtype: '类型', thRequired: '必填', thOpts: '选项/说明', yes: '是',
    h4: '## 4. 流程设计', h41: '### 4.1 {name}（`{id}`）', roles: '**参与角色**：', acts: '**活动定义**',
    thActId: '活动 ID', thActName: '名称', thPerformer: '执行者', thImpl: '执行方式',
    implTool: '自动（工具）', implManual: '人工', implSubflow: '子流程', implNone: '路由决策',
    trans: '**迁移与条件**', thFrom: '从', thTo: '到', thCond: '条件', seqFlow: '（顺序流转）',
    sidefx: '**流程中的数据副作用**', thKind: '类型', thTable: '目标', thWrite: '写入内容',
    kSql: 'SQL', kForm: '表单更新', h42: '### 4.2 端到端业务流',
    h5: '## 5. 数据模型设计',
    modelNote: '表与列由**表单定义**推导：表单 `tableName` → 物理表 `app_fd_<tableName>`，字段 → 列 `c_<fieldId>`，另含 `id`(主键)、`dateCreated`、`dateModified`、`createdBy`、`modifiedBy` 审计列。`.jwa` 里的样例数据（`data/*.json`）仅用于补充示例值与记录数 —— 导出时未勾选「包含数据」也不影响本表。',
    h51: '### 5.1 表结构清单', records: '（{n} 条演示数据）', recordsNotExported: '（演示数据未导出，字段由表单定义推导）', thGtype: '推断类型', thSample: '示例值',
    h52: '### 5.2 表间关系（自动推断）', thRel: '关系', thFk: '外键字段', thDesc: '说明',
    h53: '### 5.3 自定义 / 外部表', ctNote: 'SQL 引用了非表单表（`app_fd_*` 之外），需补充 DDL 才能完整建模：',
    needDdl: '（待补充 DDL）',
    h6: '## 6. 影响范围分析', h61: '### 6.1 写入方', h62: '### 6.2 读取方', h63: '### 6.3 已发现问题',
    h64: '### 6.4 服务器端配置缺口（.jwa 不含，需另行导出）', noIssue: '- 未检测到明显问题',
    thWriter: '写入方', thContent: '内容', thReader: '读取方', thWay: '方式', thConfig: '配置项', thNote: '说明',
    h7: '## 7. 附录', h71: '### 7.1 应用包文件清单', thFile: '文件', thPurpose: '用途',
    fileAppdef: '应用定义（表单/列表/菜单/流程插件）', fileXpdl: '工作流流程定义（XPDL 1.0）',
    fileRes: '静态资源（图标、API 样例）', fileData: '演示数据（导入后可直接使用）',
    h72: '### 7.2 术语',
    footer: '*本文档由 joget-analyzer-web（Node.js）自动生成，可人工修订后作为正式设计书。*',
  },
  ja: {
    title: '{name} 設計書', thItem: '項目', thValue: '値', appId: 'アプリID', version: 'バージョン', package: '所属パッケージ',
    created: '作成日時', modified: '更新日時', forms: 'フォーム', datalists: 'データリスト', workflows: 'ワークフロー', tables: 'データテーブル',
    h1: '## 1. 概要',
    overview: '本書は Joget アプリケーションパッケージ **{name}**（appId: `{appId}`）の逆解析により生成されました。機能設計、プロセス設計、データモデル、影響範囲を記述し、二次開発・移行・レビューの基準文書として利用できます。',
    overview2: '本アプリは {forms} 個のフォーム、{datalists} 個のデータリスト、{menus} 個のフロントメニュー、{workflows} 本のワークフロー、基盤として {tables} 個のデータテーブルで構成されます。',
    h2: '## 2. システムアーキテクチャとモジュール構成',
    arch: 'Joget の4層構造を採用：**Userview（フロントメニュー）→ Datalist（一覧表示）→ Form（データ入力）→ Process（プロセス駆動）**。基盤はフォームから自動生成されるデータベーステーブルです。',
    h21: '### 2.1 機能モジュール（メニュー別）', thModule: 'モジュール', thMenu: 'メニュー', thType: '種別', thTarget: '遷移先',
    h22: '### 2.2 コンポーネント・プラグイン一覧', thCategory: '分類', thClass: 'クラス名', thRefs: '参照回数', thUsedIn: '使用箇所',
    h23: '### 2.3 アプリ設定 ↔ プラグインソースの突合',
    bindIntro: '本プロジェクトにはプラグインのソースが含まれています。下表の「アプリ実際設定」は .jwa 内の各定義 JSON から、「ソース宣言」はプラグインの properties 定義ファイルから取得し、クラス単位で突き合わせています。参照クラス {n} 件のうち {b} 件がソースに存在し、{u} 件はソース未提供です。',
    thBindClass: 'コンポーネント', thBindWhere: 'アプリ内の使用箇所', thBindAppCfg: 'アプリ実際設定', thBindSrcDecl: 'ソース宣言数', thBindGap: '差異',
    thBindRead: 'コード読取数',
    bindDeadTitle: '#### ⚠ 無効と確認された設定項目（アプリで設定済みだが、プラグイン側に存在しない）',
    bindDeadLine: '**{cls}** に {keys} が設定されていますが、プラグインの properties 定義にも Java ソースにも存在しません（使用箇所：{where}；ソース：{file}）。旧バージョンの残骸か、削除済みパラメータの可能性があります。',
    bindNoSource: '（本プロジェクトにプラグインソースが無いため突合できません）',
    bindGapTitle: '#### 設定項目の差異詳細',
    bindCacheTitle: '#### 既定値で動作する項目（ソース宣言あり・アプリ未設定）',
    bindGapUnknown: 'アプリが設定したがソースに未宣言のパラメータ',
    bindGapUnset: 'ソース宣言あり・アプリ未設定',
    bindMissingTitle: '#### 参照されているがソースに見つからないクラス',
    bindUnusedTitle: '#### ソースに存在するが本アプリで未使用のクラス',
    bindPlatformTitle: '#### プラットフォーム標準プラグイン（ソース不要）',
    bindNone: '（なし）',
    catBuiltin: 'Joget 標準', catMarketplace: 'マーケットプレイス', catEnterprise: 'エンタープライズ版', catCustom: '自社開発',
    deployDeps: '**デプロイ依存**：', h3: '## 3. 機能設計', tableLabel: 'データテーブル：`{t}`',
    thField: 'フィールド', thLabel: 'ラベル', thFtype: '型', thRequired: '必須', thOpts: '選択肢・備考', yes: 'はい',
    h4: '## 4. プロセス設計', h41: '### 4.1 {name}（`{id}`）', roles: '**参加ロール**：', acts: '**アクティビティ定義**',
    thActId: 'アクティビティID', thActName: '名称', thPerformer: '実行者', thImpl: '実行方式',
    implTool: '自動（ツール）', implManual: '手動', implSubflow: 'サブプロセス', implNone: 'ルーティング判定',
    trans: '**遷移と条件**', thFrom: '遷移元', thTo: '遷移先', thCond: '条件', seqFlow: '（順次遷移）',
    sidefx: '**プロセス内のデータ副作用**', thKind: '種別', thTable: '対象', thWrite: '書込内容',
    kSql: 'SQL', kForm: 'フォーム更新', h42: '### 4.2 エンドツーエンド業務フロー',
    h5: '## 5. データモデル設計',
    modelNote: '表と列は**フォーム定義**から導出します：フォームの `tableName` → 物理テーブル `app_fd_<tableName>`、フィールド → 列 `c_<fieldId>`。他に `id`（主キー）、`dateCreated`、`dateModified`、`createdBy`、`modifiedBy` の監査列を含みます。`.jwa` のサンプルデータ（`data/*.json`）はサンプル値と件数の補完にのみ使用し、エクスポート時に「データを含める」を選んでいなくても本表には影響しません。',
    h51: '### 5.1 テーブル構造一覧', records: '（デモデータ {n} 件）', recordsNotExported: '（デモデータ未エクスポート、フィールドはフォーム定義から導出）', thGtype: '推定型', thSample: 'サンプル値',
    h52: '### 5.2 テーブル間の関係（自動推定）', thRel: '関係', thFk: '外部キー', thDesc: '説明',
    h53: '### 5.3 カスタム / 外部テーブル', ctNote: 'SQL がフォームテーブル（`app_fd_*`）以外を参照しています。完全なモデリングには DDL の補足が必要です：',
    needDdl: '（DDL 未補足）',
    h6: '## 6. 影響範囲分析', h61: '### 6.1 書込元', h62: '### 6.2 参照元', h63: '### 6.3 検出された問題',
    h64: '### 6.4 サーバー側設定の不足分（.jwa には含まれず、別途エクスポートが必要）', noIssue: '- 明確な問題は検出されませんでした',
    thWriter: '書込元', thContent: '内容', thReader: '参照元', thWay: '方式', thConfig: '設定項目', thNote: '説明',
    h7: '## 7. 付録', h71: '### 7.1 アプリパッケージのファイル一覧', thFile: 'ファイル', thPurpose: '用途',
    fileAppdef: 'アプリ定義（フォーム/リスト/メニュー/プロセスプラグイン）', fileXpdl: 'ワークフロー定義（XPDL 1.0）',
    fileRes: '静的リソース（アイコン、API サンプル）', fileData: 'デモデータ（インポート後そのまま利用可能）',
    h72: '### 7.2 用語',
    footer: '*本書は joget-analyzer-web（Node.js）により自動生成されました。人手で加筆修正し正式な設計書として利用できます。*',
  },
};

const TERMS = {
  zh: ['- **PR**：Purchase Requisition，采购申请', '- **RFQ**：Request for Quotation，询价单',
    '- **SRM**：Supplier Relationship Management，供应商关系管理', '- **XPDL**：XML Process Definition Language，工作流标准格式'],
  ja: ['- **PR**：Purchase Requisition（購買申請）', '- **RFQ**：Request for Quotation（見積依頼）',
    '- **SRM**：Supplier Relationship Management（サプライヤー関係管理）', '- **XPDL**：XML Process Definition Language（ワークフロー標準形式）'],
};

function inferType(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'decimal';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'date';
  if (/^\d{10,}$/.test(s)) return 'timestamp';
  return 'string';
}

const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const clip = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

function generateDesignDoc(summary, lang = 'zh', opts = {}) {
  const t = T[lang] || T.zh;
  const app = summary.app || {};
  const xpdl = summary.xpdl || { processes: [] };
  // 表模型优先：由表单定义推导，不依赖 .jwa 是否导出了样例数据
  const rawData = summary.data || {};
  const tableModel = summary.tableModel && Object.keys(summary.tableModel).length ? summary.tableModel : null;
  const data = tableModel || rawData;
  const impact = summary.impact || {};
  const effects = summary.sql_effects || [];
  const menus = (app.userviews || []).flatMap((uv) => (uv.categories || []).flatMap((c) => c.menus || []));
  const L = [];
  const A = (s) => L.push(s);

  A(`# ${t.title.replace('{name}', app.name)}\n`);
  A(`| ${t.thItem} | ${t.thValue} |\n|---|---|`);
  A(`| ${t.appId} | ${app.appId} |`);
  A(`| ${t.version} | ${app.version} |`);
  A(`| ${t.package} | ${app.package} |`);
  A(`| ${t.created} | ${app.dateCreated} |`);
  A(`| ${t.modified} | ${app.dateModified} |`);
  A(`| ${t.forms} | ${(app.forms || []).length} |`);
  A(`| ${t.datalists} | ${(app.datalists || []).length} |`);
  A(`| ${t.workflows} | ${xpdl.processes.length} |`);
  A(`| ${t.tables} | ${Object.keys(data).length} |`);
  A('');

  A(t.h1 + '\n');
  A(t.overview.replace('{name}', app.name).replace('{appId}', app.appId) + '\n');
  A(t.overview2.replace('{forms}', (app.forms || []).length).replace('{datalists}', (app.datalists || []).length)
    .replace('{menus}', menus.length).replace('{workflows}', xpdl.processes.length)
    .replace('{tables}', Object.keys(data).length) + '\n');

  A(t.h2 + '\n');
  A(t.arch + '\n');
  if ((app.userviews || []).length) {
    A(t.h21 + '\n');
    A(`| ${t.thModule} | ${t.thMenu} | ${t.thType} | ${t.thTarget} |`);
    A('|---|---|---|---|');
    for (const uv of app.userviews) {
      for (const c of uv.categories || []) {
        for (const m of c.menus || []) A(`| ${cell(c.category)} | ${cell(m.label)} | ${m.type} | ${cell(m.target)} |`);
      }
    }
    A('');
  }

  const pr = summary.plugin_refs || {};
  if (Object.keys(pr).length) {
    A(t.h22 + '\n');
    A(`| ${t.thCategory} | ${t.thClass} | ${t.thRefs} | ${t.thUsedIn} |`);
    A('|---|---|---|---|');
    for (const [cat, key] of [['builtin', 'catBuiltin'], ['marketplace', 'catMarketplace'],
      ['enterprise', 'catEnterprise'], ['custom', 'catCustom']]) {
      for (const cls of Object.keys(pr[cat] || {}).sort()) {
        const info = pr[cat][cls];
        A(`| ${t[key]} | ${cls} | ${info.occurrences} | ${cell((info.usedIn || []).join(', ').slice(0, 60))} |`);
      }
    }
    A('');
    const deps = [];
    if (Object.keys(pr.enterprise || {}).length) deps.push(lang === 'ja'
      ? `Joget エンタープライズ版 ${Object.keys(pr.enterprise).length} クラス`
      : `Joget Enterprise 许可（${Object.keys(pr.enterprise).length} 个企业版插件类）`);
    if (Object.keys(pr.marketplace || {}).length) deps.push(lang === 'ja'
      ? `マーケットプレイスプラグイン ${Object.keys(pr.marketplace).length} クラス`
      : `Marketplace 插件（${Object.keys(pr.marketplace).length} 个市场插件类）`);
    if (Object.keys(pr.custom || {}).length) deps.push(lang === 'ja'
      ? `自社開発プラグイン ${Object.keys(pr.custom).length} クラス`
      : `自研插件部署（${Object.keys(pr.custom).length} 个自定义类）`);
    if (deps.length) A(t.deployDeps + deps.join('；') + '\n');
  }

  /* ── 2.3 应用配置 ↔ 插件源码联动 ── */
  {
    const c = opts.correlation;
    if (c && c.hasSource) {
      A(t.h23 + '\n');
      A(t.bindIntro.replace('{n}', c.stats.referencedClasses).replace('{b}', c.stats.bound).replace('{u}', c.stats.unresolved) + '\n\n');

      // 最高优先级结论：应用配了、整个插件工程都不认识的参数
      if ((c.deadConfig || []).length) {
        A(t.bindDeadTitle + '\n');
        for (const d of c.deadConfig) {
          A(`- ${t.bindDeadLine
            .replace('{cls}', d.simpleName)
            .replace('{keys}', d.keys.map((k) => `\`${k}\``).join('、'))
            .replace('{where}', d.usedIn.join('、') || '—')
            .replace('{file}', d.file || '—')}`);
        }
        A('');
      }

      A(`| ${t.thBindClass} | ${t.thBindWhere} | ${t.thBindAppCfg} | ${t.thBindSrcDecl} | ${t.thBindRead} | ${t.thBindGap} |`);
      A('|---|---|---|---|---|---|');
      for (const b of c.bindings.filter((x) => x.inSource)) {
        const appCfg = b.setCount
          ? `${b.setCount}：` + b.setKeys.slice(0, 8).join(', ')
          : t.bindNone;
        const gap = [];
        if (b.unknownKeys.length) gap.push(`${t.bindGapUnknown} ${b.unknownKeys.join(', ')}`);
        if (b.unsetKeys.length) gap.push(`${t.bindGapUnset} ${b.unsetKeys.length}`);
        A(`| ${b.simpleName} | ${cell(b.usedIn.join(', ') || '—')} | ${cell(appCfg)} | ${b.declaredCount} | ${(b.source.readKeys || []).length} | ${cell(gap.join('；') || '—')} |`);
      }
      A('');

      // 走默认值的配置项
      const withUnset = c.bindings.filter((x) => x.inSource && x.unsetKeys.length);
      if (withUnset.length) {
        A(t.bindCacheTitle + '\n');
        for (const b of withUnset) {
          A(`- **${b.simpleName}**（${b.unsetKeys.length} 项）：${b.unsetKeys.join(', ')}`);
        }
        A('');
      }

      // 配置项差异明细：逐个使用点列出应用真实写入的值
      const withUsages = c.bindings.filter((x) => x.inSource && x.usages.some((u) => u.nonEmptyKeys.length));
      if (withUsages.length) {
        A(t.bindGapTitle + '\n');
        for (const b of withUsages) {
          A(`**${b.simpleName}**（${b.source.file}）\n`);
          A(`| ${t.thBindWhere} | 参数 | 值 |`);
          A('|---|---|---|');
          for (const u of b.usages) {
            if (!u.nonEmptyKeys.length) continue;
            for (const k of u.nonEmptyKeys) {
              const dead = (b.deadKeys || []).includes(k);
              const flag = dead ? ' ⚠' : b.unknownKeys.includes(k) ? ' ?' : '';
              A(`| ${cell(u.where)}${u.slot ? ` · ${cell(u.slot)}` : ''} | \`${k}\`${flag} | ${cell(clip(u.config[k], 80))} |`);
            }
          }
          A('');
        }
      }

      if (c.unresolved.length) {
        A(t.bindMissingTitle + '\n');
        for (const u of c.unresolved) {
          A(`- [${u.category}] \`${u.className}\`（引用 ${u.occurrences} 次，用于 ${u.usedIn.join('、') || '—'}）`);
        }
        A('');
      }

      if (c.unusedInSource.length) {
        A(t.bindUnusedTitle + '\n');
        for (const u of c.unusedInSource) {
          A(`- \`${u.className}\`（${u.file}，${u.methodCount} 个方法，类型 ${u.sourceKind}）`);
        }
        A('');
      }

      if (c.platform.length) {
        A(t.bindPlatformTitle + '\n');
        A(`${c.platform.length} 个：${c.platform.map((p) => p.simpleName).slice(0, 40).join('、')}\n`);
      }
    }
  }

  A(t.h3 + '\n');
  (app.forms || []).forEach((f, i) => {
    A(`### 3.${i + 1} ${f.name}（\`${f.id}\`）\n`);
    A(t.tableLabel.replace('{t}', f.tableName) + '\n');
    A(`| ${t.thField} | ${t.thLabel} | ${t.thFtype} | ${t.thRequired} | ${t.thOpts} |`);
    A('|---|---|---|---|---|');
    for (const fd of f.fields || []) {
      A(`| ${cell(fd.id)} | ${cell(fd.label)} | ${fd.type} | ${fd.mandatory ? t.yes : ''} | ${cell(fd.options)} |`);
    }
    A('');
  });

  A(t.h4 + '\n');
  (xpdl.processes || []).forEach((p, pi) => {
    A(t.h41.replace('4.1', `4.${pi + 1}`).replace('{name}', p.name).replace('{id}', p.id) + '\n');
    if ((p.participants || []).length) A(t.roles + p.participants.map((x) => `${x.name}(${x.id})`).join('、') + '\n');
    A(t.acts + '\n');
    A(`| ${t.thActId} | ${t.thActName} | ${t.thPerformer} | ${t.thImpl} |`);
    A('|---|---|---|---|');
    for (const a of p.activities || []) {
      const impl = { tool: t.implTool, manual: t.implManual, subflow: t.implSubflow, none: t.implNone }[a.implementation] || a.implementation;
      A(`| ${cell(a.id)} | ${cell(a.name)} | ${cell(a.performer)} | ${impl} |`);
    }
    A('');
    A(t.trans + '\n');
    A(`| ${t.thFrom} | ${t.thTo} | ${t.thCond} |`);
    A('|---|---|---|');
    for (const tr of p.transitions || []) {
      A(`| ${cell(tr.from)} | ${cell(tr.to)} | ${cell(tr.condition) || t.seqFlow} |`);
    }
    A('');
  });

  if (effects.length) {
    A(t.sidefx + '\n');
    A(`| ${t.thKind} | ${t.thTable} | ${t.thWrite} |`);
    A('|---|---|---|');
    for (const e of effects) {
      for (const s of e.sets || []) {
        const kind = e.kind === 'sql' ? t.kSql : t.kForm;
        const target = e.kind === 'sql' ? e.table : `${e.table}(${e.form})`;
        A(`| ${kind} | ${cell(target)} | ${cell(s.column)} = '${cell(s.value)}' |`);
      }
    }
    A('');
  }

  A(t.h42 + '\n');
  for (const p of xpdl.processes || []) {
    A('```');
    A((p.activities || []).map((a) => a.name).join(' -> '));
    A('```\n');
  }

  A(t.h5 + '\n');
  A(t.modelNote + '\n');
  A(t.h51 + '\n');
  for (const [tb, info] of Object.entries(data)) {
    const cols = info.fields || info.all_fields || [];
    const records = info.records ?? info.rows ?? 0;
    A(`**${tb}**${records > 0 ? t.records.replace('{n}', records) : t.recordsNotExported}\n`);
    A(`| ${t.thField} | ${t.thGtype} | ${t.thSample} |`);
    A('|---|---|---|');
    for (const col of cols) {
      const v = info.sample ? info.sample[col] : undefined;
      const vs = String(v == null ? '' : v);
      A(`| ${cell(col)} | ${inferType(v)} | ${cell(vs.length > 40 ? vs.slice(0, 40) + '…' : vs)} |`);
    }
    A('');
  }
  A(t.h52 + '\n');
  A(`| ${t.thRel} | ${t.thFk} | ${t.thDesc} |`);
  A('|---|---|---|');
  for (const r of summary.relations || []) A(`| ${r.from} → ${r.to} | ${r.field} | ${r.desc || ''} |`);
  A('');

  const ct = ((summary.analysis_inputs || {}).custom_tables) || [];
  if (ct.length) {
    A(t.h53 + '\n');
    A(t.ctNote + '\n');
    A(`| ${t.thTable} | ${t.thConfig} | ${t.thFk} | ${t.thNote} |`);
    A('|---|---|---|---|');
    for (const x of ct) {
      A(`| ${x.table} | ${x.status || 'missing'} | ${(x.fields || []).join(', ') || t.needDdl} | ${cell(String((x.referenced_by_sql || [])[0] || '-').slice(0, 60))} |`);
    }
    A('');
  }

  A(t.h6 + '\n');
  if (Object.keys(impact.writeMap || {}).length) {
    A(t.h61 + '\n');
    A(`| ${t.thTable} | ${t.thWriter} | ${t.thContent} |`);
    A('|---|---|---|');
    for (const [tb, ws] of Object.entries(impact.writeMap)) {
      for (const w of ws) A(`| ${tb} | ${cell(w.source)} | ${cell(w.fields)} |`);
    }
    A('');
  }
  if (Object.keys(impact.readMap || {}).length) {
    A(t.h62 + '\n');
    A(`| ${t.thTable} | ${t.thReader} | ${t.thWay} |`);
    A('|---|---|---|');
    for (const [tb, rs] of Object.entries(impact.readMap)) {
      for (const r of rs) A(`| ${tb} | ${cell(r.source)} | ${r.binder} |`);
    }
    A('');
  }
  A(t.h63 + '\n');
  if ((impact.issues || []).length) (impact.issues || []).forEach((i) => A(`- ${i}`));
  else A(t.noIssue);
  A('');

  const sse = ((summary.analysis_inputs || {}).server_side_exports) || {};
  const sseKeys = Object.keys(sse).filter((k) => !k.startsWith('_'));
  if (sseKeys.length) {
    A(t.h64 + '\n');
    A(`| ${t.thConfig} | ${t.thConfig === '配置项' ? '状态' : '状態'} | ${t.thNote} |`);
    A('|---|---|---|');
    for (const k of sseKeys) A(`| ${k} | ${sse[k].status || 'missing'} | ${cell(sse[k].note)} |`);
    A('');
  }

  A(t.h7 + '\n');
  A(t.h71 + '\n');
  A(`| ${t.thFile} | ${t.thPurpose} |`);
  A('|---|---|');
  A(`| appDefinition.xml | ${t.fileAppdef} |`);
  A(`| package.xpdl | ${t.fileXpdl} |`);
  A(`| resources/* | ${t.fileRes} |`);
  A(`| data/*.json | ${t.fileData} |`);
  A('');
  A(t.h72 + '\n');
  TERMS[lang].forEach((x) => A(x));
  A('');
  A('---');
  A(t.footer);

  return L.join('\n');
}

module.exports = { generateDesignDoc, inferType };
