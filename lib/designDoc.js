/**
 * lib/designDoc.js — app_summary.json から Markdown 設計書を生成する（SOP 第 6 段階）
 * 本ツールは日本向けに納品するため、出力は日本語のみ。
 */
'use strict';

/**
 * 章・節の見出し語彙は lib/objectModel.js が持つ。
 *
 * 逆方向の依存（生成側が参照側の語彙を借りる）にしている理由:
 *   docAnchors の値域そのものがこの語彙なので、定義元を 1 箇所に集めるには
 *   オブジェクトモデル側に持たせるのが自然。ここで同じ文字列を直書きすると、
 *   片方だけ見出しを変えた瞬間に「オブジェクト → 設計書のどの章」が
 *   静かに切れ、設計書センターからオブジェクトへ戻れなくなる。
 *   test-object-model.mjs が実際の生成結果と突き合わせて検証する。
 *
 * 2.1 と 2.2 は統合オブジェクトモデルのオブジェクトから作る。
 * ここで app.userviews や summary.plugin_refs を独自に歩くと、
 * 画面のオブジェクト一覧と設計書の表が別個の推导になり、
 * 片方だけが壊れても気づけない（同じ結論が二箇所に並ぶ状態）。
 */
const { chapters: CH, sections: SEC, CATEGORY_LABEL, OBJ, buildObjectModel, tableModelOf } = require('./objectModel.js');

const T = {
  title: '{name} 設計書', thItem: '項目', thValue: '値', appId: 'アプリID', version: 'バージョン', package: '所属パッケージ',
  created: '作成日時', modified: '更新日時', forms: 'フォーム', datalists: 'データリスト', workflows: 'ワークフロー', tables: 'データテーブル',
  h1: `## ${CH.overview}`,
  overview: '本書は Joget アプリケーションパッケージ **{name}**（appId: `{appId}`）の逆解析により生成されました。機能設計、プロセス設計、データモデル、影響範囲を記述し、二次開発・移行・レビューの基準文書として利用できます。',
  overview2: '本アプリは {forms} 個のフォーム、{datalists} 個のデータリスト、{menus} 個のフロントメニュー、{workflows} 本のワークフロー、基盤として {tables} 個のデータテーブルで構成されます。',
  h2: `## ${CH.architecture}`,
  arch: 'Joget の4層構造を採用：**Userview（フロントメニュー）→ Datalist（一覧表示）→ Form（データ入力）→ Process（プロセス駆動）**。基盤はフォームから自動生成されるデータベーステーブルです。',
  h21: `### ${SEC.modules}`, thModule: 'モジュール', thMenu: 'メニュー', thType: '種別', thTarget: '遷移先',
  h22: `### ${SEC.plugins}`, thCategory: '分類', thClass: 'クラス名', thRefs: '参照回数', thUsedIn: '使用箇所',
  h23: `### ${SEC.pluginCorrelation}`,
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
  /* 種別のラベルは objectModel.js の CATEGORY_LABEL を参照する。
   * ここに同じ言い方を直書きすると、画面と設計書で呼び分が生まれる。 */
  deployDeps: '**デプロイ依存**：', h3: `## ${CH.function}`, tableLabel: 'データテーブル：`{t}`',
  /* thField は 5.1 の列名の見出し。3.x の項目表はモデルの「項目定義」節の
   * 見出し（項目ID / 表示名 / タイプ / 必須 / 選択肢）をそのまま使うため、
   * ここに項目表の見出し語彙は持たない。 */
  thField: 'フィールド',
  h4: `## ${CH.process}`, h41: '### 4.1 {name}（`{id}`）', roles: '**参加ロール**：', acts: '**アクティビティ定義**',
  thActId: 'アクティビティID', thActName: '名称', thPerformer: '実行者', thImpl: '実行方式',
  implTool: '自動（ツール）', implManual: '手動', implSubflow: 'サブプロセス', implNone: 'ルーティング判定',
  trans: '**遷移と条件**', thFrom: '遷移元', thTo: '遷移先', thCond: '条件', seqFlow: '（順次遷移）',
  sidefx: '**プロセス内のデータ副作用**', thKind: '種別', thTable: '対象', thWrite: '書込内容',
  kSql: 'SQL', kForm: 'フォーム更新', h42: '### 4.2 エンドツーエンド業務フロー',
  h5: `## ${CH.dataModel}`,
  modelNote: '表と列は**フォーム定義**から導出します：フォームの `tableName` → 物理テーブル `app_fd_<tableName>`、フィールド → 列 `c_<fieldId>`。他に `id`（主キー）、`dateCreated`、`dateModified`、`createdBy`、`modifiedBy` の監査列を含みます。`.jwa` のサンプルデータ（`data/*.json`）はサンプル値と件数の補完にのみ使用し、エクスポート時に「データを含める」を選んでいなくても本表には影響しません。',
  h51: `### ${SEC.tableList}`, records: '（デモデータ {n} 件）', recordsNotExported: '（デモデータ未エクスポート、フィールドはフォーム定義から導出）', thGtype: '推定型', thSample: 'サンプル値',
  h52: `### ${SEC.tableRelations}`, thRel: '関係', thFk: '外部キー', thDesc: '説明',
  h53: `### ${SEC.customTables}`, ctNote: 'SQL がフォームテーブル（`app_fd_*`）以外を参照しています。完全なモデリングには DDL の補足が必要です：',
  needDdl: '（DDL 未補足）',
  h6: `## ${CH.impact}`, h61: `### ${SEC.writeSources}`, h62: `### ${SEC.readSources}`, h63: `### ${SEC.issues}`,
  h64: '### 6.4 サーバー側設定の不足分（.jwa には含まれず、別途エクスポートが必要）', noIssue: '- 明確な問題は検出されませんでした',
  thWriter: '書込元', thContent: '内容', thReader: '参照元', thWay: '方式', thConfig: '設定項目', thStatus: '状態', thNote: '説明',
  h7: `## ${CH.appendix}`, h71: `### ${SEC.fileList}`, thFile: 'ファイル', thPurpose: '用途',
  fileAppdef: 'アプリ定義（フォーム/リスト/メニュー/プロセスプラグイン）', fileXpdl: 'ワークフロー定義（XPDL 1.0）',
  fileRes: '静的リソース（アイコン、API サンプル）', fileData: 'デモデータ（インポート後そのまま利用可能）',
  h72: `### ${SEC.terms}`,
  footer: '*本書は joget-analyzer-web（Node.js）により自動生成されました。人手で加筆修正し正式な設計書として利用できます。*',
};

const TERMS = [
  '- **PR**：Purchase Requisition（購買申請）',
  '- **RFQ**：Request for Quotation（見積依頼）',
  '- **SRM**：Supplier Relationship Management（サプライヤー関係管理）',
  '- **XPDL**：XML Process Definition Language（ワークフロー標準形式）',
];

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

function generateDesignDoc(summary, opts = {}) {
  const t = T;
  const app = summary.app || {};
  const xpdl = summary.xpdl || { processes: [] };
  const effects = summary.sql_effects || [];
  const menus = (app.userviews || []).flatMap((uv) => (uv.categories || []).flatMap((c) => c.menus || []));
  /* 統合オブジェクトモデル。画面（src/App.jsx）が使うものと同一の推导。
   * 2.1・2.2・3.x・5.1・6.x と各所の件数はこのオブジェクトから作る。ここで
   * app.userviews・summary.plugin_refs・テーブルモデル・summary.impact を独自に歩くと、
   * 設計書の表が別個の推导になり、片方だけ壊れても気づけない。
   * 呼び出し側（server.js / テスト）が model を渡せるのは、
   * 同一結果に対して 2 回組み立てないようにするため。 */
  const model = opts.model || buildObjectModel({ summary, correlation: opts.correlation });
  const tableCount = model.objects.filter((o) => o.type === OBJ.TABLE).length;
  /* 影響範囲もモデルのビューを読む。キーは物理テーブル名なので、
   * 5.1 のテーブル一覧と同じ名前で読める。data/ の名前空間
   * （接頭辞なし）に直すのは app_summary.json の契約との境目
   * （analyze.js）だけで行う。 */
  const impact = model.impact || { writeMap: {}, readMap: {}, issues: [] };
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
  A(`| ${t.tables} | ${tableCount} |`);
  A('');

  A(t.h1 + '\n');
  A(t.overview.replace('{name}', app.name).replace('{appId}', app.appId) + '\n');
  A(t.overview2.replace('{forms}', (app.forms || []).length).replace('{datalists}', (app.datalists || []).length)
    .replace('{menus}', menus.length).replace('{workflows}', xpdl.processes.length)
    .replace('{tables}', tableCount) + '\n');

  A(t.h2 + '\n');
  A(t.arch + '\n');
  if ((app.userviews || []).length) {
    A(t.h21 + '\n');
    A(`| ${t.thModule} | ${t.thMenu} | ${t.thType} | ${t.thTarget} |`);
    A('|---|---|---|---|');
    // 行は統合オブジェクトモデルのメニューオブジェクトから作る。
    // オブジェクトの生成順は Userview → カテゴリ → メニューの巡回順なので、
    // 従来の二重ループと同じ並びになる。
    for (const m of model.objects) {
      if (m.type !== OBJ.MENU || !m.menu) continue;
      A(`| ${cell(m.menu.category)} | ${cell(m.menu.label)} | ${m.menu.type} | ${cell(m.menu.target)} |`);
    }
    A('');
  }

  /* ── 2.2 コンポーネント・プラグイン一覧 ── */
  // 種別・参照回数・使用箇所はオブジェクトモデルのプラグインが持つ事実
  // （plugin.category / occurrences / usedIn）を使う。attrs は表示用に
  // 切り詰められているため、こちらは読まない。
  const plugins = model.objects.filter((o) => o.type === OBJ.PLUGIN && o.plugin);
  if (plugins.length) {
    // 表示順は従来と同じ「カテゴリ順 → クラス名のコード点順」
    // （localeCompare にすると JdbcDataListBinder と JdbcDatalistAction の
    //  並びが変わり、過去の設計書と diff が出る）
    const CAT_ORDER = ['builtin', 'marketplace', 'enterprise', 'custom'];
    const rows = [...plugins].sort((a, b) => {
      const ca = CAT_ORDER.indexOf(a.plugin.category);
      const cb = CAT_ORDER.indexOf(b.plugin.category);
      if (ca !== cb) return ca - cb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    A(t.h22 + '\n');
    A(`| ${t.thCategory} | ${t.thClass} | ${t.thRefs} | ${t.thUsedIn} |`);
    A('|---|---|---|---|');
    for (const p of rows) {
      const f = p.plugin;
      A(`| ${CATEGORY_LABEL[f.category] || f.category} | ${p.id} | ${f.occurrences || 0} | ${cell((f.usedIn || []).join(', ').slice(0, 60))} |`);
    }
    A('');
    const countCat = (c) => rows.filter((p) => p.plugin.category === c).length;
    const deps = [];
    if (countCat('enterprise')) deps.push(`Joget エンタープライズ版 ${countCat('enterprise')} クラス`);
    if (countCat('marketplace')) deps.push(`マーケットプレイスプラグイン ${countCat('marketplace')} クラス`);
    if (countCat('custom')) deps.push(`自社開発プラグイン ${countCat('custom')} クラス`);
    if (deps.length) A(t.deployDeps + deps.join('；') + '\n');
  }

  /* ── 2.3 アプリ設定 ↔ プラグインソースの突合 ── */
  {
    const c = opts.correlation;
    if (c && c.hasSource) {
      A(t.h23 + '\n');
      A(t.bindIntro.replace('{n}', c.stats.referencedClasses).replace('{b}', c.stats.bound).replace('{u}', c.stats.unresolved) + '\n\n');

      // 最優先の結論：アプリで設定されているが、プラグインプロジェクト全体が認識しないパラメータ
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

      // 既定値で動作する設定項目
      const withUnset = c.bindings.filter((x) => x.inSource && x.unsetKeys.length);
      if (withUnset.length) {
        A(t.bindCacheTitle + '\n');
        for (const b of withUnset) {
          A(`- **${b.simpleName}**（${b.unsetKeys.length} 項目）：${b.unsetKeys.join(', ')}`);
        }
        A('');
      }

      // 設定項目の差異詳細：使用箇所ごとにアプリが実際に書き込んだ値を列挙する
      const withUsages = c.bindings.filter((x) => x.inSource && x.usages.some((u) => u.nonEmptyKeys.length));
      if (withUsages.length) {
        A(t.bindGapTitle + '\n');
        for (const b of withUsages) {
          A(`**${b.simpleName}**（${b.source.file}）\n`);
          A(`| ${t.thBindWhere} | パラメータ | 値 |`);
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
          A(`- [${u.category}] \`${u.className}\`（参照 ${u.occurrences} 回、使用箇所 ${u.usedIn.join('、') || '—'}）`);
        }
        A('');
      }

      if (c.unusedInSource.length) {
        A(t.bindUnusedTitle + '\n');
        for (const u of c.unusedInSource) {
          A(`- \`${u.className}\`（${u.file}、${u.methodCount} メソッド、種別 ${u.sourceKind}）`);
        }
        A('');
      }

      if (c.platform.length) {
        A(t.bindPlatformTitle + '\n');
        A(`${c.platform.length} 件：${c.platform.map((p) => p.simpleName).slice(0, 40).join('、')}\n`);
      }
    }
  }

  A(t.h3 + '\n');
  /* フォームの節も統合オブジェクトモデルのフォームオブジェクトから作る。
   * app.forms をここでも歩くと、画面のフォーム詳細（項目定義の表）と
   * 設計書が別個の推导になり、片方だけ項目の出し方が変わっても気づかない。
   * 表の見出しと行はモデルの「項目定義」節をそのまま使う。 */
  let formSeq = 0;
  for (const f of model.objects) {
    if (f.type !== OBJ.FORM) continue;
    formSeq += 1;
    A(`### 3.${formSeq} ${f.name}（\`${f.id}\`）\n`);
    /* 物理テーブル名で書く。素の tableName では 5.1 の見出し
     * （app_fd_xxx）と同一テーブルだと読めない。 */
    A(t.tableLabel.replace('{t}', f.form?.physicalTable || f.form?.tableName || '—') + '\n');
    const sec = f.sections.find((s) => s.title === '項目定義');
    if (sec?.head) A(`| ${sec.head.join(' | ')} |`);
    A('|---|---|---|---|---|');
    for (const row of sec?.rows || []) {
      A(`| ${row.map((c) => cell(c)).join(' | ')} |`);
    }
    A('');
  }

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
  /* 載せるテーブルの集合は統合オブジェクトモデルのテーブルオブジェクトから取る。
   * ここで Object.entries(data) を独自に回すと、画面のデータモデルと
   * 設計書の表で「どのテーブルが存在するか」が食い違う。
   * 列の推定型とサンプル値は data/*.json の事実なので、解決した
   * テーブルモデル（tableModelOf）から読む。モデルと同一の解決を使うのは、
   * 古い解析結果（tableModel 無し）でも集合を揃えるため。 */
  const resolvedTables = tableModelOf(summary);
  for (const tblObj of model.objects) {
    if (tblObj.type !== OBJ.TABLE) continue;
    const info = resolvedTables[tblObj.id] || {};
    const cols = info.fields || info.all_fields || [];
    const records = info.records ?? info.rows ?? 0;
    A(`**${tblObj.id}**${records > 0 ? t.records.replace('{n}', records) : t.recordsNotExported}\n`);
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
  /* 6.x はモデルの影響範囲ビューをそのまま表にする。テーブル名は
   * 5.1 と同じ物理名（app_fd_xxx）なので、章をまたいで同じテーブルを
   * 追える。app_summary.json の impact は data/ の名前空間で契約
   * されているが、本書の中では物理名に揃える。 */
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
    A(`| ${t.thConfig} | ${t.thStatus} | ${t.thNote} |`);
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
  TERMS.forEach((x) => A(x));
  A('');
  A('---');
  A(t.footer);

  return L.join('\n');
}

module.exports = { generateDesignDoc, inferType };
