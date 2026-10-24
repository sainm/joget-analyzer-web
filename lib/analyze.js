/**
 * lib/analyze.js — Joget .jwa アプリ解析エンジン（純 Node.js、Python 不使用）
 *
 * S1 展開        unzipTo
 * S2 構造化解析  appDefinition.xml / package.xpdl / data/*.json を解析
 * S3 意味の復元  フォーム項目 / リスト / メニュー / プロセス / データテーブル
 * S4 影響分析    統合オブジェクトモデル（lib/objectModel.js）が作る読み書きの
 *               対応を app_summary.json の impact に厚生する
 * S4b 不足検出   プラグイン参照の分類 / データソース / カスタムテーブル → analysis_inputs.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const { buildObjectModel, dataTableKey } = require('./objectModel.js');

const XML_OPTS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  allowBooleanAttributes: true,
  isArray: (name) =>
    ['formDefinition', 'datalistDefinition', 'userviewDefinition', 'WorkflowProcess',
      'Activity', 'Transition', 'Participant', 'entry', 'packageActivityForm',
      'packageActivityPlugin', 'DataField', 'Tool'].includes(name),
  // Joget はフォーム JSON 全体を <json> に格納するため、HTML エンティティ（&quot; &amp; など）の
  // 数が既定の上限（1000）を大きく超える。エンティティ展開の制限を緩めないと、
  // appDefinition.xml の解析時点で即座にエラーになる。
  processEntities: {
    enabled: true,
    maxEntitySize: 10_000_000,
    maxExpansionDepth: 50,
    maxTotalExpansions: 5_000_000,
    maxExpandedLength: 200_000_000,
  },
  maxNestedTags: 1000,
};

/* ---------- S1 展開 ---------- */

// 解析に不要なバイナリリソース（画像 / 音声・動画 / フォント / アーカイブ / バイナリ）は
// 展開時にスキップする。
// 利点：① 展開サイズを大幅に削減；② 一部パッケージ内の超長ファイル名が引き起こす
// ファイルシステムの上限を回避。
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg', '.tif', '.tiff',
  '.psd', '.ai', '.eps', '.pdf',
  '.zip', '.jar', '.war', '.ear', '.class', '.so', '.dylib', '.dll', '.exe', '.bin',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg', '.webm',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx',
]);

const MAX_SEGMENT_BYTES = 170; // パス 1 セグメントのバイト数上限。ファイルシステムやバックアップ接尾辞の余裕を確保する

function shortenSegments(absPath, root, renamed) {
  const rel = path.relative(root, absPath);
  const segs = rel.split(path.sep);
  const fixed = segs.map((seg, i) => {
    if (Buffer.byteLength(seg) <= MAX_SEGMENT_BYTES) return seg;
    const ext = i === segs.length - 1 ? path.extname(seg) : '';
    const base = ext ? seg.slice(0, -ext.length) : seg;
    const hash = crypto.createHash('sha1').update(seg).digest('hex').slice(0, 8);
    const kept = Buffer.from(base).slice(0, 90).toString('utf8').replace(/\uFFFD/g, '');
    const out = `${kept}~${hash}${ext}`;
    renamed.push({ from: seg, to: out });
    return out;
  });
  return path.join(root, ...fixed);
}

/**
 * 解包 .jwa / .zip。
 * @param {string} zipPath
 * @param {string} destDir
 * @param {{all?: boolean}} [opts] all=true の場合は拡張子でフィルタせず（そのまま全展開）
 * @returns {{destDir:string, extracted:number, skipped:string[], renamed:Array}}
 */
function unzipTo(zipPath, destDir, opts = {}) {
  const extractAll = !!opts.all;
  fs.mkdirSync(destDir, { recursive: true });
  const root = path.resolve(destDir);
  const zip = new AdmZip(zipPath);
  const stat = { destDir, extracted: 0, skipped: [], renamed: [] };

  for (const entry of zip.getEntries()) {
    const name = entry.entryName;
    if (!name || name === '/') continue;
    if (name.endsWith('/')) {
      fs.mkdirSync(path.join(destDir, name), { recursive: true });
      continue;
    }
    if (!extractAll && SKIP_EXT.has(path.extname(name).toLowerCase())) {
      stat.skipped.push(name);
      continue;
    }
    let target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      stat.skipped.push(name); // zip-slip 防护
      continue;
    }
    target = shortenSegments(target, root, stat.renamed);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.getData());
    stat.extracted += 1;
  }
  return stat;
}

/* ---------- XML 互換レイヤ（Joget エクスポートの 2 つの癖） ---------- */

// ① コメントブロックの罠：builderDefinitionList がコメントアウトされ、内部の HTML に
//    -- が含まれるため XML 仕様違反になる → 行単位で除去する
function stripComments(text) {
  const out = [];
  let inComment = false;
  for (const line of text.split('\n')) {
    if (!inComment) {
      if (line.includes('<!--')) {
        const idx = line.indexOf('<!--');
        const before = line.slice(0, idx);
        const after = line.slice(idx + 4);
        if (after.includes('-->')) {
          out.push(before + after.slice(after.indexOf('-->') + 3));
        } else {
          out.push(before);
          inComment = true;
        }
      } else {
        out.push(line);
      }
    } else if (line.includes('-->')) {
      out.push(line.slice(line.indexOf('-->') + 3));
      inComment = false;
    }
  }
  return out.join('\n');
}

// ② エスケープの罠：\\&quot; は JSON 内で正当な引用符エスケープであり、バックスラッシュを全体で除去してはならない
function parseXml(text) {
  const cleaned = stripComments(String(text));
  const parser = new XMLParser(XML_OPTS);
  return parser.parse(cleaned);
}

function findAll(node, tag) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if (k === tag) {
          if (Array.isArray(v)) out.push(...v); else out.push(v);
        }
        walk(v);
      }
    }
  };
  walk(node);
  return out;
}

function txt(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    if (v['#text'] !== undefined) return String(v['#text']).trim();
  }
  return '';
}

function attr(v, name) {
  if (v && typeof v === 'object' && v['@_' + name] !== undefined) return String(v['@_' + name]);
  return '';
}

function stripLabel(s) {
  return String(s == null ? '' : s).replace(/<[^>]+>/g, '').trim();
}

// <json> ノードを解析する（エンティティのデコードは XML パーサが行うが、念のためここでも実施）
function unescapeHtml(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseJsonField(v) {
  const raw = typeof v === 'string' ? v : (v && v['#text']) || '';
  if (!raw || !String(raw).trim()) return {};
  for (const candidate of [raw, unescapeHtml(raw)]) {
    try { return JSON.parse(candidate); } catch (e) { /* try next */ }
  }
  return {};
}

/* ---------- S3 構造化抽出 ---------- */

function extractFields(formJson) {
  const fields = [];
  const seen = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      if (node.className && node.properties) {
        const p = node.properties;
        const validator = p.validator || {};
        const mandatory = !!(validator.properties && validator.properties.mandatory);
        let opts = '';
        if (Array.isArray(p.options) && p.options.length) {
          opts = p.options
            .filter((o) => o && typeof o === 'object')
            .map((o) => `${o.value || ''}=${o.label || ''}`)
            .join('; ').slice(0, 120);
        }
        const id = p.id || '';
        const label = stripLabel(p.label || '');
        if (id && !seen.has(id + '|' + label)) {
          seen.add(id + '|' + label);
          fields.push({
            id, label,
            type: String(node.className).split('.').pop(),
            mandatory, options: opts,
          });
        }
      }
      Object.values(node).forEach(walk);
    }
  };
  walk((formJson || {}).elements || []);
  return fields;
}

/**
 * データリスト定義から取得できる項目を増やす。
 *
 * 従来は id / name / binder / formDefId / query しか採っておらず、
 * 列定義・絞り込み条件・ソート・ページング・行操作が解析結果に存在しなかった。
 * いずれも .jwa に実在する設定なので、既存フィールドを壊さずに追加する。
 *
 * dataAccess は「データへどう到達するか」の判定で、UI が
 * 「クエリが無い = 未取得」と誤読しないために設けた。
 *   form    … formDefId を持ち、フォーム定義経由で取得する
 *   sql     … SQL が直接書かれており、SQL として読み取れる
 *   unknown … どちらも確認できない（実行時のプラグインに依存している可能性）
 */
function extractDatalistDetail(dj, bp) {
  const props = (node) => (node && node.properties) || {};
  const list = (v) => (Array.isArray(v) ? v : []);

  const columns = list(dj.columns).map((c) => ({
    name: c.name || props(c).name || '',
    label: stripLabel(c.label || props(c).label || ''),
    sortable: str3(c.sortable),
    filterable: str3(c.filterable),
    hidden: str3(c.hidden),
    width: c.width || '',
    formatter: String((c.format || {}).className || '').split('.').pop(),
  }));

  // 注意: filters はバインダ側（クエリ条件）とリスト定義側（絞り込み UI 定義）で
  // 別物。どちらも filters という名前なので混ぜない。
  const filters = list(bp.filters).map((f) => ({
    field: f.field || f.name || '',
    operator: f.operator || '',
    join: f.join || '',
    value: String(f.value ?? '').slice(0, 200),
  }));

  const filterDefs = list(dj.filters).map((f) => ({
    id: f.id || '',
    name: f.name || '',
    label: stripLabel(f.label || ''),
    type: String((f.type || {}).className || '').split('.').pop(),
  }));

  const toAction = (a) => ({
    name: props(a).name || '',
    label: stripLabel(props(a).label || ''),
    className: String(a.className || '').split('.').pop(),
  });

  const sql = String(bp.query || bp.sql || '');
  return {
    columns,
    filters,
    filterDefs,
    // 実行時のプラグインが組み立てるクエリは静的には再現できない
    customSelectionValue: String(bp.customSelectionValue || '').slice(0, 200),
    orderBy: dj.orderBy || '',
    paging: {
      pageSize: dj.pageSize ?? null,
      hidePageSize: str3(dj.hidePageSize),
      showPageSizeSelector: str3(dj.showPageSizeSelector),
      options: list(dj.pageSizeSelectorOptions).join(' / '),
      optimisePaging: str3(bp.optimisePaging),
      cacheRowCount: str3(bp.cacheRowCount),
    },
    actions: [...list(dj.actions), ...list(dj.rowActions)].map(toAction),
    rowActionsMode: dj.rowActionsMode || '',
    showhidecolumns: dj.showhidecolumns || '',
    binderOptions: {
      joins: list(bp.joins).length,
      groupBy: String(bp.groupBy || ''),
      extraCondition: String(bp.extraCondition || '').slice(0, 300),
      aggregateField: String(bp.aggregateField || ''),
      functionColumns: list(bp.functionColumns).length,
      primaryKey: bp.primaryKey || '',
    },
    // 参照名のみ。接続情報は .jwa に含まれないため実体的ではない
    datasourceRef: bp.jdbcDatasource || '',
    dataAccess: bp.formDefId ? 'form' : sql ? 'sql' : 'unknown',
  };
}

/** true / false / undefined を文字列に寄せる（「未設定」と「false」を混ぜない） */
function str3(v) {
  if (v === undefined || v === null || v === '') return '';
  return String(v);
}

function parseAppDefinition(xmlText) {
  const doc = parseXml(xmlText);
  const app = {
    appId: '', name: '', version: '', package: '',
    dateCreated: '', dateModified: '',
    forms: [], datalists: [], userviews: [], activityFormMap: [],
  };
  const root = (doc && doc.appDefinition) || {};
  app.appId = txt(root.appId);
  app.name = txt(root.name);
  app.version = txt(root.version);
  app.dateCreated = txt(root.dateCreated);
  app.dateModified = txt(root.dateModified);
  const pkgDef = findAll(doc, 'packageDefinition')[0] || {};
  app.package = txt(pkgDef.name);

  for (const fd of findAll(doc, 'formDefinition')) {
    app.forms.push({
      id: txt(fd.id), name: txt(fd.name), tableName: txt(fd.tableName),
      fields: extractFields(parseJsonField(fd.json)),
    });
  }

  for (const dl of findAll(doc, 'datalistDefinition')) {
    const dj = parseJsonField(dl.json) || {};
    const binder = dj.binder || {};
    const bp = binder.properties || {};
    app.datalists.push({
      // 既存フィールド（後段の読み取り側との互換を保つ）
      id: txt(dl.id), name: txt(dl.name),
      binder: String(binder.className || '').split('.').pop(),
      formDefId: bp.formDefId || '',
      query: String(bp.query || bp.sql || '').slice(0, 400),
      // 追補: リスト定義に実在する表示・操作設定
      ...extractDatalistDetail(dj, bp),
    });
  }

  for (const uv of findAll(doc, 'userviewDefinition')) {
    const uj = parseJsonField(uv.json) || {};
    const categories = [];
    for (const c of (uj.categories || [])) {
      const menus = (c.menus || []).map((m) => {
        const p = m.properties || {};
        return {
          label: stripLabel(p.label || ''), customId: p.customId || '',
          type: String(m.className || '').split('.').pop(),
          target: p.formId || p.datalistId || '',
        };
      });
      categories.push({ category: stripLabel((c.properties || {}).label || ''), menus });
    }
    app.userviews.push({ id: txt(uv.id), name: txt(uv.name), categories });
  }

  for (const paf of findAll(doc, 'packageActivityForm')) {
    app.activityFormMap.push({
      process: txt(paf.processDefId), activity: txt(paf.activityDefId), formId: txt(paf.formId),
    });
  }
  return { app, doc };
}

function parseXpdl(xmlText) {
  if (!xmlText) return { name: '', created: '', processes: [] };
  const doc = parseXml(xmlText);
  const processes = [];
  for (const wp of findAll(doc, 'WorkflowProcess')) {
    const proc = { id: attr(wp, 'Id'), name: attr(wp, 'Name'), participants: [], activities: [], transitions: [] };
    for (const pt of findAll(wp, 'Participant')) {
      proc.participants.push({
        id: attr(pt, 'Id'), name: attr(pt, 'Name'),
        type: txt(pt.ParticipantType && pt.ParticipantType['@_Type']),
      });
    }
    for (const act of findAll(wp, 'Activity')) {
      const impl = act.Implementation;
      let implType = 'none';
      if (impl && typeof impl === 'object') {
        if (impl.Tool !== undefined) implType = 'tool';
        else if (impl.No !== undefined) implType = 'manual';
        else if (impl.SubFlow !== undefined) implType = 'subflow';
      }
      proc.activities.push({
        id: attr(act, 'Id'), name: attr(act, 'Name'),
        performer: txt(act.Performer), implementation: implType,
        isRoute: act.Route !== undefined,
      });
    }
    for (const tr of findAll(wp, 'Transition')) {
      let cond = '';
      const c = tr.Condition;
      if (c !== undefined) {
        const type = attr(c, 'Type');
        const text = txt(c);
        cond = text || (type === 'OTHERWISE' ? 'OTHERWISE' : '');
      }
      proc.transitions.push({ from: attr(tr, 'From'), to: attr(tr, 'To'), condition: cond });
    }
    processes.push(proc);
  }
  const pkgRoot = (doc && doc.Package) || {};
  return {
    name: attr(pkgRoot, 'Name'),
    created: txt((findAll(doc, 'Created')[0])) || '',
    processes,
  };
}

function parseData(baseDir) {
  const dataDir = path.join(baseDir, 'data');
  const tables = {};
  if (!fs.existsSync(dataDir)) return tables;
  for (const f of fs.readdirSync(dataDir).sort()) {
    if (!f.endsWith('.json')) continue;
    let rows;
    try { rows = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')); } catch (e) { continue; }
    if (!Array.isArray(rows) || !rows.length) continue;
    const all = new Set();
    rows.forEach((r) => Object.keys(r).forEach((k) => all.add(k)));
    tables[f.replace(/\.json$/, '')] = {
      records: rows.length,
      fields: Object.keys(rows[0]),
      all_fields: Array.from(all).sort(),
      sample: rows[0],
    };
  }
  return tables;
}

/* ---------- S3b SQL 副作用 ---------- */

function splitTopLevel(s) {
  const parts = []; let buf = ''; let inQ = false;
  for (const ch of String(s)) {
    if (ch === "'") inQ = !inQ;
    if (ch === ',' && !inQ) { parts.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts;
}

function extractSqlEffects(doc) {
  const effects = [];
  const formDefIdToTable = {};
  for (const fd of findAll(doc, 'formDefinition')) {
    formDefIdToTable[txt(fd.id)] = txt(fd.tableName);
  }
  for (const pap of findAll(doc, 'packageActivityPlugin')) {
    const activity = txt(pap.activityDefId);
    const props = parseJsonField(pap.pluginProperties) || {};
    const tools = Array.isArray(props.tools) ? props.tools : [];
    const allTools = tools.length ? tools : [{ className: txt(pap.pluginName), properties: props }];
    for (const tool of allTools) {
      const cls = String(tool.className || '');
      const tp = tool.properties || {};
      if (cls.endsWith('DatabaseUpdateTool')) {
        const sql = String(tp.query || '').replace(/\\n/g, ' ').replace(/\\/g, ' ').replace(/\s+/g, ' ').trim();
        const m = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.*?)(?:\s+WHERE\s+(.*))?$/i);
        if (m) {
          const sets = [];
          for (const part of splitTopLevel(m[2])) {
            const eq = part.indexOf('=');
            if (eq > 0) sets.push({ column: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim().replace(/^'|'$/g, '') });
          }
          effects.push({
            kind: 'sql', activity, table: m[1], sets,
            whereColumns: (m[3] || '').match(/(\w+)\s*=/g)?.map((x) => x.replace(/[\s=]/g, '')) || [],
            sql: sql.slice(0, 300),
          });
        }
      } else if (cls.endsWith('FormDataUpdateTool')) {
        const form = tp.formDefId || '';
        const fields = Array.isArray(tp.fields) ? tp.fields : [];
        effects.push({
          kind: 'sql-form', activity, form,
          table: formDefIdToTable[form] || '',
          sets: fields.map((f) => ({ column: f.field, value: f.value })),
          sql: `FormDataUpdateTool ${form}`,
        });
      }
    }
  }
  return effects;
}

/* ---------- S4 影響マトリクス ----------
 * 読み書きの対応と問題の検出は統合オブジェクトモデル
 * （lib/objectModel.js の buildImpactView）が組む。
 * ここではその結果を app_summary.json の impact に厚生するだけにする。
 * 同じ結論をこの場でもう一度組み立てると、モデルと解析エンジンで
 * 片方だけが変わっても気づかない。
 *
 * モデルのキーは物理テーブル名（app_fd_xxx）。data/*.json の
 * 名前空間（接頭辞なし）に戻してから入れるのは、app_summary.json の
 * 契約を変えないため。画面・RAG・Mermaid はこの形で読んでいる。 */

const dbTable = (t) => `app_fd_${t}`;
// 表示名を統一し、app_fd_app_fd_xxx のような二重化を防ぐ
const dispTable = (t) => (String(t).startsWith('app_fd_') ? String(t) : `app_fd_${t}`);

/* ---------- S4c プラグイン / データソース / カスタムテーブル ---------- */

function collectTexts(doc) {
  const out = [];
  const walk = (n, section) => {
    if (Array.isArray(n)) { n.forEach((x) => walk(x, section)); return; }
    if (n && typeof n === 'object') {
      for (const [k, v] of Object.entries(n)) {
        if ((k === 'json' || k === 'pluginProperties') && typeof v === 'string') out.push({ text: v, section });
        else walk(v, section);
      }
    }
  };
  walk(doc, '');
  return out;
}

function sectionsOf(doc) {
  const list = [];
  for (const [tag, label] of [['formDefinition', 'フォーム'], ['datalistDefinition', 'リスト'], ['userviewDefinition', 'フロント']]) {
    for (const sec of findAll(doc, tag)) list.push({ node: sec, label: `${label} ${txt(sec.id)}` });
  }
  /* builderDefinition は入れない。Joget のエクスポートはページ・レポートの
   * 組み立て定義を `<!--builderDefinitionList>` とコメントアウトして書出す
   * （実素材 15 件すべてがコメント内）。parseXml が読み飛ばすのは正しく、
   * ここで拾いにいくと過去の定義を現在の設定として扱ってしまう。 */
  for (const pap of findAll(doc, 'packageActivityPlugin')) {
    list.push({ node: pap, label: `プロセスノード ${txt(pap.activityDefId)}` });
  }
  return list;
}

function scanPluginRefs(doc) {
  const counts = {};
  const usedIn = {};
  const note = (cls, where) => {
    if (!cls) return;
    counts[cls] = (counts[cls] || 0) + 1;
    (usedIn[cls] = usedIn[cls] || new Set()).add(where);
  };
  const noteJson = (raw, where) => {
    const parsed = parseJsonField(raw);
    const scan = (n) => {
      if (Array.isArray(n)) { n.forEach(scan); return; }
      if (n && typeof n === 'object') {
        if (typeof n.className === 'string') note(n.className, where);
        Object.values(n).forEach(scan);
      }
    };
    scan(parsed);
    // フォールバック：直接正規表現（JSON 解析に失敗した場合の対応）
    const re = /"className"\s*:\s*"([\w.]+)"/g;
    let m;
    while ((m = re.exec(unescapeHtml(String(raw))))) note(m[1], where);
  };

  for (const s of sectionsOf(doc)) {
    for (const [k, v] of Object.entries(s.node || {})) {
      if ((k === 'json' || k === 'pluginProperties') && typeof v === 'string') noteJson(v, s.label);
    }
    const pn = txt(s.node && s.node.pluginName);
    if (pn) note(pn, s.label);
  }

  const res = { builtin: {}, marketplace: {}, enterprise: {}, custom: {} };
  for (const [cls, n] of Object.entries(counts)) {
    const entry = { occurrences: n, usedIn: Array.from(usedIn[cls]).sort() };
    if (cls.startsWith('org.joget.marketplace.')) res.marketplace[cls] = entry;
    else if (cls.startsWith('org.joget.plugin.enterprise.')) res.enterprise[cls] = entry;
    else if (cls.startsWith('org.joget.')) res.builtin[cls] = entry;
    else res.custom[cls] = entry;
  }
  return res;
}

/* ---------- S4d プラグイン実設定の収集（プラグインソースとの突合に使用） ---------- */

/**
 * アプリ定義を走査し、プラグイン参照の各箇所を**実際に設定されたパラメータ**ごと抽出する。
 * これが「Java ソース ↔ .jwa」突合のデータ基盤になる：実際の設定値があって初めて、
 * ソースで宣言された properties 定義と双方向に比較できる（過剰設定 / 未設定 / 名前の誤り）。
 */
function extractPluginUsages(doc) {
  const usages = [];
  const index = new Map();

  const push = (obj, where, keys) => {
    const cls = String(obj.className);
    if (!cls) return;
    const props = obj.properties && typeof obj.properties === 'object' ? obj.properties : {};
    const configKeys = Object.keys(props);
    const config = {};
    for (const k of configKeys) {
      const v = props[k];
      if (v === null || v === undefined || typeof v === 'object') continue;
      config[k] = String(v).slice(0, 160);
    }
    // 参照位置：className オブジェクトが入っているキー（binder / loadBinder / optionsBinder / tools[0] …）
    const named = keys.filter((k) => !/^\[/.test(k));
    const slot = named.length ? named[named.length - 1] : '';
    const path = keys.slice(-5).join('.');
    // 同じ設定が複数行・複数要素で重複して現れる場合は件数をまとめ、画面が埋まらないようにする
    const key = `${cls}|${where}|${slot}|${configKeys.join(',')}|${Object.values(config).join('|')}`;
    const hit = index.get(key);
    if (hit) {
      hit.occurrences += 1;
      if (!hit.paths.includes(path)) hit.paths.push(path);
      return;
    }
    const rec = {
      className: cls,
      simpleName: cls.split('.').pop(),
      where,
      slot,
      path,
      paths: [path],
      occurrences: 1,
      configKeys,
      config,
    };
    index.set(key, rec);
    usages.push(rec);
  };

  const walk = (node, where, keys, depth) => {
    if (depth > 12) return;
    if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, where, keys.concat(`[${i}]`), depth + 1));
      return;
    }
    if (node && typeof node === 'object') {
      if (typeof node.className === 'string') push(node, where, keys);
      for (const [k, v] of Object.entries(node)) walk(v, where, keys.concat(k), depth + 1);
    }
  };

  for (const s of sectionsOf(doc)) {
    for (const [k, v] of Object.entries(s.node || {})) {
      if ((k === 'json' || k === 'pluginProperties') && typeof v === 'string') {
        const parsed = parseJsonField(v);
        if (parsed) walk(parsed, s.label, [k], 0);
      }
    }
  }
  return usages;
}

function scanDatasources(doc) {
  const counts = {};
  for (const { text } of collectTexts(doc)) {
    const re = /"jdbcDatasource"\s+:\s*"([\w-]+)"/g;
    let m;
    while ((m = re.exec(unescapeHtml(text)))) counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  return Object.entries(counts).sort().map(([name, refs]) => ({ name, refs, external: name !== 'default' }));
}

function scanSqlTables(doc) {
  const tables = {};
  for (const { text } of collectTexts(doc)) {
    const t = unescapeHtml(text);
    const re = /"(?:query|sql)"\s*:\s*"((?:UPDATE|SELECT|INSERT|DELETE)(?:[^"\\]|\\.)*)"/gi;
    let m;
    while ((m = re.exec(t))) {
      const sql = m[1].replace(/\\n/g, ' ').replace(/\\/g, ' ').replace(/\s+/g, ' ').trim();
      const tre = /(?:FROM|JOIN|UPDATE|INTO)\s+([\w.]+)/gi;
      let tm;
      while ((tm = tre.exec(sql))) {
        (tables[tm[1]] = tables[tm[1]] || []).push(sql.slice(0, 150));
      }
    }
  }
  return tables;
}

function buildAnalysisInputs(app, pluginRefs, datasources, sqlTables) {
  const formTables = new Set(app.forms.map((f) => `app_fd_${f.tableName}`));
  const plugins = [];
  for (const [cat, catCn] of [['custom', '自社開発プラグイン'], ['marketplace', 'マーケットプレイスプラグイン'], ['enterprise', 'エンタープライズ版プラグイン']]) {
    for (const [className, info] of Object.entries(pluginRefs[cat] || {})) {
      plugins.push({
        className, category: catCn, occurrences: info.occurrences,
        used_in: info.usedIn, status: 'missing',
        source_path: '', manifest_json: '', doc_url: '', note: '',
      });
    }
  }
  const ds = datasources.filter((d) => d.external).map((d) => ({
    name: d.name, refs: d.refs, status: 'missing', db_type: '', jdbc_url: '', ddl_location: '', note: '',
  }));
  const customTables = [];
  for (const [table, sqls] of Object.entries(sqlTables).sort()) {
    if (!formTables.has(table)) {
      customTables.push({ table, referenced_by_sql: sqls.slice(0, 3), status: 'missing', ddl_file: '', fields: [], note: '' });
    }
  }
  const deps = [];
  if (Object.keys(pluginRefs.enterprise).length) deps.push(`Joget エンタープライズ版ライセンスに依存（エンタープライズ版プラグインクラス ${Object.keys(pluginRefs.enterprise).length} 個）`);
  if (Object.keys(pluginRefs.marketplace).length) deps.push(`マーケットプレイスプラグインのインストールに依存（マーケットプレイスプラグインクラス ${Object.keys(pluginRefs.marketplace).length} 個）`);
  if (Object.keys(pluginRefs.custom).length) deps.push(`自社開発プラグインのデプロイに依存（自社開発クラス ${Object.keys(pluginRefs.custom).length} 個）`);

  return {
    _doc: '解析の補足設定：status を provided に変更して入手元を記入し再解析すると、結果が app_summary.json に取り込まれます',
    custom_plugins: plugins,
    external_datasources: ds,
    custom_tables: customTables,
    deployment_dependencies: deps,
    server_side_exports: {
      _doc: '.jwa にはサーバー側設定が含まれないため、完全な設計書には別途エクスポートが必要です',
      users_groups: { status: 'missing', note: 'ユーザー/グループ/組織（userview の権限ルールは UUID のみ保存）' },
      permission_matrix: { status: 'missing', note: 'メニュー/フォーム/データの権限割り当て' },
      environment_variables: { status: 'missing', note: '#envVariable.x# が参照する変数一覧' },
      email_settings: { status: 'missing', note: 'メールツール/通知の SMTP 設定' },
      schedulers: { status: 'missing', note: '定期実行タスク（Deadline/スケジューラプラグイン）' },
    },
  };
}

function enrichWithInputs(summary, inputs) {
  if (!inputs) return summary;
  for (const p of inputs.custom_plugins || []) {
    if (p.status === 'provided' && p.manifest_json && fs.existsSync(p.manifest_json)) {
      try { p.manifest = JSON.parse(fs.readFileSync(p.manifest_json, 'utf8')); } catch (e) { /* ignore */ }
    }
  }
  for (const t of inputs.custom_tables || []) {
    if (t.status === 'provided' && t.ddl_file && fs.existsSync(t.ddl_file)) {
      const ddl = fs.readFileSync(t.ddl_file, 'utf8');
      t.fields = (ddl.match(/(\w+)\s+(?:VARCHAR|CHAR|TEXT|INT|BIGINT|DECIMAL|NUMERIC|DATE|DATETIME|TIMESTAMP|BOOLEAN|DOUBLE|FLOAT)\w*/gi) || [])
        .map((x) => x.split(/\s+/)[0]);
    }
  }
  summary.analysis_inputs = inputs;
  return summary;
}

/* ---------- テーブル間の関係推定 ---------- */

/**
 * フォーム定義から物理テーブルモデルを導出する。
 *
 * 必要な理由：.jwa 内の data/*.json は、エクスポート時に「データを含める」を選んだ場合にのみ存在する。
 * 以前は ER 図 / テーブル間関係が data/ しか見ていなかったため、「エクスポート時にデータを
 * 含めなかった」アプリでは ER 図が空になっていた —— しかし物理テーブルは元から存在する：
 * フォームの tableName がテーブル名 app_fd_<tableName> を決め、フィールドが列名 c_<fieldId> を
 * 決める。したがってテーブルモデルはフォーム定義を基準にし、data/ は実際のサンプル列を
 * 重ねるためだけに使う。
 */

/** Joget の純粋なレイアウト要素。DB に保存されず c_ 列も作らない */
const NO_COLUMN_TYPES = new Set([
  'Section', 'Column', 'Label', 'Html', 'CustomHTML', 'Button',
  'Grid', 'SubForm', 'Form', 'Page', 'PopupDialog', 'Tab', 'Tabs',
]);

/** Joget 標準の監査列。すべての app_fd_* テーブルに存在する */
const AUDIT_COLS = ['id', 'dateCreated', 'dateModified', 'createdBy', 'modifiedBy'];

function buildTableModel(app, data) {
  const model = {};

  // 1) フォーム定義 → 物理テーブルと列（サンプルデータに依存しない）
  for (const f of app.forms || []) {
    if (!f.tableName) continue; // テーブル未紐付けのフォーム（純粋な表示/読み取り専用）は物理テーブルを作らない
    const t = dbTable(f.tableName);
    if (!model[t]) model[t] = { all_fields: [], formIds: [], formNames: [], rows: 0, source: 'form' };
    const m = model[t];
    if (!m.formIds.includes(f.id)) m.formIds.push(f.id);
    if (!m.formNames.includes(f.name)) m.formNames.push(f.name || f.id);
    for (const fd of f.fields || []) {
      if (!fd.id || NO_COLUMN_TYPES.has(fd.type)) continue;
      const col = `c_${fd.id}`;
      if (!m.all_fields.includes(col)) m.all_fields.push(col);
    }
  }

  // 2) 監査列を補う
  for (const m of Object.values(model)) {
    for (const c of AUDIT_COLS) if (!m.all_fields.includes(c)) m.all_fields.push(c);
  }

  // 3) data/ に現れる追加テーブル・追加列を重ねる（非フォームテーブル、手動作成のテーブルなど）
  //    注意：data/*.json のファイル名は app_fd_ 接頭辞を付けない（srm_rfq）ため、正規化が必須。
  //    そうしないと同一テーブルが srm_rfq と app_fd_srm_rfq の 2 つの identity で併存し、
  //    ER 図に重複エンティティが現れる。
  for (const [rawKey, info] of Object.entries(data || {})) {
    const t = dispTable(rawKey);
    if (!model[t]) model[t] = { all_fields: [], formIds: [], formNames: [], rows: 0, source: 'data' };
    const m = model[t];
    for (const c of info.all_fields || info.fields || []) {
      if (!m.all_fields.includes(c)) m.all_fields.push(c);
    }
    const rows = info.rows ?? (info.records || []).length ?? 0;
    m.rows = Math.max(m.rows || 0, rows);
    if (m.rows > 0 && m.source === 'form') m.source = 'form+data';
  }

  return model;
}

function inferRelations(data) {
  const names = Object.keys(data).sort((a, b) => a.length - b.length);
  const rels = [];
  const seen = new Set();
  for (const [t, info] of Object.entries(data)) {
    for (const f of (info.all_fields || info.fields || [])) {
      if (!f.endsWith('_id') || f === 'id') continue;
      const base = f.slice(0, -3);
      let best = null, bestScore = 99;
      for (const n of names) {
        if (n === t) continue;
        const short = n.startsWith('app_fd_') ? n.slice(7) : n;
        let score;
        if (short === base) score = 0;
        else if (short.endsWith('_' + base)) score = 1;
        else if (short.startsWith(base + '_')) score = 2;
        else if (short.includes(base)) score = 3;
        else continue;
        if (score < bestScore) { best = n; bestScore = score; }
      }
      const key = `${t}|${f}|${best}`;
      if (best && !seen.has(key)) {
        seen.add(key);
        rels.push({ from: best, to: t, field: f, desc: '' });
      }
    }
  }
  return rels;
}

/* ---------- メインフロー ---------- */

function analyze(inputPath, outDir, opts = {}) {
  const src = path.resolve(inputPath);
  let base = src;
  let unzipStat = null;
  if (fs.statSync(src).isFile()) {
    base = path.join(path.dirname(src), path.basename(src).replace(/\.jwa$/i, ''));
    unzipStat = unzipTo(src, base, opts);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const appdefPath = path.join(base, 'appDefinition.xml');
  if (!fs.existsSync(appdefPath)) throw new Error(`appDefinition.xml が見つかりません: ${base}`);
  const appdefXml = fs.readFileSync(appdefPath, 'utf8');

  const { app, doc } = parseAppDefinition(appdefXml);
  const xpdlPath = path.join(base, 'package.xpdl');
  const xpdl = parseXpdl(fs.existsSync(xpdlPath) ? fs.readFileSync(xpdlPath, 'utf8') : '');
  const data = parseData(base);

  const sqlEffects = extractSqlEffects(doc);
  // テーブルモデルはフォーム定義を基準にする（.jwa がサンプルデータをエクスポートしているとは限らない）。data/ は実際の列を重ねるためだけに使う
  const tableModel = buildTableModel(app, data);
  const relations = inferRelations(tableModel);

  const pluginRefs = scanPluginRefs(doc);
  const pluginUsages = extractPluginUsages(doc);
  const datasources = scanDatasources(doc);
  let sqlTables = scanSqlTables(doc);
  const formTables = new Set(app.forms.map((f) => `app_fd_${f.tableName}`));
  const unknownTables = Object.fromEntries(Object.entries(sqlTables).filter(([t]) => !formTables.has(t)));

  const inputsPath = path.join(outDir, 'analysis_inputs.json');
  let inputs;
  if (fs.existsSync(inputsPath)) {
    try { inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8')); } catch (e) { inputs = null; }
  }
  if (!inputs) {
    inputs = buildAnalysisInputs(app, pluginRefs, datasources, sqlTables);
    fs.writeFileSync(inputsPath, JSON.stringify(inputs, null, 2), 'utf8');
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    app, xpdl, data, tableModel, relations,
    sql_effects: sqlEffects,
    plugin_refs: pluginRefs, plugin_usages: pluginUsages, datasources,
    sql_tables: unknownTables,
  };
  enrichWithInputs(summary, inputs);

  /* 影響範囲（読み書きの対応・問題検出）は統合オブジェクトモデルが組む。
   * キーは物理テーブル名なので、data/*.json の名前空間に戻してから入れる
   * （app_summary.json の契約は変えない）。モデルは summary を読むが
   * impact は読まないので、ここで後から入れても辻褄が合う。 */
  const objectModel = buildObjectModel({ summary });
  const toDataKeys = (map) => Object.fromEntries(Object.entries(map).map(([t, v]) => [dataTableKey(t), v]));
  summary.impact = {
    writeMap: toDataKeys(objectModel.impact.writeMap),
    readMap: toDataKeys(objectModel.impact.readMap),
    issues: objectModel.impact.issues,
  };

  fs.writeFileSync(path.join(outDir, 'app_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  const stats = {
    forms: app.forms.length, datalists: app.datalists.length,
    menus: app.userviews.reduce((n, uv) => n + uv.categories.reduce((m, c) => m + c.menus.length, 0), 0),
    processes: xpdl.processes.length,
    // テーブル数はテーブルモデルを基準にする（フォーム定義から導出）。エクスポート時にサンプルデータを付けなかったことで 0 と表示されないようにする
    tables: Object.keys(tableModel).length,
    tablesWithData: Object.keys(data).length,
    sqlEffects: sqlEffects.length,
    plugins: {
      builtin: Object.keys(pluginRefs.builtin).length,
      marketplace: Object.keys(pluginRefs.marketplace).length,
      enterprise: Object.keys(pluginRefs.enterprise).length,
      custom: Object.keys(pluginRefs.custom).length,
    },
    writeTables: Object.keys(summary.impact.writeMap).length,
    readTables: Object.keys(summary.impact.readMap).length,
    issues: summary.impact.issues.length,
    baseDir: base,
    assetsSkipped: unzipStat ? unzipStat.skipped.length : 0,
    renamed: unzipStat ? unzipStat.renamed.length : 0,
  };
  return { summary, stats, baseDir: base, outDir, unzip: unzipStat };
}

module.exports = {
  unzipTo, stripComments, parseXml, findAll, txt, parseJsonField, extractFields,
  parseAppDefinition, parseXpdl, parseData, extractSqlEffects,
  scanPluginRefs, scanDatasources, scanSqlTables, buildAnalysisInputs,
  enrichWithInputs, inferRelations, analyze, extractPluginUsages,
};
