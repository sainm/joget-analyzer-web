'use strict';

/**
 * Joget 应用分析 Web 工具 — 后端服务
 *
 * 输入有两种方式（首选第一种）：
 *   1) 指向本机工程目录 —— 工具自动识别目录里的 .jwa（应用）与 Maven 源码（插件）
 *   2) 上传文件 —— .jwa 应用包（+ 可选的插件源码压缩包）
 *
 * 事实靠解析（本服务，纯 Node.js），语义交 AI（本轮暂不接入）。
 *
 * 路由：
 *   POST /api/analyze-project              以本机路径为输入，执行全链路分析
 *   POST /api/analyze                      以文件上传为输入（.jwa / 插件 zip）
 *   GET  /api/fs/list?path=                浏览本机目录（供目录选择器）
 *   GET  /api/fs/discover?path=            预检：该路径里有什么（.jwa / Maven 工程）
 *   GET  /api/runs                         历史分析列表
 *   GET  /api/runs/:id                     读取某次分析结果
 *   GET  /api/runs/:id/download/:name      下载产物
 *   GET  /api/health                       健康检查
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const multer = require('multer');

const { analyze, unzipTo } = require('./lib/analyze');
const { scanPluginSource } = require('./lib/pluginScan');
const { buildChunks, toJsonl } = require('./lib/ragChunks');
const { generateDesignDoc } = require('./lib/designDoc');
const { correlate } = require('./lib/correlate');
const { discoverProject, listDir } = require('./lib/project');
const { msg } = require('./lib/msg');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data', 'runs');
const DIST_DIR = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 3000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/** 从请求里取界面语言：body.lang / query.lang 均可，非 'ja' 一律回落中文 */
const reqLang = (req) => {
  const v = (req.body && req.body.lang) || (req.query && req.query.lang);
  return v === 'ja' ? 'ja' : 'zh';
};

const app = express();
app.use(express.json({ limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const runDir = (id) => path.join(DATA_DIR, id);

function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir(id), 'meta.json'), 'utf8')); } catch (e) { return null; }
}
function writeMeta(id, meta) {
  fs.writeFileSync(path.join(runDir(id), 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function readText(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
function fileSize(dir, name) { try { return fs.statSync(path.join(dir, name)).size; } catch (e) { return 0; } }

function chunkStats(chunks) {
  const byType = {};
  let total = 0;
  for (const c of chunks || []) {
    byType[c.type] = (byType[c.type] || 0) + 1;
    total += c.chars || 0;
  }
  return { count: (chunks || []).length, byType, totalChars: total };
}

/** 目录里没有 .jwa 时，用占位 summary 让下游（设计书 / RAG）仍能工作 */
function emptySummary(name) {
  return {
    generatedAt: new Date().toISOString(),
    noApp: true,
    app: { appId: '', name, version: '', package: '', dateCreated: '', dateModified: '', forms: [], datalists: [], userviews: [], activityFormMap: [] },
    xpdl: { name: '', created: '', processes: [] },
    data: {}, tableModel: {}, relations: [], sql_effects: [],
    impact: { writeMap: {}, readMap: {}, issues: [] },
    plugin_refs: { builtin: {}, marketplace: {}, enterprise: {}, custom: {} },
    datasources: [], sql_tables: {},
  };
}

const EMPTY_STATS = {
  forms: 0, datalists: 0, menus: 0, processes: 0, tables: 0, sqlEffects: 0,
  plugins: { builtin: 0, marketplace: 0, enterprise: 0, custom: 0 },
  writeTables: 0, readTables: 0, issues: 0, assetsSkipped: 0, renamed: 0,
};

/**
 * 公共收尾：设计书 + RAG 分块 + 落盘 + 组装响应
 */
function finalize({ id, rd, outDir, summary, stats, manifest, startedAt, extraMeta = {}, extraResp = {} }) {
  // 应用配置 ↔ 插件源码 联动比对
  const correlation = correlate(summary, manifest);
  fs.writeFileSync(path.join(outDir, 'correlation.json'), JSON.stringify(correlation, null, 2), 'utf8');

  const docZh = generateDesignDoc(summary, 'zh', { correlation, manifest });
  const docJa = generateDesignDoc(summary, 'ja', { correlation, manifest });
  fs.writeFileSync(path.join(outDir, 'design_doc_zh.md'), docZh, 'utf8');
  fs.writeFileSync(path.join(outDir, 'design_doc_ja.md'), docJa, 'utf8');

  const chunks = buildChunks(summary, manifest, correlation);
  fs.writeFileSync(path.join(outDir, 'rag_chunks.jsonl'), toJsonl(chunks), 'utf8');

  const meta = {
    id,
    appName: summary.app && summary.app.name,
    appId: summary.app && summary.app.appId,
    createdAt: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    stats,
    correlationStats: correlation.stats,
    ...extraMeta,
  };
  writeMeta(id, meta);

  return {
    meta,
    stats,
    summary,
    manifest,
    correlation,
    designDoc: { zh: docZh, ja: docJa },
    chunks,
    chunkStats: chunkStats(chunks),
    artifacts: [
      { name: 'app_summary.json', label: '应用摘要 JSON', size: fileSize(outDir, 'app_summary.json') },
      { name: 'analysis_inputs.json', label: '缺口模板 JSON', size: fileSize(outDir, 'analysis_inputs.json') },
      { name: 'design_doc_zh.md', label: '设计书（中文）', size: fileSize(outDir, 'design_doc_zh.md') },
      { name: 'design_doc_ja.md', label: '設計書（日本語）', size: fileSize(outDir, 'design_doc_ja.md') },
      { name: 'rag_chunks.jsonl', label: 'RAG 分块 JSONL', size: fileSize(outDir, 'rag_chunks.jsonl') },
      ...(manifest && !manifest.error
        ? [
            { name: 'plugin_manifest.json', label: '插件清单 JSON', size: fileSize(outDir, 'plugin_manifest.json') },
            { name: 'correlation.json', label: '应用↔源码联动 JSON', size: fileSize(outDir, 'correlation.json') },
          ]
        : []),
    ],
    ...extraResp,
  };
}

/* ── 入口 1：本机工程目录 ────────────────────────────────────────────── */

app.post('/api/analyze-project', (req, res) => {
  const startedAt = Date.now();
  try {
    const raw = (req.body && req.body.path) || '';
    const lang = (req.body && req.body.lang) === 'ja' ? 'ja' : 'zh';
    if (!raw.trim()) return res.status(400).json({ error: msg(lang, 'needPath') });

    const proj = discoverProject(raw, lang);
    if (proj.kind === 'missing' || proj.kind === 'invalid') return res.status(400).json({ error: proj.error });
    if (proj.kind === 'file' && !proj.jwaFiles.length) return res.status(400).json({ error: proj.error || msg(lang, 'notJwaFile') });
    // 多工程并存时不擅自挑一个，避免把不同工程的文件混在一起
    if (proj.ambiguous) {
      return res.status(400).json({
        error: msg(lang, 'ambiguousProjects', {
          n: proj.projects.length,
          list: proj.projects.map((g) => g.root).join(' / '),
        }),
        ambiguous: true,
        projects: proj.projects.map((g) => ({ root: g.root, jwaFiles: g.jwaFiles.map((j) => j.rel), mavenRoot: g.mavenRoot })),
      });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rd = runDir(id);
    const outDir = path.join(rd, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    // 1) 应用：只取「选定工程」范围内的 .jwa，绝不跨工程取
    const scopedJwa = (proj.chosen ? proj.chosen.jwaFiles : proj.jwaFiles) || [];
    let summary;
    let stats;
    let appSource = null;
    const chosen = scopedJwa.length ? scopedJwa[0] : null;
    if (chosen) {
      const r = analyze(chosen.path, outDir);
      summary = r.summary;
      stats = r.stats;
      appSource = {
        path: chosen.path,
        rel: chosen.rel,
        size: chosen.size,
        totalFound: scopedJwa.length,
        totalInTree: proj.jwaFiles.length,
      };
      fs.writeFileSync(path.join(rd, 'chosen-jwa.txt'), chosen.path, 'utf8');
    } else {
      summary = emptySummary(proj.name);
      stats = { ...EMPTY_STATS };
      fs.writeFileSync(path.join(outDir, 'app_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    }

    // 2) 插件源码：只取「选定工程」的 Maven 根
    let manifest = null;
    let pluginSource = null;
    if (proj.maven) {
      try {
        manifest = scanPluginSource(proj.maven.root);
        fs.writeFileSync(path.join(outDir, 'plugin_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        pluginSource = { root: proj.maven.root, roots: proj.maven.roots, javaFiles: proj.maven.javaFiles };
      } catch (e) {
        manifest = { error: String((e && e.message) || e) };
      }
    }

    res.json(
      finalize({
        id, rd, outDir, summary, stats, manifest, startedAt,
        extraMeta: {
          source: 'local',
          requestedLang: lang,
          inputPath: proj.root,
          projectRoot: proj.chosen ? proj.chosen.root : proj.root,
          jwaName: appSource ? appSource.rel : null,
          pluginName: pluginSource ? path.basename(pluginSource.root) : null,
        },
        extraResp: {
          project: {
            root: proj.root,
            kind: proj.kind,
            projectRoot: proj.chosen ? proj.chosen.root : proj.root,
            // 只回传选定工程范围内的文件，避免前端展示时混入其他工程
            jwaFiles: scopedJwa.map((j) => ({ rel: j.rel, size: j.size })),
            mavenRoots: proj.chosen && proj.chosen.mavenRoot ? [proj.chosen.mavenRoot] : [],
            otherProjects: proj.projects.filter((g) => !proj.chosen || g.root !== proj.chosen.root).map((g) => g.root),
          },
          appSource,
          pluginSource,
        },
      })
    );
  } catch (err) {
    console.error('[analyze-project] 失败：', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

/* ── 入口 2：文件上传 ───────────────────────────────────────────────── */

app.post(
  '/api/analyze',
  upload.fields([{ name: 'jwa', maxCount: 1 }, { name: 'plugin', maxCount: 5 }]),
  (req, res) => {
    const startedAt = Date.now();
    try {
      const jwaFile = req.files && req.files.jwa && req.files.jwa[0];
      const lang = (req.body && req.body.lang) === 'ja' ? 'ja' : 'zh';
      if (!jwaFile) return res.status(400).json({ error: msg(lang, 'needJwaUpload') });

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const rd = runDir(id);
      const inputDir = path.join(rd, 'input');
      const outDir = path.join(rd, 'out');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });

      const jwaPath = path.join(inputDir, jwaFile.originalname || 'app.jwa');
      fs.writeFileSync(jwaPath, jwaFile.buffer);

      const { summary, stats, baseDir } = analyze(jwaPath, outDir);

      let manifest = null;
      const pluginFiles = (req.files && req.files.plugin) || [];
      if (pluginFiles.length) {
        const pluginDir = path.join(rd, 'plugin');
        fs.mkdirSync(pluginDir, { recursive: true });
        let srcRoot = pluginDir;
        for (const pf of pluginFiles) {
          const name = pf.originalname || 'plugin.bin';
          const dest = path.join(pluginDir, name);
          fs.writeFileSync(dest, pf.buffer);
          if (/\.zip$/i.test(name)) {
            const target = path.join(pluginDir, name.replace(/\.zip$/i, ''));
            unzipTo(dest, target);
            srcRoot = target;
          } else {
            srcRoot = dest;
          }
        }
        try {
          manifest = scanPluginSource(srcRoot);
          fs.writeFileSync(path.join(outDir, 'plugin_manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        } catch (e) {
          manifest = { error: String((e && e.message) || e) };
        }
      }

      res.json(
        finalize({
          id, rd, outDir, summary, stats, manifest, startedAt,
          extraMeta: {
            source: 'upload',
            jwaName: jwaFile.originalname,
            pluginName: pluginFiles.length ? pluginFiles.map((f) => f.originalname).join(', ') : null,
            baseDir,
          },
        })
      );
    } catch (err) {
      console.error('[analyze] 失败：', err);
      res.status(500).json({ error: String((err && err.message) || err) });
    }
  }
);

/* ── 本机文件系统浏览 / 预检 ────────────────────────────────────────── */

app.get('/api/fs/list', (req, res) => {
  // 未指定路径时从用户主目录开始 —— 不默认到工具自身目录，避免把工具自己的文件当成被分析对象
  const fallback = process.env.JOGET_ANALYZER_BROWSE_ROOT || os.homedir();
  res.json(listDir(req.query.path || fallback, reqLang(req)));
});

app.get('/api/fs/discover', (req, res) => {
  const lang = reqLang(req);
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: msg(lang, 'needPathParam') });
  const proj = discoverProject(p, lang);
  res.json(proj);
});

/* ── 结果读取 ─────────────────────────────────────────────────────── */

app.get('/api/runs', (_req, res) => {
  let ids = [];
  try {
    ids = fs.readdirSync(DATA_DIR).filter((d) => {
      try { return fs.statSync(path.join(DATA_DIR, d)).isDirectory(); } catch (e) { return false; }
    });
  } catch (e) { /* ignore */ }
  const runs = ids.map(readMeta).filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ runs });
});

app.get('/api/runs/:id', (req, res) => {
  const rd = runDir(req.params.id);
  if (!fs.existsSync(rd)) return res.status(404).json({ error: 'run not found' });
  const meta = readMeta(req.params.id);
  const outDir = path.join(rd, 'out');
  const summary = readJson(path.join(outDir, 'app_summary.json'));
  const manifest = readJson(path.join(outDir, 'plugin_manifest.json'));
  const correlation = readJson(path.join(outDir, 'correlation.json'));
  let chunks = [];
  const jsonlPath = path.join(outDir, 'rag_chunks.jsonl');
  if (fs.existsSync(jsonlPath)) {
    chunks = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  }
  const designZh = readText(path.join(outDir, 'design_doc_zh.md'));
  const designJa = readText(path.join(outDir, 'design_doc_ja.md'));
  const chosenJwa = readText(path.join(rd, 'chosen-jwa.txt')).trim();
  res.json({
    meta,
    stats: meta && meta.stats,
    summary,
    manifest,
    correlation,
    designDoc: { zh: designZh, ja: designJa },
    chunks,
    chunkStats: chunkStats(chunks),
    project: chosenJwa ? { root: meta && meta.inputPath, jwaFiles: [{ rel: path.basename(chosenJwa) }] } : null,
  });
});

app.get('/api/runs/:id/download/:name', (req, res) => {
  const safe = path.basename(req.params.name);
  const p = path.join(runDir(req.params.id), 'out', safe);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'file not found' });
  const ext = path.extname(safe).toLowerCase();
  const type = ext === '.json' ? 'application/json'
    : ext === '.jsonl' ? 'application/x-ndjson'
    : 'text/markdown';
  res.setHeader('Content-Type', `${type}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  fs.createReadStream(p).pipe(res);
});

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ── 静态前端 ─────────────────────────────────────────────────────── */

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).type('html').send(
      '<h1>Joget Analyzer API 已启动</h1>' +
      '<p>前端尚未构建。开发模式请另开终端运行 <code>npm run dev</code>（Vite，5173）。</p>' +
      '<p>生产模式请运行 <code>npm run build</code> 后再访问本端口。</p>'
    );
  });
}

app.listen(PORT, () => {
  console.log(`\n  Joget 分析服务已启动`);
  console.log(`  → http://localhost:${PORT}\n`);
});
