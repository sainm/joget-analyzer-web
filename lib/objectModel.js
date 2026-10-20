/**
 * 統合オブジェクトモデル
 *
 * app_summary.json / plugin_manifest.json / correlation.json から、
 * 画面横断で同一の「オブジェクト」を組み立てる唯一の場所。
 *
 * 設計方針:
 *  - 解析結果 JSON のデータ契約は変更しない（既存の読み取り側が壊れない）。
 *    既存のフィールドを読み取るだけで、導出はこのモジュールに閉じ込める。
 *  - 関連もここ 1 箇所で決める。各画面がそれぞれ導出し始めると、
 *    同じ結論が食い違う。
 *  - 状態は「根拠から」決める。取れなかったものを空欄や 0 で埋めず、
 *    未確認であることを明示する（静的解析では断定しない）。
 *
 * 「包含」と「関連」を区別する:
 *   children … 帰属（フォーム→項目、テーブル→カラム、プロセス→ノード）
 *               数が多いうえ単なる内包なので「関連」パネルには出さない。
 *   links    … 意味のある結び（メニュー→対象、フォーム→テーブル、SQL→テーブル）
 *
 * オブジェクトの共通形:
 *   key        一意な主キー（"form:srm_rfq"）
 *   id         Joget 上の識別子
 *   type       種別（OBJ.*）
 *   name       表示名（無ければ id）
 *   status     解析状態（STATUS.*）— 根拠から導出
 *   brief      一行要約（一覧表示用）
 *   attrs      属性の配列 [{ k, v }]（詳細の「属性」タブ）
 *   children   子オブジェクトの key 配列
 *   links      関連 [{ key, type, basis }]（双方向に張る）
 *   evidence   根拠 [{ kind, ref, note }]（kind: config | source | derivation）
 *   docAnchors 対応する設計書の章
 *
 * 種別ごとの構造化された事実（plugin / menu / form）:
 *   attrs は表示用に整形された値（切り詰めあり）なので、設計書など
 *   別の表示を作る側は、切り詰め前の事実をこのフィールドから読む。
 *   attrs を書き直すと表示が変わるが、このフィールドは推导そのものを保つ。
 */

/**
 * 設計書の章・節の見出し語彙。
 *
 * なぜここにあるのか:
 *   docAnchors は「オブジェクト → 設計書のどの章」という対応で、
 *  その値域がまさにこの語彙である。語彙を別ファイルに置くと、
 *  生成側（lib/designDoc.js）と参照側（このモジュール）で同じ文字列を
 *  二重に持ち、片方だけ見出しを変えた瞬間に対応が静かに切れる。
 *
 *  設計書の生成側はこの語彙を require して使う（designDoc.js 参照）。
 *  逆方向の依存にすることで、語彙の定義元は 1 箇所で済む。
 *
 * なぜこのモジュールが他ファイルを require しないのか:
 *   ブラウザ側（Vite）からも読むため、ローカル依存を 1 つも持てない。
 *   CJS の `require('./x')` は esbuild の単体変換では browser に存在しない
 *   `require` のまま残り、実行時に落ちる。依存は禁止。
 */
const chapters = {
  overview: '1. 概要',
  architecture: '2. システムアーキテクチャとモジュール構成',
  function: '3. 機能設計',
  process: '4. プロセス設計',
  dataModel: '5. データモデル設計',
  impact: '6. 影響範囲分析',
  appendix: '7. 付録',
};

const sections = {
  modules: '2.1 機能モジュール（メニュー別）',
  plugins: '2.2 コンポーネント・プラグイン一覧',
  pluginCorrelation: '2.3 アプリ設定 ↔ プラグインソースの突合',
  tableList: '5.1 テーブル構造一覧',
  tableRelations: '5.2 テーブル間の関係（自動推定）',
  customTables: '5.3 カスタム / 外部テーブル',
  writeSources: '6.1 書込元',
  readSources: '6.2 参照元',
  issues: '6.3 検出された問題',
  fileList: '7.1 アプリパッケージのファイル一覧',
  terms: '7.2 用語',
};

/**
 * フォームの節見出しは「### 3.<連番> <フォーム名>（`id`）」の形。
 * 連番は生成時に振られるため、実際の節見出しを一意に指定できない。
 * そこで「章番号の接頭辞」と「フォーム名」を別々に持ち、
 * 照合はこの 2 つの両方を見る（designDocView.anchorsMatch が担当）。
 */
const formSectionPrefix = '3.';

const CH = chapters;
const SEC = sections;
const FORM_PREFIX = formSectionPrefix;

const OBJ = {
  MENU: 'menu',
  FORM: 'form',
  FIELD: 'field',
  LIST: 'datalist',
  PROCESS: 'process',
  ACTIVITY: 'activity',
  TABLE: 'table',
  COLUMN: 'column',
  PLUGIN: 'plugin',
  DATASOURCE: 'datasource',
  SQL: 'sql',
};

/** 解析状態。UI では必ずラベルを併記する（色だけに頼らない） */
const STATUS = {
  PARSED: 'parsed', // 構成を抽出でき、根拠が示せる
  PARTIAL: 'partial', // 一部は取れたが、規約導出や未確定を含む
  UNKNOWN: 'unknown', // 対象は識別できたが内容を確認できない
  FAILED: 'failed', // 解析処理が対象を処理できなかった
};

/**
 * 解析状態のラベル。
 *
 * ここは「解析」という領域の語彙なので、このモジュールが持つ。
 * UI の語彙表（i18n.js）に解析状態を持たせると、サービス側の
 * 同じ概念と語彙が二重定義になる。i18n.js 側に同じ語を置かないこと。
 *
 * 状態の説明文（「定義から取得でき、根拠が示せます」等）は UI の文脈で
 * 完結するため i18n.js に残してある（ObjectExplorer の st.*Sub）。
 */
const STATUS_LABEL = {
  [STATUS.PARSED]: '解析済',
  [STATUS.PARTIAL]: '一部のみ',
  [STATUS.UNKNOWN]: '未確認',
  [STATUS.FAILED]: '解析失敗',
};

/**
 * 未確認・一部のみの成因。
 *
 * 状態（STATUS）が「どこまで読めたか」を表すのに対し、成因は
 * 「なぜ確定できなかったか」を表す。同じ未確認でも、
 *   - ソースが無いだけで、参照自体は確実に取れているもの
 *   - アプリ定義自体が欠けていて、利用者が確認すべきもの
 * は分けて示すべきで、一つの「未確認」に潰すと後者が埋もれる。
 *
 * 判定は状態を決めたその場で行う。brief の文章から後から推測しない
 * ——文字列が変わると成因が静かに変わるため。
 */
const CAUSE = {
  NO_SOURCE: 'no-source',
  DERIVED: 'derived',
  DEFINITION_GAP: 'definition-gap',
  UNRESOLVED_REF: 'unresolved-ref',
};
const CAUSE_LABEL = {
  'no-source': 'ソース未提供',
  'derived': '規約からの導出',
  'definition-gap': '定義の欠落',
  'unresolved-ref': '参照先が未確認',
};
const CAUSE_DESC = {
  'no-source': '参照は読み取れています。設定項目の突合や接続先の確認には、.jwa に含まれないソース定義が必要です',
  'derived': '命名規約（app_fd_ / c_）で導出したもので、実データベースのメタデータは参照していません',
  'definition-gap': 'アプリ定義自体に情報がなく、静的解析でも確認できません',
  'unresolved-ref': '定義は読めましたが、参照先の ID や項目がアプリ定義内に見つかりません',
};
/** 一覧の並び順。利用者の判断材料になる（アプリ定義側の）成因を先に置く */
const CAUSE_ORDER = ['definition-gap', 'unresolved-ref', 'derived', 'no-source'];

const OBJ_LABEL = {
  [OBJ.MENU]: 'メニュー',
  [OBJ.FORM]: 'フォーム',
  [OBJ.FIELD]: 'フォーム項目',
  [OBJ.LIST]: 'データリスト',
  [OBJ.PROCESS]: 'プロセス',
  [OBJ.ACTIVITY]: 'プロセスノード',
  [OBJ.TABLE]: 'テーブル',
  [OBJ.COLUMN]: 'カラム',
  [OBJ.PLUGIN]: 'プラグイン',
  [OBJ.DATASOURCE]: 'データソース',
  [OBJ.SQL]: 'SQL',
};

const objTypeLabel = (type) => OBJ_LABEL[type] || type;

/** メニュー種別 → 対象の種類。Joget の約束であり、実際は target に含まれる */
const MENU_TARGET = {
  FormMenu: OBJ.FORM,
  CrudMenu: OBJ.LIST,
  DataListMenu: OBJ.LIST,
  ProcessListMenu: OBJ.LIST,
};

/**
 * プラグイン種別の表示名。
 * lib/correlate.js の CATEGORY_LABEL と同じ語彙にそろえる
 * （ここで別の言い方をして、画面ごとに違う呼び方になるのを防ぐ）。
 */
const CATEGORY_LABEL = {
  builtin: '標準プラグイン',
  marketplace: 'マーケットプレイスプラグイン',
  enterprise: 'エンタープライズ版プラグイン',
  custom: '自社開発プラグイン',
};

const AUDIT_COLUMNS = new Set([
  'id', 'dateCreated', 'dateModified', 'createdBy', 'modifiedBy', 'createdByName', 'modifiedByName',
]);

/**
 * フォームが作るテーブルの接頭辞（Joget の命名規約）。
 * 解析側（app_summary.json）は tableName を素の形で返す場合と、
 * 物理テーブル名として app_fd_ 付きの形で返す場合がある。
 * どちらでも同じオブジェクトに解決されるよう、付与はここ 1 箇所で冪等に扱う。
 */
const TABLE_PREFIX = 'app_fd_';

/** 素のテーブル名から規約で物理テーブル名を求める（冪等） */
const physicalTable = (name) => {
  const s = String(name || '');
  return s.startsWith(TABLE_PREFIX) ? s : `${TABLE_PREFIX}${s}`;
};

/** 物理テーブル名から data/*.json のキー（接頭辞なし）に戻す。
 *  app_summary.json の impact は data/ の命名空間で契約されているので、
 *  モデル内部（物理名）と契約（データ名）の境目でのみ使う。 */
const dataTableKey = (physical) => String(physical || '').replace(/^app_fd_/i, '');

/** カラム名から規約の接頭辞 c_ を外した論理名。
 *  SQL の文字列には c_status とも status とも書かれているため、
 *  存在判定の前に対応を揃える。 */
const logicalColumn = (col) => (String(col).startsWith('c_') ? String(col).slice(2) : String(col));

const BASIS_LABEL = {
  form: 'フォーム定義（命名規約で生成）',
  data: 'data/*.json に実在',
  audit: 'Joget の監査列',
  unknown: '根拠を確認できない',
};
/** 一覧で出処を色付きバッジに折りたたむための短いラベル。
 *  正式な説明は BASIS_LABEL の側に置き、こちらは識別のための表示だけ。
 *  種別のキー（form / data / audit / unknown）は data モデルの導出根拠を
 *  表す語彙なので、画面側で同じ文字列を定義し直さない。 */
const BASIS_SHORT = {
  form: 'フォーム定義',
  data: '実データ',
  audit: '監査列',
  unknown: '根拠不明',
};
/** カラム一覧の脚注。バッジの短いラベルと正式な説明の対応を書く。
 *  BASIS_SHORT / BASIS_LABEL の網羅は門禁（test-object-model.mjs）で見る。 */
const BASIS_LEGEND = '出処：フォーム定義＝項目定義から命名規約で生成 · 実データ＝data/*.json に実在 · 監査列＝Joget 基盤が自動付与 · 根拠不明＝定義を確認できない';
const BASIS_REF = {
  form: 'フォーム定義の項目定義',
  data: 'data/*.json',
  audit: 'Joget 基盤が自動付与',
  unknown: '—',
};

const SE_LABEL = {
  formUpdate: 'フォーム書込',
  formRead: 'フォーム参照',
  processUpdate: 'プロセス書込',
  processRead: 'プロセス参照',
};

const ACCESS_LABEL = {
  form: 'フォーム定義から取得',
  sql: 'SQL を直接実行',
  unknown: '取得方法を特定できない',
};

/** boolean 相当の値を「はい / いいえ / 未設定」に寄せる（「無い」と「false」を混ぜない） */
function flag(v) {
  if (v === true || v === 'true') return 'はい';
  if (v === false || v === 'false') return 'いいえ';
  return '未設定';
}

/**
 * テーブルモデルの解決。
 *
 * summary.tableModel を優先する（フォーム定義からの導出で、サンプルデータの
 * エクスポート有無に依存しない）。tableModel が無い古い解析結果では
 * summary.data にフォールバックする。このときキーは app_fd_ を付けない
 * 生名（srm_rfq 等）なので、SQL 側の参照（app_fd_srm_rfq）と突き合わせる
 * ために正規化する。正規化を忘れると同一テーブルが 2 つの identity で
 * 併存し、関連が宙に浮く。
 *
 * 設計書 5.1 もこの解決結果を使う。ここだけ別の決め方にすると、
 * 「画面には出るが設計書に載らないテーブル」が生まれる。
 */
function tableModelOf(summary) {
  const tm = summary?.tableModel;
  if (tm && Object.keys(tm).length) return tm;
  const d = summary?.data || {};
  const out = {};
  for (const [rawKey, info] of Object.entries(d)) {
    out[physicalTable(rawKey)] = { ...info, all_fields: asArray(info?.all_fields || info?.fields) };
  }
  return out;
}

const k = (type, id) => `${type}:${id}`;
const asArray = (v) => (Array.isArray(v) ? v : []);
const show = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));
const attr = (key_, v) => ({ k: key_, v: show(v) });

/**
 * 解析結果一式からオブジェクト索引を作る。
 * @param {object} p
 * @param {object} p.summary       app_summary.json
 * @param {object} [p.correlation] correlation.json（プラグイン突合の結果）
 */
function buildObjectModel({ summary, correlation } = {}) {
  /* 第 1 段: オブジェクトを作る（この段階では関連を張らない）
   * 順序依存で関連を失わないため、生成と関連付けを分離する。 */
  const objects = [];
  const byKey = new Map();
  const kids = []; // { parent, child }
  const rels = []; // { from, to, type, basis }
  const notes = []; // { key, level, text }

  const add = (o) => {
    const obj = { children: [], links: [], evidence: [], attrs: [], docAnchors: [], notes: [], sections: [], ...o };
    objects.push(obj);
    byKey.set(obj.key, obj);
    return obj;
  };
  const contain = (parentKey, childKey) => kids.push({ parent: parentKey, child: childKey });
  const relate = (fromKey, toKey, type, basis) => rels.push({ from: fromKey, to: toKey, type, basis });
  const note = (objKey, level, text) => notes.push({ key: objKey, level, text });

  const forms = asArray(summary?.app?.forms);
  const lists = asArray(summary?.app?.datalists);
  const tableModel = tableModelOf(summary);
  const formIds = new Set(forms.map((f) => f.id));
  const listIds = new Set(lists.map((l) => l.id));
  // データリストが参照しているデータソース名（定義不一定に実在する）
  const referencedDatasources = new Set(lists.map((l) => l.datasourceRef).filter(Boolean));
  // フォーム ID → 素の tableName。リストの読み取り先テーブルを引くために使う
  const formTableNames = new Map(forms.map((f) => [f.id, f.tableName || '']));

  /* ── テーブルとカラム ──────────────────────────────────────────────
   * 出所を分けて保持する。source='form' は命名規約で導出したもので、
   * 実データベースのメタデータを参照したわけではない。 */
  for (const [tableId, tbl] of Object.entries(tableModel)) {
    const allFields = asArray(tbl.all_fields);
    const derived = tbl.source === 'form';
    const rows = Number(tbl.rows || 0);
    add({
      key: k(OBJ.TABLE, tableId),
      id: tableId,
      type: OBJ.TABLE,
      name: tableId,
      status: derived ? STATUS.PARTIAL : STATUS.PARSED,
      /* 実DBのメタデータは参照していない。命名規約での導出という
       * 制約が「一部のみ」の理由なので、成因もそこで決める。 */
      cause: derived ? CAUSE.DERIVED : null,
      brief: derived
        ? `フォーム定義から規約導出 · カラム ${allFields.length} 件`
        : `実データに存在 · カラム ${allFields.length} 件`,
      attrs: [
        attr('テーブル名', tableId),
        attr('命名規約', 'app_fd_<tableName>'),
        attr('導出根拠', derived ? 'フォーム定義' : 'data/*.json'),
        attr('関連フォーム', asArray(tbl.formNames).filter(Boolean).join(' / ')),
        attr('実データ行数', rows > 0 ? rows : null),
        attr('実DBメタデータ', '参照していません（静的解析のみ）'),
      ],
      evidence: [{
        kind: 'derivation',
        ref: derived ? 'フォーム定義（buildTableModel）' : 'data/*.json',
        note: '実データベースの構造は確認していない',
      }],
      docAnchors: [CH.dataModel],
    });

    const formFields = new Map();
    for (const fid of asArray(tbl.formIds)) {
      for (const fld of asArray(forms.find((f) => f.id === fid)?.fields)) {
        formFields.set(`c_${fld.id}`, { fld, formId: fid });
      }
    }
    const dataOnly = new Set(allFields.filter((c) => !c.startsWith('c_')));
    const columnRows = [];

    for (const col of allFields) {
      const hit = formFields.get(col);
      const basis = AUDIT_COLUMNS.has(col) ? 'audit' : hit ? 'form' : dataOnly.has(col) ? 'data' : 'unknown';
      add({
        key: k(OBJ.COLUMN, `${tableId}.${col}`),
        id: col,
        type: OBJ.COLUMN,
        name: hit?.fld?.label ? `${col}（${hit.fld.label}）` : col,
        status: basis === 'unknown' ? STATUS.UNKNOWN : basis === 'form' ? STATUS.PARTIAL : STATUS.PARSED,
        /* form 由来は規約生成なので「導出」。c_ 接頭辞（フォーム項目の
         * 命名規約）なのに項目が見つからないものは「参照先未確認」
         * ——カラム名は取れたが、その元になった定義が辿れない。 */
        cause: basis === 'unknown' ? CAUSE.UNRESOLVED_REF : basis === 'form' ? CAUSE.DERIVED : null,
        brief:
          basis === 'audit' ? 'Joget が自動で付与する監査列'
            : basis === 'form' ? `フォーム項目 ${hit.fld.type || '—'} 由来（規約生成）`
              : basis === 'data' ? '実データに存在（対応するフォーム項目なし）'
                : '定義を確認できない',
        attrs: [
          attr('カラム名', col),
          attr('テーブル', tableId),
          attr('導出根拠', BASIS_LABEL[basis]),
          attr('フォーム項目ID', hit?.fld?.id),
          attr('表示ラベル', hit?.fld?.label),
          attr('項目タイプ', hit?.fld?.type),
          attr('必須', hit ? (hit.fld.mandatory ? 'はい' : 'いいえ') : null),
        ],
        evidence: [{ kind: 'derivation', ref: BASIS_REF[basis], note: hit ? `フォーム ${hit.formId} の定義より` : '' }],
        docAnchors: [SEC.tableList],
      });
      contain(k(OBJ.TABLE, tableId), k(OBJ.COLUMN, `${tableId}.${col}`));
      if (hit) relate(k(OBJ.COLUMN, `${tableId}.${col}`), k(OBJ.FIELD, hit.fld.id), 'field', `項目ID ${hit.fld.id} に命名規約を適用して生成`);
      columnRows.push([col, hit?.fld?.label || '—', BASIS_LABEL[basis], hit?.fld?.type || '—']);
    }
    const tblObj = byKey.get(k(OBJ.TABLE, tableId));
    tblObj.sections.push({
      title: 'カラム一覧',
      kind: 'table',
      head: ['カラム名', '表示名', '導出根拠', '項目タイプ'],
      rows: columnRows,
      note: `${derived ? '命名規約 app_fd_<tableName> / c_<fieldId> で導出しており、実DBのメタデータは参照していません' : 'data/*.json に実在するカラム'}｜${BASIS_LEGEND}`,
      /* 出処の列を色付きバッジで示すための指定。ラベルは BASIS_SHORT /
       * BASIS_LABEL を引くので、ここに文字列は持たせない。 */
      badge: { column: 2, kind: 'basis' },
    });
  }

  /* ── フォームと項目 ──────────────────────────────────────────────── */
  for (const f of forms) {
    const fields = asArray(f.fields);
    const tableId = f.tableName ? physicalTable(f.tableName) : null;
    const binders = [];
    for (const u of asArray(summary?.plugin_usages)) {
      if (u.where?.includes(f.id) && /Binder/.test(u.simpleName || '')) binders.push(u.simpleName);
    }
    const formObj = add({
      key: k(OBJ.FORM, f.id),
      id: f.id,
      type: OBJ.FORM,
      name: f.name || f.id,
      status: tableId && !tableModel[tableId] ? STATUS.PARTIAL : STATUS.PARSED,
      /* フォーム定義は読めたが、規約で推定したテーブルがデータモデルに
       * 無い。定義側の問題ではなく「推定先が解決できない」ので
       * 参照先未確認（データ行が無いことを問題扱いしない）。 */
      cause: tableId && !tableModel[tableId] ? CAUSE.UNRESOLVED_REF : null,
      brief: `項目 ${fields.length} 件${tableId ? ` · ${tableId}` : ' · テーブル未確定'}`,
      attrs: [
        attr('フォームID', f.id),
        attr('名称', f.name),
        attr('項目数', fields.length),
        attr('tableName', f.tableName),
        attr('規約で推定したテーブル', tableId),
        attr('データバインダ', [...new Set(binders)].join(' / ')),
      ],
      evidence: [{ kind: 'config', ref: `アプリ定義のフォーム ${f.id}`, note: 'JWA 内定義' }],
      docAnchors: [FORM_PREFIX, f.name || f.id],
      /* 設計書 3.x はこの事実（特に規約で推定した物理テーブル名）を使う。
       * 素の tableName と物理名の二つを持ち、呼び出し側が選べるようにする。 */
      form: { tableName: f.tableName || null, physicalTable: tableId },
    });
    if (fields.length) {
      formObj.sections.push({
        title: '項目定義',
        kind: 'table',
        head: ['項目ID', '表示名', 'タイプ', '必須', '選択肢'],
        rows: fields.map((fl) => [fl.id, fl.label, fl.type, fl.mandatory ? 'はい' : 'いいえ', fl.options || '—']),
        note: '選択肢は要約しています。全文は元の定義を参照してください',
      });
    }
    if (tableId && !tableModel[tableId]) {
      note(k(OBJ.FORM, f.id), 'warn', `tableName=${f.tableName} から規約で推定した ${tableId} がデータモデルに存在しません`);
    }
    for (const fld of fields) {
      add({
        key: k(OBJ.FIELD, fld.id),
        id: fld.id,
        type: OBJ.FIELD,
        name: fld.label || fld.id,
        status: fld.type ? STATUS.PARSED : STATUS.PARTIAL,
        // タイプが抽出できないのはフォーム定義側に情報が無いため
        cause: fld.type ? null : CAUSE.DEFINITION_GAP,
        brief: `${fld.type || 'タイプ不明'}${fld.mandatory ? ' · 必須' : ''}`,
        attrs: [
          attr('項目ID', fld.id),
          attr('ラベル', fld.label),
          attr('タイプ', fld.type),
          attr('必須', fld.mandatory ? 'はい' : 'いいえ'),
          attr('選択肢', fld.options ? String(fld.options).slice(0, 300) : null),
          attr('規約で生成されるカラム', `c_${fld.id}`),
        ],
        evidence: [{ kind: 'config', ref: `フォーム ${f.id} の定義`, note: '' }],
        docAnchors: [CH.function],
      });
      contain(k(OBJ.FORM, f.id), k(OBJ.FIELD, fld.id));
    }
    if (tableId) relate(k(OBJ.FORM, f.id), k(OBJ.TABLE, tableId), 'table', `tableName=${f.tableName} に命名規約 app_fd_ を適用して導出`);
  }

  /* ── データリスト ─────────────────────────────────────────────────
   * クエリが無いこと自体は異常ではない。バインダがフォーム定義を
   * 経由するタイプなら、そもそも SQL を持たない。
   * dataAccess で「どうデータへ到達するか」を区別する。 */
  for (const l of lists) {
    const access = l.dataAccess || (l.formDefId ? 'form' : l.query ? 'sql' : 'unknown');
    const columns = asArray(l.columns);
    const filters = asArray(l.filters);
    const filterDefs = asArray(l.filterDefs);
    /* 読み取り先のテーブルをここで解決する。formDefId を持てばそのフォームの
     * tableName、無ければクエリの FROM/JOIN から採る。実行時にバインダが
     * 組み立てるクエリは静的には追えないので、その場合は空のまま。
     * 影響範囲のビューはこの解決結果（table の関連）だけを見る。 */
    let readTable = '';
    const viaForm = l.formDefId ? formTableNames.get(l.formDefId) : '';
    if (viaForm) readTable = viaForm;
    else {
      const qm = String(l.query || '').match(/(?:FROM|JOIN)\s+app_fd_(\w+)/i);
      if (qm) readTable = qm[1];
    }
    const readTableId = readTable ? physicalTable(readTable) : null;
    add({
      key: k(OBJ.LIST, l.id),
      id: l.id,
      type: OBJ.LIST,
      name: l.name || l.id,
      status: access === 'unknown' ? STATUS.UNKNOWN : STATUS.PARSED,
      /* バインダがフォーム参照も SQL 参照も持たない。データへ到達する
       * 手段が定義に無いので「定義の欠落」（異常ではなく、その種別の
       * バインダはそもそも SQL を持たないことがある）。 */
      cause: access === 'unknown' ? CAUSE.DEFINITION_GAP : null,
      brief: `${l.binder || 'バインダ不明'} · ${ACCESS_LABEL[access]}`,
      attrs: [
        attr('リストID', l.id),
        attr('名称', l.name),
        attr('バインダ', l.binder),
        attr('データ取得方法', ACCESS_LABEL[access]),
        attr('対象フォーム', l.formDefId),
        attr('列数', columns.length),
        attr('固定の絞り込み条件', filters.length),
        attr('絞り込み UI 数', filterDefs.length),
        attr('既定の並び替え', l.orderBy),
      ],
      evidence: [{ kind: 'config', ref: `データリスト ${l.id} の定義`, note: 'JWA 内定義' }],
      docAnchors: [SEC.modules],
      /* 影響範囲のビューは binder と解決したテーブルだけを見る。 */
      list: {
        binder: l.binder || '',
        formDefId: l.formDefId || '',
        query: String(l.query || ''),
        dataAccess: access,
        table: readTableId,
      },
      sections: [
        columns.length && {
          title: '列定義',
          kind: 'table',
          head: ['列名', '表示名', '並び替え', '絞り込み', '非表示', '書式', '幅'],
          rows: columns.map((c) => [c.name, c.label, flag(c.sortable), flag(c.filterable), flag(c.hidden), c.formatter, c.width]),
        },
        filters.length && {
          title: '固定の絞り込み条件',
          kind: 'table',
          head: ['項目', '演算子', '値', '結合'],
          rows: filters.map((f) => [f.field, f.operator, f.value, f.join]),
          note: '実行時に書き換わる値は静的には確定できません',
        },
        filterDefs.length && {
          title: '絞り込み UI',
          kind: 'table',
          head: ['UI ID', '対象項目', '表示名', '種別'],
          rows: filterDefs.map((f) => [f.id, f.name, f.label, f.type]),
        },
        {
          title: 'ページングと表示',
          kind: 'kv',
          items: [
            attr('1 ページの件数', l.paging?.pageSize === 0 || l.paging?.pageSize === '' ? '0（未指定の可能性）' : l.paging?.pageSize),
            attr('ページサイズ選択の非表示', flag(l.paging?.hidePageSize)),
            attr('件数のキャッシュ', flag(l.paging?.cacheRowCount)),
            attr('列の表示切替', l.showhidecolumns),
            attr('既定の並び替え', l.orderBy),
          ],
        },
        asArray(l.actions).length && {
          title: '操作ボタンと行アクション',
          kind: 'table',
          head: ['名前', '表示名', '種別'],
          rows: asArray(l.actions).map((a) => [a.name, a.label, a.className]),
        },
        l.query && { title: 'SQL', kind: 'code', text: l.query },
      ].filter(Boolean),
    });
    if (l.formDefId && !formIds.has(l.formDefId)) {
      note(k(OBJ.LIST, l.id), 'warn', `対象フォーム ${l.formDefId} がアプリ定義に見当たりません`);
    } else if (l.formDefId) {
      relate(k(OBJ.LIST, l.id), k(OBJ.FORM, l.formDefId), 'form', 'formDefId が直接フォーム定義を指す');
    }
    if (readTableId) {
      const basis = viaForm
        ? `対象フォーム ${l.formDefId} の tableName に命名規約 app_fd_ を適用`
        : 'クエリの FROM/JOIN に命名規約 app_fd_ を適用';
      relate(k(OBJ.LIST, l.id), k(OBJ.TABLE, readTableId), 'table', basis);
    }
    if (access === 'unknown') {
      note(k(OBJ.LIST, l.id), 'info', 'バインダがフォーム参照も SQL 参照も持たないため、データ取得先を静的には確認できません');
    }
    if (l.datasourceRef) {
      relate(k(OBJ.LIST, l.id), k(OBJ.DATASOURCE, l.datasourceRef), 'datasource', `バインダの jdbcDatasource が ${l.datasourceRef} を参照`);
    }
  }

  /* ── メニュー ─────────────────────────────────────────────────────── */
  for (const uv of asArray(summary?.app?.userviews)) {
    for (const cat of asArray(uv.categories)) {
      for (const m of asArray(cat.menus)) {
        const target = m.target || '';
        const targetType = MENU_TARGET[m.type];
        const menuId = m.customId || `${cat.category}/${m.label}`;
        add({
          key: k(OBJ.MENU, menuId),
          id: menuId,
          type: OBJ.MENU,
          name: m.label || menuId,
          status: !target
            ? STATUS.UNKNOWN
            : targetType === OBJ.FORM && formIds.has(target)
              ? STATUS.PARSED
              : targetType === OBJ.LIST && listIds.has(target)
                ? STATUS.PARSED
                : STATUS.PARTIAL,
          /* target が無いのはメニュー種別の性質（HtmlPage 等は持たない）
           * ので「定義の欠落」。target はあるが ID が解決できないものは
           * 「参照先が未確認」——表示名は取れたが実体が辿れない。 */
          cause: !target
            ? CAUSE.DEFINITION_GAP
            : targetType === OBJ.FORM && formIds.has(target)
              ? null
              : targetType === OBJ.LIST && listIds.has(target)
                ? null
                : CAUSE.UNRESOLVED_REF,
          brief: !target ? `${m.type} · 対象未設定（実体を確認できません）` : `${m.type} → ${target}`,
          attrs: [
            attr('メニューID', m.customId),
            attr('表示名', m.label),
            attr('種別', m.type),
            attr('ターゲット', target),
            attr('カテゴリ', cat.category),
            attr('Userview', `${uv.name}（${uv.id}）`),
          ],
          evidence: [{ kind: 'config', ref: `Userview ${uv.id} のカテゴリ「${cat.category}」`, note: '' }],
          docAnchors: [SEC.modules],
          /* 設計書 2.1 の表はこの事実から作る。ここにも app.userviews を
           * 歩く処理を置くと、画面と設計書で module 表が食い違う。 */
          menu: { category: cat.category, label: m.label, type: m.type, target },
        });
        if (!target) {
          note(k(OBJ.MENU, menuId), 'info', 'このメニュー種別は target を保持しません。画面の実態は静的解析では確認できません');
        } else if (targetType === OBJ.FORM) {
          relate(k(OBJ.MENU, menuId), k(OBJ.FORM, target), 'target', 'FormMenu の target がフォーム ID を指す');
        } else if (targetType === OBJ.LIST) {
          relate(k(OBJ.MENU, menuId), k(OBJ.LIST, target), 'target', `${m.type} の target がデータリスト ID を指す`);
        } else {
          relate(k(OBJ.MENU, menuId), k(OBJ.LIST, target), 'target', `種別 ${m.type} の target をリストとして解釈（未確定）`);
        }
      }
    }
  }

  /* ── プロセス ─────────────────────────────────────────────────────── */
  for (const p of asArray(summary?.xpdl?.processes)) {
    const acts = asArray(p.activities);
    const trans = asArray(p.transitions);
    const actIds = new Set(acts.map((a) => a.id));
    const dangling = trans.filter((tr) => !actIds.has(tr.from) || !actIds.has(tr.to));
    const isolated = acts.filter((a) => !trans.some((tr) => tr.from === a.id || tr.to === a.id));
    add({
      key: k(OBJ.PROCESS, p.id),
      id: p.id,
      type: OBJ.PROCESS,
      name: p.name || p.id,
      status: dangling.length || isolated.length ? STATUS.PARTIAL : STATUS.PARSED,
      /* 遷移が未定義ノードを指す・接続の無いノードがある。フロー定義
       * 自体が不完全なので「定義の欠落」。 */
      cause: dangling.length || isolated.length ? CAUSE.DEFINITION_GAP : null,
      brief: `ノード ${acts.length} · 遷移 ${trans.length}`,
      attrs: [
        attr('プロセスID', p.id),
        attr('名称', p.name),
        attr('ノード数', acts.length),
        attr('遷移数', trans.length),
        attr('参加者定義', asArray(p.participants).length),
        attr('開始/終了の推定', detectEndpoints(acts, trans)),
      ],
      evidence: [{ kind: 'config', ref: 'package.xpdl', note: 'XPDL 1.0' }],
      docAnchors: [CH.process],
    });
    if (dangling.length) note(k(OBJ.PROCESS, p.id), 'warn', `遷移 ${dangling.length} 件が定義されていないノードを参照しています`);
    if (isolated.length) note(k(OBJ.PROCESS, p.id), 'warn', `接続の無いノードが ${isolated.length} 件あります`);
    if (trans.length && trans.every((tr) => !tr.condition)) {
      note(k(OBJ.PROCESS, p.id), 'info', '遷移条件が 1 件も定義されていません。無条件分岐の可能性はありますが断定できません');
    }
    const pObj = byKey.get(k(OBJ.PROCESS, p.id));
    pObj.sections.push({
      title: 'ノード',
      kind: 'table',
      head: ['ノードID', '名称', '実装', '実行者/参加者', '分岐'],
      rows: acts.map((a) => [a.id, a.name, a.implementation, a.performer || '—', a.isRoute ? 'はい' : 'いいえ']),
    });
    if (trans.length) {
      pObj.sections.push({
        title: '遷移',
        kind: 'table',
        head: ['遷移元', '遷移先', '条件'],
        rows: trans.map((tr) => [
          tr.from,
          tr.to,
          tr.condition || '（条件なし）',
        ]),
      });
    }
    for (const a of acts) {
      add({
        key: k(OBJ.ACTIVITY, `${p.id}.${a.id}`),
        id: a.id,
        type: OBJ.ACTIVITY,
        name: a.name || a.id,
        status: a.implementation ? STATUS.PARSED : STATUS.PARTIAL,
        // 実装種別が読めないのは XPDL 側に情報が無いため
        cause: a.implementation ? null : CAUSE.DEFINITION_GAP,
        brief: `${a.implementation || '実装不明'}${a.isRoute ? ' · 分岐' : ''}${a.performer ? ` · ${a.performer}` : ''}`,
        attrs: [
          attr('ノードID', a.id),
          attr('名称', a.name),
          attr('実装種別', a.implementation),
          attr('実行者/参加者', a.performer),
          attr('分岐ノード', a.isRoute ? 'はい' : 'いいえ'),
          attr('遷移元', trans.filter((tr) => tr.from === a.id).map((tr) => tr.to).join(' / ')),
          attr('遷移先', trans.filter((tr) => tr.to === a.id).map((tr) => tr.from).join(' / ')),
          attr('参照テーブル', a.activityForms ? asArray(a.activityForms).join(' / ') : null),
        ],
        evidence: [{ kind: 'config', ref: `プロセス ${p.id}（package.xpdl）`, note: '' }],
        docAnchors: [CH.process],
      });
      contain(k(OBJ.PROCESS, p.id), k(OBJ.ACTIVITY, `${p.id}.${a.id}`));
    }
  }

  /* ── SQL ──────────────────────────────────────────────────────────── */
  for (const [i, se] of asArray(summary?.sql_effects).entries()) {
    const sqlId = `${se.kind || 'sql'}-${i}`;
    add({
      key: k(OBJ.SQL, sqlId),
      id: sqlId,
      type: OBJ.SQL,
      name: summarizeSql(se),
      status: STATUS.PARSED,
      brief: `${SE_LABEL[se.kind] || se.kind || 'SQL'}${se.table ? ` · ${se.table}` : ''}`,
      attrs: [
        attr('種別', SE_LABEL[se.kind] || se.kind),
        attr('参照テーブル', se.table),
        attr('プロセスノード', se.activity),
        attr('フォーム', se.form),
        attr('更新対象', asArray(se.sets).join(' / ')),
      ],
      evidence: [
        { kind: 'config', ref: se.form ? `フォーム ${se.form}` : `プロセスノード ${se.activity || '—'}`, note: 'アプリ定義 / XPDL 内の SQL' },
        { kind: 'config', ref: 'SQL 本文', note: String(se.sql || '') },
      ],
      docAnchors: [CH.impact],
    });
    const sObj = byKey.get(k(OBJ.SQL, sqlId));
    sObj.sections.push({ title: 'SQL 本文', kind: 'code', text: String(se.sql || '（SQL 本文がありません）') });
    /* 影響範囲のビューはこの事実だけを見て組む。sets を落とすと
     * 「どの列に何を書くか」を呼び出し側がもう一度解析することになる。 */
    sObj.sql = {
      kind: se.kind || 'sql',
      table: se.table || '',
      form: se.form || '',
      activity: se.activity || '',
      text: String(se.sql || ''),
      sets: asArray(se.sets).map((s) => ({ column: s?.column, value: s?.value })),
      whereColumns: asArray(se.whereColumns),
    };
    if (se.table) {
      // se.table は物理テーブル名として抽出されている場合があり、すでに
      // app_fd_ が付いていることもある。接頭辞の付与は冪等にしておく
      //（app_fd_app_fd_* という実在しないキーを作ってしまう）。
      relate(k(OBJ.SQL, sqlId), k(OBJ.TABLE, physicalTable(se.table)), 'table', 'SQL が参照するテーブル名に命名規約を適用');
    }
    if (se.form && formIds.has(se.form)) relate(k(OBJ.SQL, sqlId), k(OBJ.FORM, se.form), 'sql', 'フォーム定義内に記載された SQL');
  }

  /* ── プラグイン ─────────────────────────────────────────────────────
   * オブジェクトの集合は「アプリ定義が参照するクラス」= summary.plugin_refs
   * を基準にし、突合結果（correlation）はその後で重ねる。
   *
   * なぜ plugin_refs 基準にするのか:
   *   correlation は「ソースとの突合」であり、ソースが無いプロジェクトでは
   *   突合の材料自体が存在しない。しかし「アプリがこのクラスを参照している」
   *   ことは .jwa だけで確定しており、オブジェクトとして存在すべきである。
   *   従来は correlation のバケット（bindings / platform / deadConfig）だけ
   *   から作っていたため、次の 2 つの欠陥があった。
   *   1) ソース未提供のクラスに一律「プラットフォーム標準」という brief が
   *      付いていた。種別は plugin_refs のバケット（builtin / marketplace /
   *      enterprise / custom）で決まる。marketplace や custom を標準と呼って
   *      はいけない。
   *   2) deadConfig の情報（無効と確認された設定項目）が addPlugin の重複
   *      排除で無言で捨てられていた。deadConfig のクラスは必ず bindings にも
   *      現れるため、2 回目の addPlugin は何も作らなかった。
   *      補う情報はマージして 1 件に保つ。
   */
  const addPlugin = (id, patch) => {
    if (!id) return null;
    const key = k(OBJ.PLUGIN, id);
    const cur = byKey.get(key);
    if (cur) {
      /* 同一クラスのオブジェクトは 1 件に保つ。後から来た情報で補う。
       * 新規作成してしまうと、画面の一覧と詳細が食い違い、
       * どちらが正しいかを利用者に判断させることになる。 */
      Object.assign(cur, patch);
      return key;
    }
    add({ key, id, type: OBJ.PLUGIN, name: id.split('.').pop(), ...patch });
    return key;
  };

  // 1) アプリ定義の参照を基準にオブジェクトを作る（ソースの有無とは無関係）
  for (const [cat, bucket] of [
    ['builtin', summary?.plugin_refs?.builtin],
    ['marketplace', summary?.plugin_refs?.marketplace],
    ['enterprise', summary?.plugin_refs?.enterprise],
    ['custom', summary?.plugin_refs?.custom],
  ]) {
    for (const [cls, info] of Object.entries(bucket || {})) {
      const usedIn = asArray(info?.usedIn).filter(Boolean);
      addPlugin(cls, {
        name: cls.split('.').pop(),
        status: STATUS.PARTIAL,
        // この段階ではソースの有無が未確認。後から来る突合結果が
        // PARSED に書き換えるので、cause はそこでも上書きする
        //（inSource=true の patch は cause を null に戻す）。
        cause: CAUSE.NO_SOURCE,
        brief: `アプリ定義から ${info?.occurrences || 0} 箇所が参照 · 設定項目の突合はソースの有無で決まる`,
        attrs: [
          attr('クラス', cls),
          attr('種別', CATEGORY_LABEL[cat] || cat),
          attr('アプリ内使用数', info?.occurrences || 0),
          attr('使用箇所', usedIn.slice(0, 6).join(' / ')),
          attr('ソース', '未確認'),
        ],
        evidence: [{ kind: 'config', ref: 'アプリ定義中の参照', note: '設定項目の突合はプラグインソースがある場合のみ実施できます' }],
        docAnchors: [SEC.plugins],
        plugin: { category: cat, occurrences: info?.occurrences || 0, usedIn, inSource: false },
      });
    }
  }

  // 2) 突合結果で補う。ソースが無い場合も「ソース未提供（種別）」と正直に書き、
  //    標準ではないクラスを標準と呼ぶことはしない。
  for (const b of asArray(correlation?.bindings)) {
    const inSource = !!b.inSource;
    addPlugin(b.className, {
      name: b.simpleName || b.className.split('.').pop(),
      status: inSource ? STATUS.PARSED : STATUS.PARTIAL,
      // ソースが本プロジェクトに無いと設定項目の突合ができない。
      // 参照自体は読めているので「ソース未提供」（異常ではない）
      cause: inSource ? null : CAUSE.NO_SOURCE,
      brief: inSource
        ? `ソース一致 · 宣言 ${show(b.declaredCount)} 件 · アプリ設定 ${asArray(b.setKeys).length} 件`
        : `ソース未提供（${CATEGORY_LABEL[b.category] || b.category}）`,
      attrs: [
        attr('クラス', b.className),
        attr('種別', CATEGORY_LABEL[b.category] || b.category),
        attr('アプリ内使用数', b.occurrences),
        attr('使用箇所', asArray(b.usedIn).filter(Boolean).slice(0, 6).join(' / ')),
        attr('ソース', inSource ? [b.sourceKind, b.source?.file].filter(Boolean).join(' ') : '本プロジェクトにソースなし'),
        attr('宣言済み設定項目数', b.declaredCount),
      ],
      evidence: [{
        kind: inSource ? 'source' : 'config',
        ref: inSource ? b.source?.file || 'アプリ定義の参照のみ' : 'アプリ定義の参照のみ',
        note: inSource ? '同一 Maven モジュールのソースと properties を走査して照合' : 'プラットフォーム標準プラグインのためソースなし',
      }],
      docAnchors: [SEC.plugins],
      plugin: { category: b.category, occurrences: b.occurrences, usedIn: asArray(b.usedIn), inSource },
    });
  }

  // 3) アプリが設定したがソースが宣言しない項目。bindings から作った
  //    オブジェクトに属性を足す（brief は最も先に見るべき結論なので上書きする）。
  for (const d of asArray(correlation?.deadConfig)) {
    const cur = byKey.get(k(OBJ.PLUGIN, d.className));
    addPlugin(d.className, {
      name: d.simpleName || d.className.split('.').pop(),
      status: STATUS.PARSED,
      // 無効設定の検出は確定事実なので解析済。以前の patch が
      // 付けていた cause はここで必ず落とす（残すと解析済に
      // 成因が残り、画面の凡例と食い違う）。
      cause: null,
      brief: `アプリが設定したがソースで宣言なし ${asArray(d.keys).length} 件`,
      attrs: [
        ...asArray(cur?.attrs),
        attr('無効と確認された設定', asArray(d.keys).join(' / ')),
      ],
      evidence: [{ kind: 'source', ref: d.file || 'プラグインソースを全文走査', note: 'properties 定義にも Java ソースにも該当なし' }],
      docAnchors: [SEC.plugins],
    });
  }

  // 使用箇所（usedIn）を実オブジェクトへ解決する。全プラグイン対象に行う。
  //
  // プラットフォーム標準（builtin / enterprise）に限らない理由:
  //   ソース未提供の marketplace / custom は bindings 側から作られるが、
  //   ここを取りこぼすと「使用箇所は分かるのに関連パネルが空」という
  //   中途半端な状態になる。参照されていることは .jwa だけで確定しており、
  //   ソースの有無で関連の有無が変わるべきではない。
  //
  // 使用箇所は「種別 + 識別子」の表示ラベルで届く。
  // ラベル文字列を鍵にすると壊れやすいため、識別子だけを取り出して
  // 既存のオブジェクト索引へ突き合わせる。
  // （プラグインオブジェクトをすべて作り終えた後に実行する必要がある。
  //   usages にしか出てこない標準クラスは platform 段で初めて作成されるため）
  const whereById = new Map();
  for (const o of objects) {
    if (!whereById.has(o.id)) whereById.set(o.id, o.key);
    if (o.type === OBJ.ACTIVITY) {
      const bare = String(o.id).split('.').pop();
      if (!whereById.has(bare)) whereById.set(bare, o.key);
    }
  }
  for (const p of asArray(correlation?.platform)) {
    const key = addPlugin(p.className, {
      name: p.simpleName || p.className.split('.').pop(),
      // 「未確認」ではない。クラス・種別・参照箇所は読み取れており、
      // 読めなかったのは「設定項目の突合」だけなので「一部のみ」にする。
      status: STATUS.PARTIAL,
      cause: CAUSE.NO_SOURCE,
      brief: `プラットフォーム標準 · アプリ内 ${p.occurrences || 0} 箇所から参照 · 設定項目の突合なし`,
      attrs: [
        attr('クラス', p.className),
        attr('種別', CATEGORY_LABEL[p.category] || p.category),
        attr('アプリ内使用数', p.occurrences),
        attr('使用箇所', asArray(p.usedIn).filter(Boolean).slice(0, 8).join(' / ')),
        attr('ソース', 'プラットフォーム標準。アプリにソースは同梱されない'),
        attr('設定項目の突合', 'ソースが無いため実施していない'),
      ],
      evidence: [{
        kind: 'config',
        ref: 'アプリ定義中の参照',
        note: '標準・エンタープライズ版はアプリにソースが同梱されないため、設定項目の突合は実施できません',
      }],
      docAnchors: [SEC.plugins],
      plugin: { category: p.category, occurrences: p.occurrences || 0, usedIn: asArray(p.usedIn), inSource: false },
    });
    if (!key) continue;
    note(key, 'info', '参照箇所と参照回数は読み取れています。設定項目が有効かどうかの判定はソースが無いため実施していません');
  }

  /* 使用箇所 → 実オブジェクトの解決。全プラグインを対象にする。
   * プラットフォーム標準に限らない理由:
   *   ソース未提供の marketplace / custom は bindings 側から作られるが、
   *   ここを取りこぼすと「使用箇所は分かるのに関連パネルが空」という
   *   中途半端な状態になる。参照されていることは .jwa だけで確定しており、
   *   ソースの有無で関連の有無が変わるべきではない。
   *
   * プラグインオブジェクトをすべて作り終えた後に実行する必要がある
   * （usages にしか出てこない標準クラスは platform 段で初めて作成される）。
   *
   * 使用箇所は「種別 + 識別子」の表示ラベルで届く。ラベル文字列を鍵にすると
   * 壊れやすいため、識別子だけを取り出してオブジェクト索引へ突き合わせる。 */
  for (const p of objects) {
    if (p.type !== OBJ.PLUGIN) continue;
    for (const where of asArray(p.plugin?.usedIn)) {
      const target = whereById.get(String(where).split(' ').pop());
      // 「フロント」は Userview 定義であり、対応するオブジェクト種別を
      // 持たないため紐づけない。推測で結び付けない。
      if (target && target !== p.key) relate(p.key, target, 'target', `アプリ定義の ${where} がこのクラスを参照している`);
    }
  }

  /* ── データソース ───────────────────────────────────────────────
   * 定義ブロックがあるものは「定義あり」。
   * バインダが jdbcDatasource で参照しているだけのものは「参照名のみ」。
   * 参照名は設定に実在する文言なので事実として記録するが、
   * 接続先の内容は .jwa に含まれないため推定しない。 */
  for (const ds of asArray(summary?.datasources)) {
    const id = ds.name || ds.id || 'datasource';
    add({
      key: k(OBJ.DATASOURCE, id),
      id,
      type: OBJ.DATASOURCE,
      name: ds.name || id,
      status: STATUS.PARSED,
      brief: ds.driver || 'ドライバ未抽出',
      attrs: [
        attr('名前', ds.name),
        attr('ドライバ', ds.driver),
        attr('定義', '.jwa 内に定義ブロックあり'),
      ],
      evidence: [{ kind: 'config', ref: 'アプリ定義の datasource', note: '' }],
      docAnchors: [CH.appendix],
    });
  }
  // 参照されているだけのデータソース。定義がないので「未確認」扱い
  for (const ref of referencedDatasources) {
    if (byKey.has(k(OBJ.DATASOURCE, ref))) continue;
    add({
      key: k(OBJ.DATASOURCE, ref),
      id: ref,
      type: OBJ.DATASOURCE,
      name: ref,
      status: STATUS.UNKNOWN,
      // 定義ブロックが .jwa に含まれない。参照名は取れているので
      // 「ソース未提供」（接続先を推測しない）
      cause: CAUSE.NO_SOURCE,
      brief: '設定から参照されているだけ（定義は .jwa に含まれない）',
      attrs: [
        attr('参照名', ref),
        attr('定義', '.jwa 内に定義ブロックなし'),
        attr('接続先', '不明（静的解析では推測しません）'),
      ],
      evidence: [{ kind: 'config', ref: 'データリストの jdbcDatasource', note: '参照名のみ取得' }],
      docAnchors: [CH.appendix],
    });
    note(k(OBJ.DATASOURCE, ref), 'info', '接続情報の定義が .jwa に含まれていないため、データ接続先は確認できません');
  }

  /* 第 2 段: 関連を実体で解決する（生成順 Univers に依存させない） */
  const unresolved = [];
  for (const { parent, child } of kids) {
    const p = byKey.get(parent);
    const c = byKey.get(child);
    if (p && c) p.children.push(c.key);
    else unresolved.push({ kind: 'children', from: parent, to: child });
  }
  for (const { from, to, type, basis } of rels) {
    const a = byKey.get(from);
    const b = byKey.get(to);
    if (!a || !b) { unresolved.push({ kind: 'link', from, to, type, basis }); continue; }
    if (a.links.some((l) => l.key === b.key)) continue; // 同じ関連を二重に張らない
    a.links.push({ key: b.key, type, basis });
    b.links.push({ key: a.key, type: `from:${type}`, basis });
  }
  for (const n of notes) byKey.get(n.key)?.notes.push(n);

  /* 影響範囲はオブジェクトが持つ事実から組み、静的検査に渡す。
   * summary.impact はまだ存在しない（analyze.js がこの結果を入れる）ので、
   * issues はここで作ったものを直接使う。summary.impact を読むと
   * モデルを解析結果から組み直すときに検査が静かに空になる。 */
  const impact = buildImpactView({ objects, summary });
  const checks = buildChecks({ impact, correlation, byKey, notes });

  return {
    objects,
    byKey,
    checks,
    impact,
    unresolved,
    stats: buildStats(objects, checks),
    coverage: buildCoverage(summary, objects),
    unconfirmed: objects
      .filter((o) => o.status === STATUS.UNKNOWN || o.status === STATUS.PARTIAL)
      .sort((a, b) => UNCONFIRMED_RANK[a.type] - UNCONFIRMED_RANK[b.type] || a.name.localeCompare(b.name)),
  };
}

/**
 * 未確認一覧の並び順。
 *
 * 「解析が弱い」ことと「問題が潜んでいる」ことは別なので、
 * 不確実そのものがユーザーの判断材料になる種別を先に置く。
 * プラットフォーム標準プラグイン（apps / enterprise）は
 * 参照箇所は確実に取れており正常でも未確認になる種類なので、
 * SQL やデータソースの接続先より後ろに回す。
 */
const UNCONFIRMED_RANK = {
  [OBJ.TABLE]: 0,
  [OBJ.FORM]: 1,
  [OBJ.MENU]: 2,
  [OBJ.LIST]: 3,
  [OBJ.PROCESS]: 4,
  [OBJ.ACTIVITY]: 5,
  [OBJ.SQL]: 6,
  [OBJ.DATASOURCE]: 7,
  [OBJ.FIELD]: 8,
  [OBJ.COLUMN]: 9,
  [OBJ.PLUGIN]: 10,
};

function summarizeSql(se) {
  const s = String(se.sql || '').replace(/\s+/g, ' ').trim();
  if (!s) return `${SE_LABEL[se.kind] || se.kind || 'SQL'}（本文なし）`;
  return s.length > 110 ? `${s.slice(0, 110)}…` : s;
}

/** 遷移の有向グラフから開始/終了を推測する（推測である旨は UI 側で明示する） */
function detectEndpoints(acts, trans) {
  if (!acts.length) return 'ノードなし';
  const hasIn = new Set(trans.map((t) => t.to));
  const hasOut = new Set(trans.map((t) => t.from));
  const starts = acts.filter((a) => !hasIn.has(a.id)).length;
  const ends = acts.filter((a) => !hasOut.has(a.id)).length;
  if (!starts && !ends) return '判定不能（閉路の可能性）';
  return `開始 ${starts} 件 / 終了 ${ends} 件（推定）`;
}

/**
 * 影響範囲のビュー（読み書きの対応）。
 *
 * 「どのフォーム・SQL・リストがどのテーブルを読み書きするか」は
 * オブジェクトが持つ構造化された事実（form.physicalTable / sql.table /
 * list.table）だけから組み立てる。関連（table の link）と同時に作っている
 * ので、この 2 つが食い違うことはない。
 *
 * 関連の解決先オブジェクトからテーブル名を引かないのは、テーブル名の
 * 取得をオブジェクトの存在に依存させないため。テーブルがデータモデルに
 * 無い（サンプルデータも無い）場合でも、読み書きの事実自体は残る。
 *
 * 従来は analyze.js が app.forms / sql_effects / app.datalists を直接歩いて
 * 同じ結論を作っていた。モデルと解析エンジンで二重に推导すると、片方だけが
 * 変わっても気づけないため、ここに一本化する。
 *
 * テーブル名は物理名（app_fd_xxx）で統一する。data/*.json の命名空間に
 * 戻すのは app_summary.json の契約との境目（analyze.js）だけで行う。
 */
function buildImpactView({ objects, summary }) {
  const writeMap = {};
  const readMap = {};
  const effects = asArray(summary?.sql_effects);
  const data = summary?.data || {};

  const put = (map, tableId, entry) => {
    (map[tableId] = map[tableId] || []).push(entry);
  };

  for (const o of objects) {
    if (o.type === OBJ.FORM) {
      const tableId = o.form?.physicalTable;
      if (!tableId) continue;
      put(writeMap, tableId, { source: `フォーム ${o.name}(${o.id})`, fields: '*' });
    } else if (o.type === OBJ.SQL) {
      const raw = o.sql?.table;
      if (!raw) continue;
      const tableId = physicalTable(raw);
      for (const s of asArray(o.sql?.sets)) {
        put(writeMap, tableId, {
          source: `プロセスSQL ${String(o.sql?.text || '').slice(0, 60)}`,
          fields: `${logicalColumn(s?.column)} = '${s?.value}'`,
        });
      }
    } else if (o.type === OBJ.LIST) {
      const tableId = o.list?.table;
      if (!tableId) continue;
      put(readMap, tableId, { source: `リスト ${o.name}(${o.id})`, binder: o.list?.binder });
    }
  }

  /* 問題の検出。data/*.json にサンプルが無いテーブルはフィールドの存在を
   * 判定できないので対象外とする（断定しない）。 */
  const issues = new Set();
  for (const e of effects) {
    if (e.kind !== 'sql') continue;
    const tbl = data[dataTableKey(e.table)];
    const known = new Set(asArray((tbl || {}).all_fields || (tbl || {}).fields).map(logicalColumn));
    if (!known.size) continue;
    for (const s of asArray(e.sets)) {
      if (!known.has(logicalColumn(s?.column))) {
        issues.add(`SQL が \`${physicalTable(e.table)}.${s?.column}\` に書き込みますが、そのフィールドはデータに存在しません（無効な SQL の疑い）: ${String(e.sql).slice(0, 90)}…`);
      }
    }
    for (const wc of asArray(e.whereColumns)) {
      if (!known.has(logicalColumn(wc))) {
        issues.add(`SQL の WHERE 条件が \`${physicalTable(e.table)}.${wc}\` を参照していますが、そのフィールドはデータテーブルに存在しません（プロセスがエラーまたは無言で失敗します）: ${String(e.sql).slice(0, 90)}…`);
      }
    }
  }
  const statusVals = {};
  for (const e of effects) {
    for (const s of asArray(e.sets)) {
      const col = logicalColumn(s?.column);
      if (/status/i.test(col)) (statusVals[col] = statusVals[col] || new Set()).add(s?.value);
    }
  }
  for (const [col, set] of Object.entries(statusVals)) {
    const vals = Array.from(set);
    const lower = new Set(vals.map((v) => String(v).toLowerCase()));
    if (lower.size < vals.length) issues.add(`フィールド \`${col}\` に書き込まれる状態値の大文字・小文字が一致していません: ${JSON.stringify(vals.sort())}（リストの絞り込みで大小文字を固定しているとデータを取りこぼします）`);
    const caps = new Set(vals.filter(Boolean).map((v) => /^[A-Z]/.test(v)));
    if (caps.size > 1) issues.add(`フィールド \`${col}\` の状態値で大文字・小文字の流儀が混在しています: ${JSON.stringify(vals.sort())}（列挙値を統一することを推奨）`);
  }

  return { writeMap, readMap, issues: Array.from(issues).sort() };
}

/**
 * 静的検査。
 * 問題の検出（impact.issues）は buildImpactView が作る。ここではそれを
 * UI が要求する構造（ルール ID / 検査対象 / 根拠 / 範囲 / 解析制限）に
 * 組み立てる。解析結果の形式は変更しない。
 */
function buildChecks({ impact, correlation, byKey, notes }) {
  const out = [];
  const byType = (type, id) => (id ? byKey.get(`${type}:${id}`) || null : null);

  for (const [i, issue] of asArray(impact?.issues).entries()) {
    const text = typeof issue === 'string' ? issue : issue?.text || '';
    if (!text) continue;
    const tableId = (text.match(/app_fd_[A-Za-z0-9_]+/) || [])[0];
    const formId = (text.match(/\b[a-z][a-z0-9]*_[a-z0-9_]+\b/) || [])[0];
    const target = byType(OBJ.TABLE, tableId) || byType(OBJ.FORM, formId);
    out.push({
      ruleId: 'SQL-FIELD',
      rule: 'SQL が存在しないカラムを参照している',
      level: 'error',
      object: target,
      text,
      evidence: tableId ? `参照先テーブル ${tableId}` : 'SQL 本文',
      scope: 'プロセス SQL とフォーム定義内の SQL を文字列として走査',
      limit: '実行結果は確認できません。欠落による実運用の失敗は断定しません',
      seq: i,
    });
  }

  for (const d of asArray(correlation?.deadConfig)) {
    out.push({
      ruleId: 'CFG-DECL',
      rule: 'アプリが設定した項目がプラグインソースで宣言されていない',
      level: 'warn',
      object: byType(OBJ.PLUGIN, d.className),
      text: `${d.simpleName || d.className} に ${asArray(d.keys).join(' / ')} が設定されていますが、プラグインの properties 定義にも Java ソースにも現れません`,
      evidence: d.file || 'プラグインソースを全文走査',
      scope: '同一 Maven モジュール内のソースと properties 定義',
      limit: '継承・基底クラス・動的参照は別モジュールの可能性があり、恒久的に無効とは断定しません',
    });
  }

  for (const u of asArray(correlation?.unresolved)) {
    const cls = typeof u === 'string' ? u : u.className;
    out.push({
      ruleId: 'REF-CLASS',
      rule: '参照されたクラスを特定できない',
      level: 'warn',
      object: byType(OBJ.PLUGIN, cls),
      text: `${cls} はアプリ定義で参照されていますが、解決できませんでした`,
      evidence: 'アプリ定義中の参照文字列',
      scope: 'アプリ定義に現れる完全修飾クラス名',
      limit: '外部 JAR に含まれる可能性があります',
    });
  }

  for (const n of notes) {
    out.push({
      ruleId: 'STRUCT',
      rule: '静的構造の注記',
      level: n.level === 'warn' ? 'warn' : 'info',
      object: byKey.get(n.key) || null,
      text: n.text,
      evidence: byKey.get(n.key)?.evidence?.[0]?.ref || '—',
      scope: '定義ファイル間の静的な整合性',
      limit: '実運用の挙動は確認できません',
    });
  }

  const rank = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.seq ?? 99) - (b.seq ?? 99));
}

function buildStats(objects, checks) {
  const byType = {};
  for (const o of objects) byType[o.type] = (byType[o.type] || 0) + 1;
  const byStatus = {};
  for (const o of objects) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  return {
    total: objects.length,
    byType,
    byStatus,
    checks: {
      error: checks.filter((c) => c.level === 'error').length,
      warn: checks.filter((c) => c.level === 'warn').length,
      info: checks.filter((c) => c.level === 'info').length,
    },
  };
}

/** 資産種別ごとの解析状況。測れていないものは「未計測」と書く（0 と混ぜない） */
function buildCoverage(summary, objects) {
  const count = (type) => objects.filter((o) => o.type === type).length;
  const partial = (type) => objects.filter((o) => o.type === type && o.status !== STATUS.PARSED).length;
  const row = (id, label, measured, type, note) => ({
    id,
    label,
    measured,
    total: count(type),
    partial: partial(type),
    unit: OBJ_LABEL[type],
    note,
  });
  const rows = [
    row('app', 'アプリ定義', !!summary?.app, OBJ.FORM, 'フォーム定義まで取得'),
    row('menu', 'メニュー', asArray(summary?.app?.userviews).length > 0, OBJ.MENU, 'target が無い種別は内容を確認できない'),
    row('form', 'フォーム', !!summary?.app, OBJ.FORM, '項目定義まで取得'),
    row('list', 'データリスト', !!summary?.app, OBJ.LIST, 'バインダ・列定義・絞り込み条件まで取得。実行時に組み立てるクエリは取得できない'),
    row('process', 'プロセス', !!summary?.xpdl, OBJ.PROCESS, 'XPDL のノードと遷移まで取得'),
    row('table', 'データモデル', !!summary, OBJ.TABLE, '命名規約で導出。実DBのメタデータは未参照'),
    row('sql', 'SQL とデータバインダ', true, OBJ.SQL, '文字列として解析できる SQL のみ'),
    row('plugin', 'プラグイン', !!summary, OBJ.PLUGIN, 'ソース未提供のクラスは「標準」として分離'),
    row('datasource', 'データソース', true, OBJ.DATASOURCE, 'アプリ定義に明示されたもののみ'),
  ];
  rows.push({ id: 'column', label: 'カラム', measured: !!summary, total: count(OBJ.COLUMN), partial: partial(OBJ.COLUMN), unit: OBJ_LABEL[OBJ.COLUMN], note: 'フォーム定義から規約生成。実DBは未検証' });
  return rows;
}
/**
 * エクスポート。
 *
 * このモジュールは Node（サービス側）と Vite（ブラウザ側）の両方から
 * 読み込まれる。CJS で書き、Vite / esbuild 側は ESM に変換して
 * 取り込む。変換できない場合はここに足す必要がある。
 *
 * 参照: モジュール単位の再导出を増やすときは、
 * 必ず `npm run build` と `npm run test:all` の両方で確認すること。
 */
/**
 * 明示的な代入にする理由:
 *   `module.exports = { OBJ, ... }` の省略形は Rollup（Vite の本番ビルド）が
 *   静的解析できず、"STATUS" is not exported でビルドが失敗する。
 *   プロパティ名をリテラルで書けば Node からも Rollup からも読める。
 *   省略形にして build が通るのは Node 側だけで、出荷物が壊れるため要注意。
 */
module.exports.OBJ = OBJ;
module.exports.STATUS = STATUS;
module.exports.STATUS_LABEL = STATUS_LABEL;
module.exports.objTypeLabel = objTypeLabel;
module.exports.buildObjectModel = buildObjectModel;
/** 影響範囲のビュー（物理名キー）。analyze.js が app_summary.json の
 *  impact に厚生するときと、設計書 6.x が読むときに使う。
 *  キーは data/*.json の命名空間に戻してから契約に入れる。 */
module.exports.dataTableKey = dataTableKey;
/** テーブルモデルの解決。設計書 5.1（lib/designDoc.js）も同じ解決を使う */
module.exports.tableModelOf = tableModelOf;
/** 設計書の章語彙。生成側（lib/designDoc.js）が参照する */
module.exports.chapters = chapters;
module.exports.sections = sections;
module.exports.formSectionPrefix = formSectionPrefix;
/** プラグイン種別のラベル。種別のキー（builtin / marketplace / …）は
 *  summary.plugin_refs のバケット名でありデータ契約なので、ラベルだけを
 *  一箇所で持つ。生成側（設計書 2.2）と画面が同じ言い方になる。 */
module.exports.CATEGORY_LABEL = CATEGORY_LABEL;
/** カラムの出処の語彙。正式な説明（BASIS_LABEL）と一覧用の短いラベル
 *  （BASIS_SHORT）、脚注（BASIS_LEGEND）。画面のバッジが同じ定義元を引く。 */
module.exports.BASIS_LABEL = BASIS_LABEL;
module.exports.BASIS_SHORT = BASIS_SHORT;
module.exports.BASIS_LEGEND = BASIS_LEGEND;
/** 未確認の成因の語彙。ラベル（CAUSE_LABEL）・説明（CAUSE_DESC）・
 *  一覧の並び順（CAUSE_ORDER）。画面の品質ページが同じ定義元を引く。 */
module.exports.CAUSE = CAUSE;
module.exports.CAUSE_LABEL = CAUSE_LABEL;
module.exports.CAUSE_DESC = CAUSE_DESC;
module.exports.CAUSE_ORDER = CAUSE_ORDER;
