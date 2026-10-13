'use strict';

/**
 * lib/correlate.js — 把 .jwa 内的配置与 Java 插件源码「对起来」
 *
 * 单看 .jwa 只能知道「用了哪个插件的哪个类、配了哪些参数」；
 * 单看 Java 源码只能知道「这个类声明了哪些配置项」。
 * 只有把两者对齐，才能回答真正有业务价值的问题：
 *
 *   1. 应用里配的这个参数，源码里到底认不认？（多配 → 拼写错误或版本不符）
 *   2. 源码声明了但应用没配的参数有哪些？（走默认值，是隐式行为）
 *   3. 应用引用了但源码里找不到的类 → 缺源码，评估无法闭环
 *   4. 源码里有但应用从没用过的类 → 死代码 / 未启用能力
 *   5. 被应用真正用到的类，它调用了谁（调用链收窄到「活的」那部分）
 */

const CATEGORY_LABEL = {
  builtin: '内置插件',
  marketplace: '市场插件',
  enterprise: '企业版插件',
  custom: '自研插件',
};

function categoryOf(cls) {
  if (cls.startsWith('org.joget.marketplace.')) return 'marketplace';
  if (cls.startsWith('org.joget.plugin.enterprise.')) return 'enterprise';
  if (cls.startsWith('org.joget.')) return 'builtin';
  return 'custom';
}

/** 归一化配置值，便于判断“是否真的设置了” */
function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function correlate(summary, manifest) {
  const usages = (summary && summary.plugin_usages) || [];
  const refs = (summary && summary.plugin_refs) || {};
  const hasSource = !!(manifest && !manifest.error && (manifest.components || []).length);
  const callGraph = (manifest && manifest.callGraph) || { nodes: [], edges: [] };

  /* ── 源码索引：全限定名 与 简单类名 双索引 ── */
  const byFqcn = new Map();
  const bySimple = new Map();
  // 全工程视角：所有 properties 声明过的键 / 所有代码读取过的键
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

  /* ── 应用侧：类 → 使用点 ── */
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

  /* ── 逐类比对 ── */
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

    // 平台自带（内置 + 企业版）：源码本就不随应用交付，单列，不算缺口
    if (!src && (ref.category === 'builtin' || ref.category === 'enterprise')) {
      platform.push({ className: cls, simpleName: simple, category: ref.category, occurrences: ref.occurrences, usedIn: ref.usedIn });
      continue;
    }

    const definedKeys = src ? src.configKeys : [];
    const definedSet = new Set(definedKeys);

    // 应用实际设置过的键（去掉空值）
    const setKeys = new Set();
    const setValues = {};
    for (const u of us) {
      for (const [k, v] of Object.entries(u.config || {})) {
        if (isBlank(v)) continue;
        setKeys.add(k);
        if (setValues[k] === undefined) setValues[k] = v;
      }
    }

    // 没有源码就无法判断参数是否有效，此时不下「多配/少配」的结论
    const unknownKeys = src ? [...setKeys].filter((k) => !definedSet.has(k)).sort() : [];
    const unsetKeys = src ? [...definedKeys].filter((k) => !setKeys.has(k)).sort() : [];
    unknownKeyTotal += unknownKeys.length;
    // 三方判定：应用配了、但本组件没声明 → 属于别的组件？只是漏声明？还是根本无效？
    const readSet = new Set(src ? src.readKeys : []);
    const unknownDetail = unknownKeys.map((k) => {
      const declaredElsewhere = projectDeclared.has(k);
      const readInCode = readSet.has(k) || projectRead.has(k);
      const verdict = declaredElsewhere ? 'wrong-plugin' : readInCode ? 'undeclared-but-read' : 'dead';
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

  // 调用链：只保留与「被应用引用的类」直接相关的边
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

  // 源码里存在但应用从未引用的类
  const usedSimples = new Set([
    ...[...allClasses].map((c) => c.split('.').pop()),
  ]);
  const unusedInSource = hasSource
    ? [...byFqcn.values()]
        .filter((c) => !usedSimples.has(c.simple) && c.sourceKind !== 'activator')
        .map((c) => ({ className: c.class, simpleName: c.simple, file: c.file, methodCount: c.methodCount, sourceKind: c.sourceKind }))
        .sort((a, b) => a.simpleName.localeCompare(b.simpleName))
    : [];

  // 收窄后的调用图：只画「应用用到的类 + 它们直接触达的类」
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
    // 最值得先看的一条：应用配了、但整个插件工程都不认识的参数
    deadConfig: bindings
      .filter((b) => b.deadKeys.length)
      .map((b) => ({ className: b.className, simpleName: b.simpleName, file: b.source ? b.source.file : null, keys: b.deadKeys, usedIn: b.usedIn })),
  };
}

module.exports = { correlate, categoryOf, CATEGORY_LABEL };
