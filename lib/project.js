/**
 * lib/project.js — プロジェクトディレクトリの検出
 *
 * 「Joget プロジェクト」は通常このような構成になる（例：enhanced-json-api-main/）：
 *   pom.xml                      ← Maven 座標
 *   src/main/java/...            ← プラグインとユーティリティクラスのソース
 *   src/main/resources/properties/*.json  ← コンポーネントの設定項目定義
 *   src/main/resources/messages/*.properties ← i18n
 *   APP_XXX-1-2024....jwa        ← プロジェクトに同梱されたサンプルアプリパッケージ
 *
 * したがって入口は「.jwa を 1 つアップロードする」ではなく「ディレクトリを指定する」であり、
 * 中に何があるかはツール自身が認識する。
 */

const fs = require('fs');
const path = require('path');
const { msg } = require('./msg.js');

/**
 * ツール自身のルートディレクトリ —— 決してスキャン対象にしない。
 *
 * 除外が必須な理由：ツール自身がワークスペース内にあり、data/ 下にテスト用のサンプル
 * パッケージが残っていることがある。ユーザーがワークスペースの親ディレクトリを指定した場合、
 * 除外しないと「ツール自身のファイル」を解析対象プロジェクトの一部とみなし、
 * 他プロジェクトのファイルと混ざってしまう。これは最適化ではなくハード制約である。
 */
const ANALYZER_ROOT = path.resolve(__dirname, '..');

/**
 * 同梱のテスト用フィクスチャ置き場。
 *
 * ツール自身のディレクトリ配下にあるが、ここは「ツールのコード」ではなく
 * 「解析対象のサンプル」なので、例外として解析を許可する。
 * これがないと、fixtures/ を指定しても自分自身のディレクトリ扱いで拒否されてしまう。
 */
const FIXTURES_ROOT = path.join(ANALYZER_ROOT, 'fixtures');

/** 対象パスが「ツール自身のコード」の中かどうか（fixtures/ 配下は除外＝解析可） */
function isInsideAnalyzer(p) {
  const r = path.resolve(p);
  const inAnalyzer = r === ANALYZER_ROOT || r.startsWith(ANALYZER_ROOT + path.sep);
  if (!inAnalyzer) return false;
  // fixtures/ 配下は同梱サンプルなので解析対象として許可する
  return !(r === FIXTURES_ROOT || r.startsWith(FIXTURES_ROOT + path.sep));
}

/** そのディレクトリをスキップすべきか：ツール自身 + 一般的な除外ディレクトリ */
function shouldSkipDir(name, full) {
  if (name.startsWith('.')) return true;
  if (SKIP_DIRS.has(name)) return true;
  // 親ディレクトリを走査するケースでは、ツール自身のツリーには降りない
  //（fixtures/ も「ツールの中」なので、他人のプロジェクト走査には混ぜない）
  if (full && full === ANALYZER_ROOT) return true;
  return false;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'target', 'dist', 'build', 'out',
  '.idea', '.vscode', '.workbuddy', '.DS_Store', 'coverage', 'bin', '.gradle',
]);

/** ディレクトリ内を幅優先で .jwa を探す（浅い階層を優先。同梱のサンプルパッケージは通常ルートにある） */
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

/** そのディレクトリが Maven プロジェクトのルートか（pom.xml がある、または src/main/java がある） */
function isMavenRoot(dir) {
  if (fs.existsSync(path.join(dir, 'pom.xml'))) return true;
  return fs.existsSync(path.join(dir, 'src', 'main', 'java'));
}

/** ディレクトリ内で Maven プロジェクトのルートを探し、浅い順の候補リストを返す */
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

/** .jwa と Maven ルートを「プロジェクト」単位にまとめ、プロジェクト間の取り違えを防ぐ */
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

    // 「同一ディレクトリ」または「.jwa より上位」にある Maven ルートとのみ組にする
    // —— つまり Joget のプロジェクト規約：pom.xml + src/main/java + *.jwa が同じ階層に
    // あるか、.jwa がプロジェクト配下のサンプルディレクトリにある。
    //
    // 意図的に「下位ディレクトリ」の Maven ルートとは組にしない：そうしないとワークスペース
    // ルート直下の .jwa がその下にあるプロジェクトに取り込まれ、2 つのプロジェクトの
    // ファイルが混ざってしまう —— まさにそれを避けたい。
    const near = mavenRoots
      .filter((m) => isUnder(m, dir))
      .sort((a, b) => b.length - a.length)[0]; // 最も近いものを取る

    const root = near ? near : dir;
    const g = ensure(root);
    if (near) {
      g.mavenRoot = near;
      if (!g.mavenRoots.includes(near)) g.mavenRoots.push(near);
    }
    g.jwaFiles.push(j);
  }

  // .jwa がなく Maven プロジェクトだけがあるディレクトリも「プラグインソースプロジェクト」とみなす
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
  // 浅いものを先頭に（ユーザーが指定するディレクトリは通常プロジェクトルート）
  groups.sort((a, b) => a.root.length - b.root.length || a.root.localeCompare(b.root));
  return groups;
}

/**
 * ローカルパスに何があるかを検出する。
 * @param {string} inputPath
 * @returns {{kind:'file'|'dir'|'missing'|'invalid', root:string, jwaFiles:Array, mavenRoots:Array, maven:object|null, projects:Array, ambiguous:boolean, name:string, error?:string}}
 */
function discoverProject(inputPath) {
  const root = path.resolve(inputPath);
  const base = { root, name: path.basename(root) };

  if (!fs.existsSync(root)) {
    return { ...base, kind: 'missing', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg('pathMissing', { p: root }) };
  }

  // ハード制約：ツール自身は解析しない
  if (isInsideAnalyzer(root)) {
    return { ...base, kind: 'invalid', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg('refuseSelf') };
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
    return { ...base, kind: 'file', jwaFiles: [], mavenRoots: [], projects: [], ambiguous: false, maven: null, error: msg('notJwaFile') };
  }

  const jwaFiles = findJwaFiles(root);
  const mavenRoots = findMavenRoots(root);
  const projects = groupProjects(jwaFiles, mavenRoots);

  // プロジェクトの選定：1 つだけ → それをそのまま使う。
  //                    複数併存 → 一律「未確定」とし、フロントでユーザーに明示指定させる。
  //                    （指定ディレクトリ自体に .jwa があっても自動選択しない。
  //                      誤判定で他プロジェクトのファイルを持ち込むのを避けるため）
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
    // 旧フィールドとの互換：プロジェクト未確定時は null とし、呼び出し側が他プロジェクトの
    // ファイルを誤用しないようにする
    maven: mavenOf(chosenMavenRoot),
  };
}

/** ディレクトリ閲覧：サブディレクトリ + 同階層の .jwa を返す（フロントの簡易ディレクトリ選択用） */
function listDir(dir) {
  const target = dir && dir.trim() ? path.resolve(dir) : process.cwd();
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return { path: target, exists: false, dirs: [], jwas: [], parent: null, error: msg('dirMissing') };
  }
  let entries = [];
  try { entries = fs.readdirSync(target, { withFileTypes: true }); } catch (e) {
    return { path: target, exists: true, dirs: [], jwas: [], parent: path.dirname(target), error: msg('dirNoPerm') };
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
  isInsideAnalyzer, ANALYZER_ROOT, FIXTURES_ROOT, SKIP_DIRS,
};
