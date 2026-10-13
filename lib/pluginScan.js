/**
 * lib/pluginScan.js — Joget プラグインソースのスキャン（SOP 補足入力）+ 呼び出し関係図
 *
 * 入力: プラグインプロジェクトのディレクトリ（pom.xml + src/main/java + src/main/resources/properties）
 * 出力: plugin_manifest.json
 *   - pom の座標
 *   - components: コンポーネントクラス + 設定項目の定義（properties/*.json 由来）
 *   - call_graph: クラス単位の呼び出し関係（nodes/edges）。フロントのグラフ可視化用
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const JDK_PREFIXES = ['java.', 'javax.', 'sun.', 'com.sun.'];

function walkFiles(dir, filter, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, filter, acc);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

function scanPom(base) {
  const pom = path.join(base, 'pom.xml');
  if (!fs.existsSync(pom)) return {};
  try {
    const doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(fs.readFileSync(pom, 'utf8'));
    const proj = (doc.project) || {};
    const one = (v) => (typeof v === 'object' && v ? v['#text'] : v) || '';
    const deps = [];
    const rawDeps = (proj.dependencies && proj.dependencies.dependency) || [];
    for (const d of (Array.isArray(rawDeps) ? rawDeps : [rawDeps])) {
      deps.push({ groupId: one(d.groupId), artifactId: one(d.artifactId), version: one(d.version) });
    }
    return {
      groupId: one(proj.groupId) || one(proj.parent && proj.parent.groupId),
      artifactId: one(proj.artifactId),
      version: one(proj.version) || one(proj.parent && proj.parent.version),
      name: one(proj.name),
      dependencies: deps,
    };
  } catch (e) {
    return {};
  }
}

function scanJavaSources(base) {
  const root = path.join(base, 'src/main/java');
  const classes = [];
  for (const file of walkFiles(root, (p) => p.endsWith('.java'))) {
    const text = fs.readFileSync(file, 'utf8');
    const pkg = (text.match(/package\s+([\w.]+)\s*;/ ) || [])[1] || '';
    const rel = path.relative(base, file);
    const declarations = [...text.matchAll(/public\s+(?:final\s+|abstract\s+)?(?:class|interface|enum)\s+(\w+)/g)];
    const methods = [...text.matchAll(/(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\],.\s?]+\s+(\w+)\s*\(/g)]
      .map((m) => m[1]).filter((x) => x && x !== 'if' && x !== 'for' && x !== 'while' && x !== 'switch');
    // コードが実際に読み取る設定項目：getProperty("x") / getPropertyString("x") / getPropertyBoolean("x") …
    const readKeys = Array.from(new Set(
      [...text.matchAll(/getProperty(?:String|Boolean|Int|Integer|Long|Double|BigDecimal)?\s*\(\s*"([\w.\-]+)"\s*\)/g)]
        .map((m) => m[1])
    ));
    for (const d of declarations) {
      classes.push({
        fqcn: pkg ? `${pkg}.${d[1]}` : d[1],
        simple: d[1],
        package: pkg,
        file: rel,
        methods: Array.from(new Set(methods)),
        readKeys,
        imports: [...text.matchAll(/^import\s+(?:static\s+)?([\w.]+)\s*;/gm)].map((m) => m[1]),
        text,
      });
    }
  }
  return classes;
}

/** クラス単位の呼び出し関係を抽出：コンストラクタ呼び出し / 静的参照 / 型参照 */
function buildCallGraph(classes) {
  const bySimple = {};
  classes.forEach((c) => { bySimple[c.simple] = c; });

  const nodes = classes.map((c) => ({
    id: c.simple,
    fqcn: c.fqcn,
    package: c.package,
    file: c.file,
    methodCount: c.methods.length,
    methods: c.methods,
    kind: /(^|\.)util\./.test(c.fqcn) || /Util$/.test(c.simple) ? 'util'
      : /Activator$/.test(c.simple) ? 'activator' : 'component',
  }));

  const edges = {};
  const external = {};
  for (const c of classes) {
    const body = c.text;
    const localMap = {};
    for (const imp of c.imports) {
      const simple = imp.split('.').pop();
      localMap[simple] = imp;
    }
    classes.forEach((o) => {
      if (o.package === c.package) localMap[o.simple] = o.fqcn;
    });

    // package/import 行を除いた本文のみを対象に参照を数え、誤検出を抑える
    const code = body.replace(/^\s*(package|import)\s+[\w.*]+\s*;\s*$/gm, '');
    for (const [simple, fqcn] of Object.entries(localMap)) {
      if (simple === c.simple) continue;
      const reAll = new RegExp(`\\b${simple}\\b`, 'g');
      const count = (code.match(reAll) || []).length;
      if (!count) continue;
      const isNew = new RegExp(`\\bnew\\s+${simple}\\s*\\(`).test(code);
      const isStatic = new RegExp(`\\b${simple}\\.`).test(code);
      const key = `${c.simple}->${simple}`;
      const kind = isNew ? 'new' : isStatic ? 'static' : 'type';
      if (bySimple[simple]) {
        if (!edges[key] || count > edges[key].weight) {
          edges[key] = { from: c.simple, to: simple, weight: count, kind };
        }
      } else {
        // 外部依存（JDK / サードパーティ）：トップレベルパッケージ単位で集約
        const top = fqcn.split('.').slice(0, 2).join('.');
        if (!JDK_PREFIXES.some((p) => fqcn.startsWith(p))) {
          external[top] = (external[top] || 0) + count;
        }
      }
    }
  }

  const extNodes = Object.entries(external)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, weight]) => ({ id, kind: 'external', weight }));

  return { nodes: nodes.concat(extNodes), edges: Object.values(edges).sort((a, b) => b.weight - a.weight) };
}

/** @@i18n.key@@ プレースホルダを messages 内の可読な文言に置換する */
function resolveLabels(text, messages) {
  if (typeof text !== 'string' || !text.includes('@@')) return text || '';
  return text.replace(/@@([\w.$-]+)@@/g, (m, key) => messages[key] || m);
}

function scanProperties(base, messages = {}) {
  const dirs = [
    path.join(base, 'src/main/resources/properties'),
    path.join(base, 'src/main/resources'),
  ];
  const out = {};
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of walkFiles(dir, (p) => p.endsWith('.json'))) {
      if (out[path.basename(f, '.json')]) continue;
      let d;
      try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
      const raw = [];
      const collect = (arr) => arr.forEach((s) => {
        if (!s || typeof s !== 'object') return;
        if (typeof s.title === 'string') raw.push({ __groupTitle: resolveLabels(s.title, messages) });
        if (Array.isArray(s.properties)) raw.push(...s.properties);
      });
      if (Array.isArray(d)) collect(d);
      else if (d && Array.isArray(d.properties)) collect(d);
      else if (d && typeof d === 'object') collect([d]);

      const properties = raw.filter((p) => p && typeof p === 'object' && p.name).map((p) => ({
        name: p.name,
        label: resolveLabels(p.label, messages) || p.name,
        type: p.type || '',
        required: String(p.required || '').toLowerCase() === 'true',
        defaultValue: p.value === undefined ? null : String(p.value),
        // 連動条件：control_field=true のときのみ表示／有効化される
        showWhen: p.control_field ? { field: p.control_field, value: String(p.control_value ?? '') } : null,
        options: Array.isArray(p.options)
          ? p.options.slice(0, 30).map((o) => ({ value: String(o.value ?? ''), label: resolveLabels(o.label, messages) }))
          : [],
      }));
      out[path.basename(f, '.json')] = {
        file: path.basename(f),
        properties,
        propertyNames: properties.map((p) => p.name),
        groupTitles: raw.filter((r) => r.__groupTitle).map((r) => r.__groupTitle),
      };
    }
  }
  return out;
}

function scanMessages(base) {
  const dir = path.join(base, 'src/main/resources/messages');
  const keys = {};
  for (const f of walkFiles(dir, (p) => p.endsWith('.properties'))) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (line.includes('=') && !line.trim().startsWith('#')) {
        const i = line.indexOf('=');
        keys[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
  }
  return keys;
}

/**
 * Maven プロジェクトのルートを検出する：アップロードされたソース zip は最上位に
 * ディレクトリを 1 段持つことが多い（さらにマルチモジュールのこともある）。
 * ここでは下位へ掘り進み、pom.xml または src/ を含む階層を見つける。
 */
function detectRoots(base) {
  let cur = path.resolve(base);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(cur, 'pom.xml')) || fs.existsSync(path.join(cur, 'src'))) break;
    let dirs = [];
    try {
      dirs = fs.readdirSync(cur, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.'));
    } catch (e) {
      break;
    }
    if (!dirs.length) break;
    const pick =
      dirs.find((d) => fs.existsSync(path.join(cur, d.name, 'pom.xml'))) ||
      dirs.find((d) => fs.existsSync(path.join(cur, d.name, 'src'))) ||
      (dirs.length === 1 ? dirs[0] : null);
    if (!pick) break;
    cur = path.join(cur, pick.name);
  }

  // マルチモジュール：pom.xml を含む直接の子モジュールもすべて対象に含める
  const roots = [cur];
  try {
    for (const d of fs.readdirSync(cur, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name === 'target') continue;
      const sub = path.join(cur, d.name);
      if (fs.existsSync(path.join(sub, 'pom.xml')) || fs.existsSync(path.join(sub, 'src'))) roots.push(sub);
    }
  } catch (e) { /* ignore */ }
  return roots;
}

function scanPluginSource(base) {
  const roots = detectRoots(base);
  const root = roots[0];

  const poms = roots.map((r) => scanPom(r)).filter((p) => p && p.artifactId);
  const classes = [];
  const messages = {};
  for (const r of roots) Object.assign(messages, scanMessages(r));
  const propertyDefs = {};
  for (const r of roots) Object.assign(propertyDefs, scanProperties(r, messages));
  for (const r of roots) classes.push(...scanJavaSources(r));
  const pom = poms[0] || {};

  const components = classes
    .filter((c) => !/Activator$/.test(c.simple) && !/(^|\.)util\./.test(c.fqcn))
    .map((c) => {
      const key = Object.keys(propertyDefs).find(
        (k) => k.toLowerCase().replace(/_/g, '') === c.simple.toLowerCase()
      );
      return {
        class: c.fqcn,
        file: c.file,
        methodCount: c.methods.length,
        methods: c.methods,
        readKeys: c.readKeys || [],
        propertiesDef: key || null,
        configProperties: key ? propertyDefs[key].properties : [],
        propertyNames: key ? propertyDefs[key].propertyNames : [],
        configGroups: key ? propertyDefs[key].groupTitles : [],
      };
    });

  return {
    sourceDir: root,
    baseDir: base,
    roots,
    modules: poms.map((p) => `${p.groupId}:${p.artifactId}:${p.version}`),
    generatedAt: new Date().toISOString(),
    pom,
    poms,
    components,
    utilities: classes.filter((c) => /(^|\.)util\./.test(c.fqcn) || /Util$/.test(c.simple))
      .map((c) => ({ class: c.fqcn, file: c.file, methodCount: c.methods.length, methods: c.methods, readKeys: c.readKeys || [] })),
    activators: classes.filter((c) => /Activator$/.test(c.simple))
      .map((c) => ({ class: c.fqcn, file: c.file, methodCount: c.methods.length, methods: c.methods, readKeys: c.readKeys || [] })),
    propertyDefs,
    messages,
    callGraph: buildCallGraph(classes),
  };
}

module.exports = { scanPluginSource, buildCallGraph, scanPom, scanJavaSources, detectRoots };
