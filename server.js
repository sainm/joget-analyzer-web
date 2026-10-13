'use strict';

/**
 * Joget アプリ解析 Web ツール — バックエンドサービス
 *
 * 入力は 2 通り（通常は 1 を推奨）：
 *   1) ローカルプロジェクトディレクトリを指定 —— ディレクトリ内の .jwa（アプリ）と
 *      Maven ソース（プラグイン）を自動認識する
 *   2) ファイルをアップロード —— .jwa アプリパッケージ（+ 任意でプラグインソースの zip）
 *
 * 事実は解析で（本サービス、純 Node.js）、意味づけは AI で（本フェーズでは未接続）。
 *
 * ルーティング：
 *   POST /api/analyze-project              ローカルパスを入力として全工程を解析
 *   POST /api/analyze                      ファイルアップロードを入力として解析（.jwa / プラグイン zip）
 *   GET  /api/fs/list?path=                ローカルディレクトリの一覧（ディレクトリ選択用）
 *   GET  /api/fs/discover?path=            事前確認：そのパスに何があるか（.jwa / Maven プロジェクト）
 *   GET  /api/runs                         解析履歴の一覧
 *   GET  /api/runs/:id                     ある解析結果の読み出し
 *   GET  /api/runs/:id/download/:name      成果物のダウンロード
 *   GET  /api/health                       ヘルスチェック
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

/** ディレクトリに .jwa がない場合、下流（設計書 / RAG）が動くようプレースホルダの summary を返す */
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
 * 共通の締め処理：設計書 + RAG チャンク + 永続化 + レスポンス組み立て
 */
function finalize({ id, rd, outDir, summary, stats, manifest, startedAt, extraMeta = {}, extraResp = {} }) {
  // アプリ設定 ↔ プラグインソース の突合
  const correlation = correlate(summary, manifest);
  fs.writeFileSync(path.join(outDir, 'correlation.json'), JSON.stringify(correlation, null, 2), 'utf8');

  const doc = generateDesignDoc(summary, { correlation, manifest });
  fs.writeFileSync(path.join(outDir, 'design_doc.md'), doc, 'utf8');

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
    designDoc: doc,
    chunks,
    chunkStats: chunkStats(chunks),
    artifacts: [
      { name: 'app_summary.json', label: 'アプリ概要 JSON', size: fileSize(outDir, 'app_summary.json') },
      { name: 'analysis_inputs.json', label: '不足項目テンプレート JSON', size: fileSize(outDir, 'analysis_inputs.json') },
      { name: 'design_doc.md', label: '設計書', size: fileSize(outDir, 'design_doc.md') },
      { name: 'rag_chunks.jsonl', label: 'RAG チャンク JSONL', size: fileSize(outDir, 'rag_chunks.jsonl') },
      ...(manifest && !manifest.error
        ? [
            { name: 'plugin_manifest.json', label: 'プラグイン一覧 JSON', size: fileSize(outDir, 'plugin_manifest.json') },
            { name: 'correlation.json', label: 'アプリ↔ソース突合 JSON', size: fileSize(outDir, 'correlation.json') },
          ]
        : []),
    ],
    ...extraResp,
  };
}

/* ── 入口 1：ローカルプロジェクトディレクトリ ──────────────────────── */

app.post('/api/analyze-project', (req, res) => {
  const startedAt = Date.now();
  try {
    const raw = (req.body && req.body.path) || '';
    if (!raw.trim()) return res.status(400).json({ error: msg('needPath') });

    const proj = discoverProject(raw);
    if (proj.kind === 'missing' || proj.kind === 'invalid') return res.status(400).json({ error: proj.error });
    if (proj.kind === 'file' && !proj.jwaFiles.length) return res.status(400).json({ error: proj.error || msg('notJwaFile') });
    // 複数プロジェクトの併存時は勝手に 1 つを選ばない（プロジェクト間の混在を防ぐ）
    if (proj.ambiguous) {
      return res.status(400).json({
        error: msg('ambiguousProjects', {
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

    // 1) アプリ：「選択したプロジェクト」範囲の .jwa のみを対象とし、決して別プロジェクトから取らない
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

    // 2) プラグインソース：「選択したプロジェクト」の Maven ルートのみを対象とする
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
            // 選択したプロジェクト範囲のファイルのみを返し、他プロジェクトが画面に混ざらないようにする
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
    console.error('[analyze-project] 失敗：', err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
});

/* ── 入口 2：ファイルアップロード ──────────────────────────────────── */

app.post(
  '/api/analyze',
  upload.fields([{ name: 'jwa', maxCount: 1 }, { name: 'plugin', maxCount: 5 }]),
  (req, res) => {
    const startedAt = Date.now();
    try {
      const jwaFile = req.files && req.files.jwa && req.files.jwa[0];
      if (!jwaFile) return res.status(400).json({ error: msg('needJwaUpload') });

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
      console.error('[analyze] 失敗：', err);
      res.status(500).json({ error: String((err && err.message) || err) });
    }
  }
);

/* ── ローカルファイルシステムの閲覧 / 事前確認 ────────────────────── */

app.get('/api/fs/list', (req, res) => {
  // パス未指定時はユーザーのホームディレクトリから開始する —— ツール自身のディレクトリを
  // 既定にすると、ツール自身のファイルを解析対象と誤認するため
  const fallback = process.env.JOGET_ANALYZER_BROWSE_ROOT || os.homedir();
  res.json(listDir(req.query.path || fallback));
});

app.get('/api/fs/discover', (req, res) => {
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: msg('needPathParam') });
  const proj = discoverProject(p);
  res.json(proj);
});

/* ── 結果の読み出し ───────────────────────────────────────────────── */

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
  const designDoc = readText(path.join(outDir, 'design_doc.md'));
  const chosenJwa = readText(path.join(rd, 'chosen-jwa.txt')).trim();
  res.json({
    meta,
    stats: meta && meta.stats,
    summary,
    manifest,
    correlation,
    designDoc,
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

/* ── 静的フロントエンド ───────────────────────────────────────────── */

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).type('html').send(
      '<h1>Joget Analyzer API 起動中</h1>' +
      '<p>フロントエンドは未ビルドです。開発モードでは別ターミナルで <code>npm run dev</code>（Vite、5173）を実行してください。</p>' +
      '<p>本番モードでは <code>npm run build</code> を実行してから本ポートにアクセスしてください。</p>'
    );
  });
}

app.listen(PORT, () => {
  console.log(`\n  Joget 解析サービスを起動しました`);
  console.log(`  → http://localhost:${PORT}\n`);
});
