/**
 * lib/project.js — 工程目录发现
 *
 * 一个「Joget 工程」通常长这样（例如 enhanced-json-api-main/）：
 *   pom.xml                      ← Maven 坐标
 *   src/main/java/...            ← 插件与工具类源码
 *   src/main/resources/properties/*.json  ← 组件配置项定义
 *   src/main/resources/messages/*.properties ← i18n
 *   APP_XXX-1-2024....jwa        ← 随工程附带的样例应用包
 *
 * 所以入口不该是「上传一个 .jwa」，而应是「指向一个目录」，由工具自己识别里面有什么。
 */

const fs = require('fs');
const path = require('path');
const { msg } = require('./msg.js');

/**
 * 工具自身的根目录 —— 永远不参与扫描。
 *
 * 为什么必须排除：工具自己就住在工作区里，而且 data/ 下可能留有测试用的样例包。
 * 如果用户指向的是工作区父目录，不排除的话就会把「工具自己的文件」当成被分析工程的一部分，
 * 与其他项目的文件混在一起。这是一条硬约束，不是优化。
 */
const ANALYZER_ROOT = path.resolve(__dirname, '..');

/** 目标路径是否落在工具自身目录内（等于或在其下） */
function isInsideAnalyzer(p) {
  const r = path.resolve(p);
  return r === ANALYZER_ROOT || r.startsWith(ANALYZER_ROOT + path.sep);
}

/** 该目录是否应跳过：工具自身 + 常规忽略目录 */
function shouldSkipDir(name, full) {
  if (name.startsWith('.')) return true;
  if (SKIP_DIRS.has(name)) return true;
  if (full && full === ANALYZER_ROOT) return true;
  return false;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'target', 'dist', 'build', 'out',
  '.idea', '.vscode', '.workbuddy', '.DS_Store', 'coverage', 'bin', '.gradle',
]);

/** 在目录内广度优先查找 .jwa（浅层优先，因为随工程附带的样例包一般在根目录） */
function findJwaFiles(root, maxDepth = 4) {
  const found = [];
  let frontier = [{ dir: root, depth: 0 }];
  while (frontier.length) {
    const next = [];
    for (const { dir, depth } of frontier) {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        continue;
      }
      for (const e of entries) {
        if (e.isFile() && /\.jwa$/i.test(e.name)) {
          const full = path.join(dir, e.name);
          let size = 0;
          try { size = fs.statSync(full).size; } catch (err) { /* ignore */ }
          found.push({
            path: full,
            rel: path.relative(root, full),
            name: e.name,
            size,
            depth,
          });
        } else if (e.isDirectory() && depth < maxDepth) {
          const full = path.join(dir, e.name);
          if (!shouldSkipDir(e.name, full)) next.push({ dir: full, depth: depth + 1 });
        }
      }
    }
    frontier = next;
  }
  return found.sort((a, b) => a.depth - b.depth || a.rel.localeCompare(b.rel));
}

/** 判断某个目录是不是 Maven 工程根（有 pom.xml，或有 src/main/java） */
function isMavenRoot(dir) {
  if (fs.existsSync(path.join(dir, 'pom.xml'))) return true;
  return fs.existsSync(path.join(dir, 'src', 'main', 'java'));
}

/** 在目录内查找 Maven 工程根，返回由浅到深的候选列表 */
function findMavenRoots(root, maxDepth = 4) {
  const roots = [];
  if (isMavenRoot(root)) roots.push(root);
  let frontier = [{ dir: root, depth: 0 }];
  while (frontier.length) {
    const next = [];
    for (const { dir, depth } of frontier) {
      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const full = path.join(dir, e.name);
        if (shouldSkipDir(e.name, full)) continue;
        if (depth + 1 > maxDepth) continue;
        if (isMavenRoot(full)) roots.push(full);
        else next.push({ dir: full, depth: depth + 1 });
      }
    }
    frontier = next;
  }
  return roots;
}

function countFiles(dir, filter, maxDepth = 8) {
  let n = 0;
  const walk = (d, depth) => {
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (e.isDirectory()) {
        const full = path.join(d, e.name);
        if (!shouldSkipDir(e.name, full)) walk(full, depth + 1);
      } else if (filter(e.name, d)) n++;
    }
  };
  walk(dir, 0);
  return n;
}

/** 把 .jwa 与 Maven 根按「工程」分组，避免跨工程配对 */
function groupProjects(jwaFiles, mavenRoots) {
  const isUnder = (parent, child) => child === parent || child.startsWith(parent + path.sep);

  const groups = [];
  const byRoot = new Map();

  const ensure = (root) => {
    if (byRoot.has(root)) return byRoot.get(root);
    const g = { root, jwaFiles: [], mavenRoot: null, mavenRoots: [] };
    byRoot.set(root, g);
    groups.push(g);
    return g;
  };

  for (const j of jwaFiles) {
    const dir = path.dirname(j.path);

    // 只与「同目录」或「位于 .jwa 之上」的 Maven 根配对 —— 也就是 Joget 的工程约定：
    // pom.xml + src/main/java + *.jwa 同处一层，或 .jwa 放在工程下层样本目录里。
    //
    // 刻意不与「下级目录」的 Maven 根配对：否则工作区根目录下的一个 .jwa
    // 会被并进它下面的某个工程，两个项目的文件就混在一起了 —— 这正是要避免的。
    const near = mavenRoots
      .filter((m) => isUnder(m, dir))
      .sort((a, b) => b.length - a.length)[0]; // 取最贴近的那个

    const root = near ? near : dir;
    const g = ensure(root);
    if (near) {
      g.mavenRoot = near;
      if (!g.mavenRoots.includes(near)) g.mavenRoots.push(near);
    }
    g.jwaFiles.push(j);
  }

  // 没有任何 .jwa、但有 Maven 工程的目录，也算一个「插件源码工程」
  for (const m of mavenRoots) {
    if (groups.some((g) => g.mavenRoots.includes(m))) continue;
    const g = ensure(m);
    g.mavenRoot = m;
    g.mavenRoots.push(m);
  }

  for (const g of groups) {
    g.jwaFiles.sort((a, b) => a.depth - b.depth || a.rel.localeCompare(b.rel));
    g.mavenRoots.sort((a, b) => a.length - b.length);
  }
  // 浅的在前（用户指向的目录通常就是工程根）
  groups.sort((a, b) => a.root.length - b.root.length || a.root.localeCompare(b.root));
  return groups;
}

/**
 * 识别一个本地路径里有什么。
 * @param {string} inputPath
 * @param {'zh'|'ja'} lang 错误文案语言
 * @returns {{kind:'file'|'dir'|'missing'|'invalid', root:string, jwaFiles:Array, mavenRoots:Array, maven:object|null, projects:Array, ambiguous:boolean, name:string, error?:string}}
 */
function discoverProject(inputPath, lang = 'zh') {
  const root = path.resolve(inputPath);
  const base = { root, name: path.basename(root) };

  if (!fs.existsSync(root)) {
    return { ...base, kind: 'missing', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg(lang, 'pathMissing', { p: root }) };
  }

  // 硬约束：不分析工具自身
  if (isInsideAnalyzer(root)) {
    return { ...base, kind: 'invalid', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg(lang, 'refuseSelf') };
  }

  const st = fs.statSync(root);
  if (st.isFile()) {
    if (/\.jwa$/i.test(root)) {
      const j = { path: root, rel: path.basename(root), name: path.basename(root), size: st.size, depth: 0 };
      return {
        ...base, kind: 'file', jwaFiles: [j], mavenRoots: [], ambiguous: false, maven: null,
        projects: [{ root: path.dirname(root), jwaFiles: [j], mavenRoot: null, mavenRoots: [] }],
      };
    }
    return { ...base, kind: 'file', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg(lang, 'notJwaFile') };
  }

  const jwaFiles = findJwaFiles(root);
  const mavenRoots = findMavenRoots(root);
  const projects = groupProjects(jwaFiles, mavenRoots);

  // 选定工程：只有一个工程 → 直接用它；
  //           多个工程并存 → 一律视为不确定，交前端让用户明确指定
  //           （即便指向的目录本身也含 .jwa 也不自动选，避免误判把别的工程文件带进来）
  let chosen = null;
  let ambiguous = false;
  if (projects.length === 1) chosen = projects[0];
  else if (projects.length > 1) ambiguous = true;

  const mavenOf = (r) => (r
    ? {
        root: r,
        roots: [r],
        pom: fs.existsSync(path.join(r, 'pom.xml')),
        javaFiles: countFiles(r, (n) => n.endsWith('.java')),
        propertyFiles: countFiles(
          path.join(r, 'src', 'main', 'resources', 'properties'),
          (n) => n.endsWith('.json')
        ) || countFiles(r, (n, dir) => n.endsWith('.json') && /properties/i.test(dir)),
        messageFiles: countFiles(path.join(r, 'src', 'main', 'resources', 'messages'), (n) => n.endsWith('.properties')),
      }
    : null);

  const chosenMavenRoot = chosen ? (chosen.mavenRoot || null) : null;

  return {
    ...base,
    kind: 'dir',
    jwaFiles, mavenRoots, projects, ambiguous,
    chosen: chosen || null,
    // 兼容旧字段：未确定工程时为 null，避免调用方误用别的工程的文件
    maven: mavenOf(chosenMavenRoot),
  };
}

/** 浏览目录：返回子目录 + 本层的 .jwa，供前端做简易目录选择器 */
function listDir(dir, lang = 'zh') {
  const target = dir && dir.trim() ? path.resolve(dir) : process.cwd();
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return { path: target, exists: false, dirs: [], jwas: [], parent: null, error: msg(lang, 'dirMissing') };
  }
  let entries = [];
  try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch (e) {
    return { path: target, exists: true, dirs: [], jwas: [], parent: path.dirname(target), error: msg(lang, 'dirNoPerm') };
  }
  const dirs = [];
  const jwas = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (shouldSkipDir(e.name, path.join(target, e.name))) continue;
      let isMaven = false;
      let jwaCount = 0;
      try {
        isMaven = isMavenRoot(path.join(target, e.name));
        jwaCount = findJwaFiles(path.join(target, e.name), 2).length;
      } catch (err) { /* ignore */ }
      dirs.push({ name: e.name, path: path.join(target, e.name), maven: isMaven, jwa: jwaCount });
    } else if (/\.jwa$/i.test(e.name)) {
      let size = 0;
      try { size = fs.statSync(path.join(target, e.name)).size; } catch (err) { /* ignore */ }
      jwas.push({ name: e.name, path: path.join(target, e.name), size });
    }
  }
  dirs.sort((a, b) => (b.maven - a.maven) || (b.jwa - a.jwa) || a.name.localeCompare(b.name));
  return {
    path: target,
    exists: true,
    parent: path.dirname(target) === target ? null : path.dirname(target),
    isMavenRoot: isMavenRoot(target),
    jwaHere: findJwaFiles(target, 1).length,
    dirs,
    jwas,
  };
}

module.exports = {
  discoverProject, findJwaFiles, findMavenRoots, listDir, isMavenRoot, groupProjects,
  isInsideAnalyzer, ANALYZER_ROOT, SKIP_DIRS,
};
