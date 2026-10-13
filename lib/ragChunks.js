/**
 * lib/ragChunks.js — RAG 分块输出
 *
 * 从 app_summary.json（+ 可选插件档案）生成适合向量库入库的语义分块。
 * 每个分块是一个自解释的知识单元：类型、标题、正文、元数据。
 * 输出: rag_chunks.jsonl（每行一个 JSON）+ 统计信息
 */
'use strict';

const CAT = { builtin: '内置', marketplace: '市场', enterprise: '企业版', custom: '自研' };

function clip(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function buildChunks(summary, manifest, correlation) {
  const app = summary.app || {};
  const docId = app.appId || 'app';
  const meta = { appId: app.appId, appName: app.name };
  const chunks = [];
  let seq = 0;

  const push = (type, title, content, extra = {}) => {
    seq += 1;
    chunks.push({
      chunk_id: `${docId}::${type}::${String(seq).padStart(4, '0')}`,
      doc_id: docId,
      type,
      title,
      content: String(content).trim(),
      metadata: { ...meta, ...extra },
      chars: String(content).trim().length,
    });
  };

  // 应用总览
  const menus = (app.userviews || []).flatMap((uv) => (uv.categories || []).flatMap((c) => (c.menus || []).map((m) => `${c.category}/${m.label}`)));
  push('app_overview', `${app.name} 应用总览`,
    [
      `应用名称：${app.name}（appId: ${app.appId}，版本 ${app.version}，所属包 ${app.package}）`,
      `创建时间：${app.dateCreated}；最后修改：${app.dateModified}`,
      `组成：${(app.forms || []).length} 个表单、${(app.datalists || []).length} 个数据列表、${(summary.xpdl.processes || []).length} 条工作流、${Object.keys(summary.data || {}).length} 张数据表`,
      `前台菜单入口：${menus.join('；') || '无'}`,
      `部署依赖：${((summary.analysis_inputs || {}).deployment_dependencies || []).join('；') || '无特殊依赖'}`,
    ].join('\n'));

  // 表单（含字段）
  for (const f of app.forms || []) {
    const lines = (f.fields || []).map((fd) =>
      `- ${fd.label || fd.id}（${fd.id}，${fd.type}${fd.mandatory ? '，必填' : ''}）${fd.options ? ' 选项：' + fd.options : ''}`);
    push('form', `表单：${f.name}`, [
      `表单 ${f.name}（${f.id}），数据表 app_fd_${f.tableName}，共 ${(f.fields || []).length} 个字段。`,
      lines.join('\n'),
    ].join('\n'), { formId: f.id, table: f.tableName });
  }

  // 数据列表
  for (const d of app.datalists || []) {
    push('datalist', `列表：${d.name}`,
      `列表 ${d.name}（${d.id}），绑定器 ${d.binder}${d.formDefId ? `，数据来源表单 ${d.formDefId}` : ''}。`,
      { datalistId: d.id, binder: d.binder });
  }

  // 菜单
  for (const uv of app.userviews || []) {
    for (const c of uv.categories || []) {
      push('menu_group', `菜单组：${c.category} / ${uv.name}`,
        (c.menus || []).map((m) => `- ${m.label}（${m.type}${m.target ? ' → ' + m.target : ''}）`).join('\n'),
        { userviewId: uv.id, category: c.category });
    }
  }

  // 工作流
  for (const p of summary.xpdl.processes || []) {
    const acts = (p.activities || []).map((a) =>
      `- ${a.name}（${a.id}）：执行者 ${a.performer || '-'}，方式 ${a.implementation}${a.isRoute ? '，路由决策点' : ''}`);
    const trans = (p.transitions || []).map((t) => `- ${t.from} → ${t.to}${t.condition ? ' 条件：' + t.condition : '（顺序流转）'}`);
    push('process', `工作流：${p.name}`, [
      `工作流 ${p.name}（${p.id}），共 ${(p.activities || []).length} 个活动、${(p.transitions || []).length} 条迁移。`,
      p.participants && p.participants.length ? `参与角色：${p.participants.map((x) => x.name).join('、')}` : '',
      '活动：', acts.join('\n'), '迁移：', trans.join('\n'),
    ].filter(Boolean).join('\n'), { processId: p.id });
  }

  // 流程数据副作用
  const effects = summary.sql_effects || [];
  if (effects.length) {
    const byAct = {};
    effects.forEach((e) => { (byAct[e.activity || '-'] = byAct[e.activity || '-'] || []).push(e); });
    for (const [act, list] of Object.entries(byAct)) {
      const lines = list.flatMap((e) => (e.sets || []).map((s) => `- ${e.table}${e.table ? '.' : ''}${s.column} = '${s.value}'`));
      push('process_side_effect', `流程节点数据副作用：${act}`, lines.join('\n'), { activity: act });
    }
  }

  // 数据表（表模型优先：由表单定义推导，不依赖 .jwa 是否导出了样例数据）
  const tableModel = summary.tableModel && Object.keys(summary.tableModel).length ? summary.tableModel : summary.data || {};
  for (const [table, info] of Object.entries(tableModel)) {
    const cols = info.all_fields || info.fields || [];
    const records = info.records ?? info.rows ?? 0;
    const fromForm = !info.fields;
    push('table', `数据表：${table}`,
      [
        `表 ${table}（DB 表名 ${table.startsWith('app_fd_') ? table : `app_fd_${table}`}），字段 ${cols.length} 个${fromForm ? `；演示数据未导出（导出 .jwa 时未勾选「包含数据」）` : `，演示数据 ${records} 条`}。`,
        cols.map((f) => `- ${f}`).join('\n'),
      ].join('\n'), { table });
  }

  // 表间关系
  if ((summary.relations || []).length) {
    push('relations', '表间关系（自动推断）',
      summary.relations.map((r) => `- ${r.from} → ${r.to}（外键字段 ${r.field}）`).join('\n'));
  }

  // 影响分析
  const impact = summary.impact || {};
  for (const [table, writers] of Object.entries(impact.writeMap || {})) {
    push('impact_write', `写入影响：${table}`,
      writers.map((w) => `- ${w.source} → ${w.fields}`).join('\n'), { table });
  }
  for (const [table, readers] of Object.entries(impact.readMap || {})) {
    push('impact_read', `读取影响：${table}`,
      readers.map((r) => `- ${r.source}（${r.binder}）`).join('\n'), { table });
  }
  (impact.issues || []).forEach((issue, i) => {
    push('issue', `检出问题 #${i + 1}`, issue);
  });

  // 插件
  const pr = summary.plugin_refs || {};
  const customPlugins = [
    ...Object.keys(pr.marketplace || {}).map((c) => ({ c, cat: '市场插件' })),
    ...Object.keys(pr.enterprise || {}).map((c) => ({ c, cat: '企业版插件' })),
    ...Object.keys(pr.custom || {}).map((c) => ({ c, cat: '自研插件' })),
  ];
  if (customPlugins.length) {
    push('plugin_inventory', '非内置插件清单',
      customPlugins.map(({ c, cat }) => `- [${cat}] ${c}`).join('\n'));
  }
  for (const item of ((summary.analysis_inputs || {}).custom_plugins || [])) {
    if (item.status === 'provided' && item.manifest) {
      push('plugin_manifest', `插件档案：${item.className.split('.').pop()}`,
        `插件 ${item.manifest.pom?.groupId}:${item.manifest.pom?.artifactId}:${item.manifest.pom?.version}，` +
        `组件：${(item.manifest.components || []).map((c) => c.class.split('.').pop()).join('、')}。`,
        { className: item.className });
    }
  }

  // 插件源码分块（若已上传插件源码）
  if (manifest && manifest.components) {
    for (const c of manifest.components) {
      const names = (c.configProperties || []).map((p) => `${p.name}(${p.label})`);
      push('plugin_component', `插件组件：${c.class.split('.').pop()}`,
        [
          `组件类 ${c.class}（${c.file}），方法 ${c.methodCount} 个。`,
          `配置项声明（${names.length}）：${names.join('; ') || '无'}`,
        ].join('\n'), { className: c.class });
    }
    if (manifest.callGraph && manifest.callGraph.edges) {
      push('plugin_callgraph', '插件调用关系',
        manifest.callGraph.edges.slice(0, 40).map((e) => `- ${e.from} → ${e.to}（${e.kind}，${e.weight} 次）`).join('\n'));
    }
  }

  // 应用配置 ↔ 插件源码 联动分块
  if (correlation && correlation.hasSource) {
    const bs = correlation.bindings || [];
    push('plugin_correlation', '应用与插件源码联动总览',
      [
        `应用共引用 ${correlation.stats.referencedClasses} 个插件类；`,
        `其中 ${correlation.stats.bound} 个在本工程源码中找到实现，${correlation.stats.unresolved} 个缺源码，${correlation.stats.platform} 个为平台内置。`,
        `源码中另有 ${correlation.stats.unusedInSource} 个类从未被本应用引用。`,
        `配置项异常：${correlation.stats.unknownConfigKeys} 个应用设置了但源码未声明的参数。`,
      ].join('\n'), { kind: 'correlation_overview' });

    for (const b of bs.filter((x) => x.inSource)) {
      const lines = [
        `${b.categoryLabel} ${b.className}（源码：${b.source.file}，方法 ${b.source.methodCount} 个）`,
        `被应用引用 ${b.occurrences} 次，位置：${b.usedIn.join('、') || '—'}`,
        `应用实际配置了 ${b.setCount} 项：${b.setKeys.map((k) => `${k}=${b.setValues[k]}`).join('; ') || '（无）'}`,
        `源码声明 ${b.declaredCount} 项配置；未配置走默认值的有 ${b.unsetKeys.length} 项。`,
      ];
      if (b.unknownKeys.length) lines.push(`⚠ 应用设置了源码未声明的参数：${b.unknownKeys.join(', ')}`);
      if (b.calls.length) lines.push(`该组件调用：${b.calls.map((c) => `${c.to}[${c.kind}]`).join('、')}`);
      push('plugin_binding', `应用↔源码：${b.simpleName}`, lines.join('\n'), {
        className: b.className, slot: b.usages[0] && b.usages[0].slot,
        unknownKeys: b.unknownKeys.join(','),
      });
    }

    if (correlation.unresolved.length) {
      push('plugin_gap', '缺少源码的插件类',
        correlation.unresolved.map((u) => `- [${CAT[ u.category ] || u.category}] ${u.className}（引用 ${u.occurrences} 次，用于 ${u.usedIn.join('、')}）`).join('\n'));
    }
  }

  return chunks;
}

function toJsonl(chunks) {
  return chunks.map((c) => JSON.stringify(c)).join('\n') + '\n';
}

module.exports = { buildChunks, toJsonl, clip };
