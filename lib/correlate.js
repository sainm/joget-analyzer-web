'use strict';

/**
 * lib/correlate.js — .jwa 内の設定と Java プラグインソースを「突き合わせる」
 *
 * .jwa だけを見ると「どのプラグインのどのクラスを使い、どのパラメータを設定したか」しか分からない。
 * Java ソースだけを見ると「このクラスがどの設定項目を宣言しているか」しか分からない。
 * 両者を突き合わせて初めて、業務上有価な問いに答えられる：
 *
 *   1. アプリで設定したこのパラメータを、ソースは認識しているか？（過剰設定 → 綴り誤りかバージョン不一致）
 *   2. ソースが宣言しているがアプリが未設定のパラメータはどれか？（既定値動作＝暗黙の挙動）
 *   3. アプリが参照しているがソースに見つからないクラス → ソース欠落、評価が閉じない
 *   4. ソースにあるがアプリで一度も使われていないクラス → デッドコード / 未活用の機能
 *   5. アプリが実際に使うクラスは誰を呼ぶか（呼び出しチェーンを「生きている」部分に絞る）
 */

const CATEGORY_LABEL = {
  builtin: '標準プラグイン',
  marketplace: 'マーケットプレイスプラグイン',
  enterprise: 'エンタープライズ版プラグイン',
  custom: '自社開発プラグイン',
};

function categoryOf(cls) {
  if (cls.startsWith('org.joget.marketplace.')) return 'marketplace';
  if (cls.startsWith('org.joget.plugin.enterprise.')) return 'enterprise';
  if (cls.startsWith('org.joget.')) return 'builtin';
  return 'custom';
}

/** 設定値を正規化し「実際に設定されているか」を判定しやすくする */
function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function correlate(summary, manifest) {
  const usages = (summary && summary.plugin_usages) || [];
  const refs = (summary && summary.plugin_refs) || {};
  const hasSource = !!(manifest && !manifest.error && (manifest.components || []).length);
  const callGraph = (manifest && manifest.callGraph) || { nodes: [], edges: [] };

  /* ── ソース索引：完全修飾名と単純クラス名の二重索引 ── */
  const byFqcn = new Map();
  const bySimple = new Map();
  // プロジェクト全体の視点：properties が宣言した全キー / コードが読み取った全キー
  const projectDeclared = new Set();
  const projectRead = new Set();
  if (hasSource) {
    const put = (c, kind) => {
      const rec = {
        class: c.class,
        simple: String(c.class).split('.').pop(),
        file: c.file,
        methodCount: c.methodCount || 0,
        methods: c.methods || [],
        readKeys: c.readKeys || [],
        sourceKind: kind,
        configKeys: (c.configProperties || []).map((p) => p.name),
        configProps: c.configProperties || [],
      };
      byFqcn.set(rec.class, rec);
      if (!bySimple.has(rec.simple)) bySimple.set(rec.simple, rec);
    };
    (manifest.components || []).forEach((c) => put(c, 'component'));
    (manifest.utilities || []).forEach((c) => put(c, 'utility'));
    (manifest.activators || []).forEach((c) => put(c, 'activator'));
    for (const r of byFqcn.values()) {
      r.configKeys.forEach((k) => projectDeclared.add(k));
      r.readKeys.forEach((k) => projectRead.add(k));
    }
  }

  /* ── アプリ側：クラス → 使用箇所 ── */
  const usagesByClass = new Map();
  for (const u of usages) {
    if (!usagesByClass.has(u.className)) usagesByClass.set(u.className, []);
    usagesByClass.get(u.className).push(u);
  }

  const refBuckets = [
    ['builtin', refs.builtin || {}],
    ['marketplace', refs.marketplace || {}],
    ['enterprise', refs.enterprise || {}],
    ['custom', refs.custom || {}],
  ];
  const refEntry = new Map();
  for (const [cat, bucket] of refBuckets) {
    for (const [cls, info] of Object.entries(bucket)) {
      refEntry.set(cls, { category: cat, occurrences: info.occurrences, usedIn: info.usedIn || [] });
    }
  }

  /* ── プラットフォームが要素へ自動で書き込む属性 ────────────────────
   * Joget 本体が保存時に書き込む属性（要素の id、datalist の役割記号など）は
   * プラグインの properties に宣言されていないのが当然で、「無効な設定」と
   * 報ると誤報になる。実素材 41 本で 23 件中 15 件がこの誤報だった。
   *
   * 判拠は 2 つ。
   *  1) そのキーが、アプリがソースを持っていないクラス（builtin /
   *     enterprise）の使用箇所にも現れること。プラグインが独自に決める名前は
   *     自前のクラスにしか出ない——autoHandleWorkflowVariable は 3 クラスに
   *     出るが、すべてマーケットプレイスなので平台属性とは扱わない。
   *  2) datalist の構成要素（action / row_action / column）に書く役割記号。
   *     column は className を持たず plugin_usages に載らないため 1) が
   *     効かない。appDefinition では actions に "action"、rowActions に
   *     "row_action"、columns に "column" と、役割で値が決まる。 */
  const platformKeys = new Set();
  for (const u of usages) {
    const cat = (refEntry.get(u.className) || {}).category;
    if (cat !== 'builtin' && cat !== 'enterprise') continue;
    for (const [k, v] of Object.entries(u.config || {})) {
      if (!isBlank(v)) platformKeys.add(k);
    }
  }
  const DATALIST_SLOT_KEYS = new Set(['datalist_type', 'link-css-display-type']);

  /* ── クラス単位の突合 ── */
  const allClasses = new Set([...refEntry.keys(), ...usagesByClass.keys()]);
  const bindings = [];
  const unresolved = [];
  const platform = [];
  let unknownKeyTotal = 0;
  let deadKeyTotal = 0;

  for (const cls of [...allClasses].sort()) {
    const simple = cls.split('.').pop();
    const ref = refEntry.get(cls) || { category: categoryOf(cls), occurrences: 0, usedIn: [] };
    const us = usagesByClass.get(cls) || [];
    const src = byFqcn.get(cls) || bySimple.get(simple) || null;

    // プラットフォーム標準（標準 + エンタープライズ版）：ソースは元々アプリに同梱されないため
    // 別枠とし、欠落として扱わない
    if (!src && (ref.category === 'builtin' || ref.category === 'enterprise')) {
      platform.push({ className: cls, simpleName: simple, category: ref.category, occurrences: ref.occurrences, usedIn: ref.usedIn });
      continue;
    }

    const definedKeys = src ? src.configKeys : [];
    const definedSet = new Set(definedKeys);

    // アプリが実際に設定したキー（空値は除外）
    const setKeys = new Set();
    const setValues = {};
    for (const u of us) {
      for (const [k, v] of Object.entries(u.config || {})) {
        if (isBlank(v)) continue;
        setKeys.add(k);
        if (setValues[k] === undefined) setValues[k] = v;
      }
    }

    // ソースが無いとパラメータの有効性を判断できないため、この場合は「過剰/不足」の結論を出さない
    const unknownKeys = src ? [...setKeys].filter((k) => !definedSet.has(k)).sort() : [];
    const unsetKeys = src ? [...definedKeys].filter((k) => !setKeys.has(k)).sort() : [];
    unknownKeyTotal += unknownKeys.length;
    // 三者判定：アプリで設定されているが本コンポーネントが未宣言 → 別コンポーネントのものか？単なる宣言漏れか？そもそも無効か？
    // 平台が自動で書く属性はこの判定の対象外（誤報防止）
    const readSet = new Set(src ? src.readKeys : []);
    const unknownDetail = unknownKeys.map((k) => {
      const declaredElsewhere = projectDeclared.has(k);
      const readInCode = readSet.has(k) || projectRead.has(k);
      const verdict = platformKeys.has(k) || DATALIST_SLOT_KEYS.has(k)
        ? 'platform'
        : declaredElsewhere ? 'wrong-plugin' : readInCode ? 'undeclared-but-read' : 'dead';
      return { key: k, declaredElsewhere, readInCode, verdict };
    });
    deadKeyTotal += unknownDetail.filter((d) => d.verdict === 'dead').length;
    const declaredNotRead = src ? definedKeys.filter((k) => !readSet.has(k)).sort() : [];
    const readNotDeclared = src ? (src.readKeys || []).filter((k) => !definedSet.has(k)).sort() : [];

    const rec = {
      className: cls,
      simpleName: simple,
      category: ref.category,
      categoryLabel: CATEGORY_LABEL[ref.category] || ref.category,
      occurrences: ref.occurrences,
      usedIn: ref.usedIn,
      inSource: !!src,
      sourceKind: src ? src.sourceKind : null,
      source: src ? { file: src.file, methodCount: src.methodCount, methods: src.methods.slice(0, 20), readKeys: src.readKeys || [] } : null,
      declaredCount: definedKeys.length,
      configProps: src ? src.configProps : [],
      setCount: setKeys.size,
      setKeys: [...setKeys].sort(),
      setValues,
      unknownKeys,
      unknownDetail,
      deadKeys: unknownDetail.filter((d) => d.verdict === 'dead').map((d) => d.key),
      unsetKeys,
      declaredNotRead,
      readNotDeclared,
      usages: us.map((u) => ({
        where: u.where,
        slot: u.slot,
        path: u.path,
        paths: u.paths || [u.path],
        occurrences: u.occurrences || 1,
        configKeys: u.configKeys,
        config: u.config,
        nonEmptyKeys: Object.keys(u.config || {}).filter((k) => !isBlank(u.config[k])),
      })),
      calls: [],
      calledBy: [],
    };

    if (!src) unresolved.push({ className: cls, simpleName: simple, category: ref.category, occurrences: ref.occurrences, usedIn: ref.usedIn });
    bindings.push(rec);
  }

  // 呼び出しチェーン：アプリが参照するクラスに直接関係する辺のみ残す
  const simpleOf = new Map(bindings.map((b) => [b.className, b.simpleName]));
  const simpleSet = new Set(bindings.map((b) => b.simpleName));
  for (const b of bindings) {
    b.calls = (callGraph.edges || [])
      .filter((e) => e.from === b.simpleName)
      .map((e) => ({ to: e.to, kind: e.kind, weight: e.weight, inApp: simpleSet.has(e.to) }));
    b.calledBy = (callGraph.edges || [])
      .filter((e) => e.to === b.simpleName)
      .map((e) => ({ from: e.from, kind: e.kind, weight: e.weight, inApp: simpleSet.has(e.from) }));
  }

  // ソースに存在するが、アプリから一度も参照されていないクラス
  const usedSimples = new Set([
    ...[...allClasses].map((c) => c.split('.').pop()),
  ]);
  const unusedInSource = hasSource
    ? [...byFqcn.values()]
        .filter((c) => !usedSimples.has(c.simple) && c.sourceKind !== 'activator')
        .map((c) => ({ className: c.class, simpleName: c.simple, file: c.file, methodCount: c.methodCount, sourceKind: c.sourceKind }))
        .sort((a, b) => a.simpleName.localeCompare(b.simpleName))
    : [];

  // 絞り込んだ呼び出し図：「アプリが使うクラス + それらが直接到達するクラス」のみ描画
  const focusNodes = new Set(simpleSet);
  for (const b of bindings) {
    b.calls.forEach((e) => focusNodes.add(e.to));
    b.calledBy.forEach((e) => focusNodes.add(e.from));
  }
  const focusEdges = (callGraph.edges || []).filter((e) => focusNodes.has(e.from) || focusNodes.has(e.to));

  return {
    hasSource,
    bindings: bindings.sort(
      (a, b) => (b.unknownKeys.length - a.unknownKeys.length) || (b.occurrences - a.occurrences) || a.simpleName.localeCompare(b.simpleName)
    ),
    unresolved,
    unusedInSource,
    platform,
    focusedCallGraph: { nodes: (callGraph.nodes || []).filter((n) => focusNodes.has(n.id)), edges: focusEdges },
    stats: {
      referencedClasses: allClasses.size,
      bound: bindings.filter((b) => b.inSource).length,
      unresolved: unresolved.length,
      platform: platform.length,
      unusedInSource: unusedInSource.length,
      unknownConfigKeys: unknownKeyTotal,
      deadConfigKeys: deadKeyTotal,
      classesWithConfigIssues: bindings.filter((b) => b.unknownKeys.length > 0).length,
      totalUsages: usages.reduce((n, u) => n + (u.occurrences || 1), 0),
      distinctUsages: usages.length,
      projectDeclaredKeys: projectDeclared.size,
      projectReadKeys: projectRead.size,
    },
    // 最も先に見るべき 1 件：アプリが設定したが、プラグインプロジェクト全体が認識しないパラメータ
    deadConfig: bindings
      .filter((b) => b.deadKeys.length)
      .map((b) => ({ className: b.className, simpleName: b.simpleName, file: b.source ? b.source.file : null, keys: b.deadKeys, usedIn: b.usedIn })),
  };
}

module.exports = { correlate, categoryOf, CATEGORY_LABEL };
