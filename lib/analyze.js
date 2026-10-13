/**
 * lib/analyze.js — Joget .jwa 应用分析引擎（纯 Node.js，无 Python）
 *
 * S1 解包       unzipTo
 * S2 结构化解析  解析 appDefinition.xml / package.xpdl / data/*.json
 * S3 语义还原    表单字段 / 列表 / 菜单 / 流程 / 数据表
 * S4 影响分析    写入方(表单+SQL) / 读取方(列表) / 问题检测
 * S4b 缺口检测   插件引用分类 / 数据源 / 自定义表 → analysis_inputs.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');

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
  // Joget 把整个表单 JSON 塞在 <json> 里，HTML 实体（&quot; &amp; 等）数量远超默认上限（1000），
  // 必须放宽实体扩展限制，否则解析在 appDefinition.xml 上直接抛错。
  processEntities: {
    enabled: true,
    maxEntitySize: 10_000_000,
    maxExpansionDepth: 50,
    maxTotalExpansions: 5_000_000,
    maxExpandedLength: 200_000_000,
  },
  maxNestedTags: 1000,
};

/* ---------- S1 解包 ---------- */

// 分析不需要的二进制资源（图片 / 音视频 / 字体 / 归档 / 二进制），解包时直接跳过。
// 好处：① 大幅缩减解包体积；② 规避个别包内超长文件名触发的文件系统上限。
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg', '.tif', '.tiff',
  '.psd', '.ai', '.eps', '.pdf',
  '.zip', '.jar', '.war', '.ear', '.class', '.so', '.dylib', '.dll', '.exe', '.bin',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg', '.webm',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx',
]);

const MAX_SEGMENT_BYTES = 170; // 单路径分量字节上限，留足文件系统/备份后缀余量

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
 * @param {{all?: boolean}} [opts] all=true 时不做扩展名过滤（原样全解）
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

/* ---------- XML 兼容层（两个 Joget 导出怪癖） ---------- */

// ① 注释块陷阱：builderDefinitionList 被注释掉，内部 HTML 含 -- 违反 XML 规范 → 按行剥离
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

// ② 转义陷阱：\\&quot; 是 JSON 内的合法引号转义，绝不能全局去掉反斜杠
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

// 解析 <json> 节点（实体解码由 XML 解析器完成，这里兜底再做一次）
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

/* ---------- S3 结构化提取 ---------- */

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
      id: txt(dl.id), name: txt(dl.name),
      binder: String(binder.className || '').split('.').pop(),
      formDefId: bp.formDefId || '',
      query: String(bp.query || bp.sql || '').slice(0, 400),
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

/* ---------- S4 影响矩阵 + 问题检测 ---------- */

const logicalName = (col) => (String(col).startsWith('c_') ? String(col).slice(2) : String(col));
const dbTable = (t) => `app_fd_${t}`;
// app_fd_T.c_status → T.status（与 data/*.json 的字段命名空间一致）
const dataKey = (t) => String(t).replace(/^app_fd_/i, '');
// 统一展示名，避免出现 app_fd_app_fd_xxx
const dispTable = (t) => (String(t).startsWith('app_fd_') ? String(t) : `app_fd_${t}`);

function buildImpact(app, effects, data) {
  const writeMap = {};
  const readMap = {};

  for (const f of app.forms) {
    if (!f.tableName) continue;
    (writeMap[dataKey(f.tableName)] = writeMap[dataKey(f.tableName)] || []).push({
      source: `表单 ${f.name}(${f.id})`, fields: '*',
    });
  }
  for (const e of effects) {
    const t = dataKey(e.table);
    if (!t) continue;
    for (const s of e.sets) {
      (writeMap[t] = writeMap[t] || []).push({
        source: `流程SQL ${String(e.sql).slice(0, 60)}`,
        fields: `${logicalName(s.column)} = '${s.value}'`,
      });
    }
  }

  const formById = {};
  app.forms.forEach((f) => { formById[f.id] = f; });
  for (const d of app.datalists) {
    let t = '';
    if (d.formDefId && formById[d.formDefId]) t = formById[d.formDefId].tableName;
    if (!t) {
      const m = String(d.query).match(/(?:FROM|JOIN)\s+app_fd_(\w+)/i);
      if (m) t = m[1];
    }
    if (t) (readMap[dataKey(t)] = readMap[dataKey(t)] || []).push({ source: `列表 ${d.name}(${d.id})`, binder: d.binder });
  }

  const issues = new Set();
  for (const e of effects) {
    if (e.kind !== 'sql') continue;
    const tbl = data[dataKey(e.table)];
    const known = new Set((((tbl || {}).all_fields) || (tbl || {}).fields || []).map(logicalName));
    if (!known.size) continue; // 该表没有样例数据，无法判断字段存在性
    for (const s of e.sets) {
      if (!known.has(logicalName(s.column))) {
        issues.add(`SQL 写入 \`${dispTable(e.table)}.${s.column}\`，数据中不存在该字段（疑似失效 SQL）: ${String(e.sql).slice(0, 90)}…`);
      }
    }
    for (const wc of (e.whereColumns || [])) {
      if (!known.has(logicalName(wc))) {
        issues.add(`SQL WHERE 条件引用 \`${dispTable(e.table)}.${wc}\`，该字段不存在于数据表（流程会报错或静默失败）: ${String(e.sql).slice(0, 90)}…`);
      }
    }
  }
  const statusVals = {};
  for (const e of effects) {
    for (const s of e.sets) {
      const col = logicalName(s.column);
      if (/status/i.test(col)) (statusVals[col] = statusVals[col] || new Set()).add(s.value);
    }
  }
  for (const [col, set] of Object.entries(statusVals)) {
    const vals = Array.from(set);
    const lower = new Set(vals.map((v) => String(v).toLowerCase()));
    if (lower.size < vals.length) issues.add(`字段 \`${col}\` 写入的状态值大小写不一致: ${JSON.stringify(vals.sort())}（列表过滤写死大小写会漏数据）`);
    const caps = new Set(vals.filter(Boolean).map((v) => /^[A-Z]/.test(v)));
    if (caps.size > 1) issues.add(`字段 \`${col}\` 状态值大小写风格混用: ${JSON.stringify(vals.sort())}（建议统一枚举）`);
  }

  return { writeMap, readMap, issues: Array.from(issues).sort() };
}

/* ---------- S4c 插件 / 数据源 / 自定义表 ---------- */

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
  for (const [tag, label] of [['formDefinition', '表单'], ['datalistDefinition', '列表'], ['userviewDefinition', '前台']]) {
    for (const sec of findAll(doc, tag)) list.push({ node: sec, label: `${label} ${txt(sec.id)}` });
  }
  for (const pap of findAll(doc, 'packageActivityPlugin')) {
    list.push({ node: pap, label: `流程节点 ${txt(pap.activityDefId)}` });
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
    // 兜底：直接正则（应对 JSON 解析失败）
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

/* ---------- S4d 插件实际配置采集（用于与插件源码做联动比对） ---------- */

/**
 * 遍历应用定义，把每一处插件引用连同它**实际配置的参数**抓下来。
 * 这是「Java 源码 ↔ .jwa」联动的数据基础：有了实际配置值，才能和源码里声明的
 * properties 定义做双向比对（多配了 / 没配 / 配错名）。
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
    // 引用位置：className 对象所在的那个键（binder / loadBinder / optionsBinder / tools[0] …）
    const named = keys.filter((k) => !/^\[/.test(k));
    const slot = named.length ? named[named.length - 1] : '';
    const path = keys.slice(-5).join('.');
    // 同一处配置在多行/多元素里重复出现时合并计数，避免刷屏
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
  for (const [cat, catCn] of [['custom', '自研插件'], ['marketplace', '市场插件'], ['enterprise', '企业版插件']]) {
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
  if (Object.keys(pluginRefs.enterprise).length) deps.push(`依赖 Joget Enterprise 许可（${Object.keys(pluginRefs.enterprise).length} 个企业版插件类）`);
  if (Object.keys(pluginRefs.marketplace).length) deps.push(`依赖 Marketplace 插件安装（${Object.keys(pluginRefs.marketplace).length} 个市场插件类）`);
  if (Object.keys(pluginRefs.custom).length) deps.push(`依赖自研插件部署（${Object.keys(pluginRefs.custom).length} 个自定义类）`);

  return {
    _doc: '分析补充配置：把 status 改为 provided 并填写来源后重跑分析，结果将并入 app_summary.json',
    custom_plugins: plugins,
    external_datasources: ds,
    custom_tables: customTables,
    deployment_dependencies: deps,
    server_side_exports: {
      _doc: '.jwa 不含服务器端配置，完整设计书需另行导出',
      users_groups: { status: 'missing', note: '用户/组/组织（userview 权限规则只存 UUID）' },
      permission_matrix: { status: 'missing', note: '菜单/表单/数据的权限分配' },
      environment_variables: { status: 'missing', note: '#envVariable.x# 引用的变量清单' },
      email_settings: { status: 'missing', note: '邮件工具/通知的 SMTP 配置' },
      schedulers: { status: 'missing', note: '定时任务（Deadline/调度器插件）' },
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

/* ---------- 表间关系推断 ---------- */

/**
 * 由表单定义推导物理表模型。
 *
 * 为什么需要它：.jwa 里的 data/*.json 只有在导出时勾选了「包含数据」才存在。
 * 早先 ER 图 / 表间关系只看 data/，导致「导出时没勾选数据」的应用 ER 图是空的 ——
 * 但物理表本来就存在：表单的 tableName 决定表名 app_fd_<tableName>，
 * 字段决定列名 c_<fieldId>。所以表模型必须以表单定义为基准，data/ 只用于叠加实际样例列。
 */

/** Joget 里纯布局控件，不落库、不产生 c_ 列 */
const NO_COLUMN_TYPES = new Set([
  'Section', 'Column', 'Label', 'Html', 'CustomHTML', 'Button',
  'Grid', 'SubForm', 'Form', 'Page', 'PopupDialog', 'Tab', 'Tabs',
]);

/** Joget 内置审计列，每张 app_fd_* 表都有 */
const AUDIT_COLS = ['id', 'dateCreated', 'dateModified', 'createdBy', 'modifiedBy'];

function buildTableModel(app, data) {
  const model = {};

  // 1) 表单定义 → 物理表与列（不依赖样例数据）
  for (const f of app.forms || []) {
    if (!f.tableName) continue; // 没绑表的表单（纯展示/只读）不产生物理表
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

  // 2) 补审计列
  for (const m of Object.values(model)) {
    for (const c of AUDIT_COLS) if (!m.all_fields.includes(c)) m.all_fields.push(c);
  }

  // 3) 叠加 data/ 里出现的额外表与额外列（例如非表单表、手工建的表）
  //    注意：data/*.json 的文件名不带 app_fd_ 前缀（srm_rfq），必须归一化，
  //    否则同一张表会以 srm_rfq 与 app_fd_srm_rfq 两个身份并存，ER 图里出现重复实体。
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

/* ---------- 主流程 ---------- */

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
  if (!fs.existsSync(appdefPath)) throw new Error(`未找到 appDefinition.xml: ${base}`);
  const appdefXml = fs.readFileSync(appdefPath, 'utf8');

  const { app, doc } = parseAppDefinition(appdefXml);
  const xpdlPath = path.join(base, 'package.xpdl');
  const xpdl = parseXpdl(fs.existsSync(xpdlPath) ? fs.readFileSync(xpdlPath, 'utf8') : '');
  const data = parseData(base);

  const sqlEffects = extractSqlEffects(doc);
  const impact = buildImpact(app, sqlEffects, data);
  // 表模型以表单定义为基准（.jwa 未必导出样例数据），data/ 只用于叠加实际列
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
    sql_effects: sqlEffects, impact,
    plugin_refs: pluginRefs, plugin_usages: pluginUsages, datasources,
    sql_tables: unknownTables,
  };
  enrichWithInputs(summary, inputs);

  fs.writeFileSync(path.join(outDir, 'app_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  const stats = {
    forms: app.forms.length, datalists: app.datalists.length,
    menus: app.userviews.reduce((n, uv) => n + uv.categories.reduce((m, c) => m + c.menus.length, 0), 0),
    processes: xpdl.processes.length,
    // 表数以表模型为准（由表单定义推导），不因导出时没带样例数据而显示 0
    tables: Object.keys(tableModel).length,
    tablesWithData: Object.keys(data).length,
    sqlEffects: sqlEffects.length,
    plugins: {
      builtin: Object.keys(pluginRefs.builtin).length,
      marketplace: Object.keys(pluginRefs.marketplace).length,
      enterprise: Object.keys(pluginRefs.enterprise).length,
      custom: Object.keys(pluginRefs.custom).length,
    },
    writeTables: Object.keys(impact.writeMap).length,
    readTables: Object.keys(impact.readMap).length,
    issues: impact.issues.length,
    baseDir: base,
    assetsSkipped: unzipStat ? unzipStat.skipped.length : 0,
    renamed: unzipStat ? unzipStat.renamed.length : 0,
  };
  return { summary, stats, baseDir: base, outDir, unzip: unzipStat };
}

module.exports = {
  unzipTo, stripComments, parseXml, findAll, txt, parseJsonField, extractFields,
  parseAppDefinition, parseXpdl, parseData, extractSqlEffects, buildImpact,
  scanPluginRefs, scanDatasources, scanSqlTables, buildAnalysisInputs,
  enrichWithInputs, inferRelations, analyze, extractPluginUsages,
};
