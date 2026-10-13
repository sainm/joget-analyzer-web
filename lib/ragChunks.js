/**
 * lib/ragChunks.js — RAG チャンク出力
 *
 * app_summary.json（+ 任意でプラグインアーカイブ）から、ベクトルストア投入に適した
 * 意味単位のチャンクを生成する。
 * 各チャンクは自己完結した知識単位：種別・タイトル・本文・メタデータ。
 * 出力：rag_chunks.jsonl（1 行 1 JSON）+ 統計情報
 */
'use strict';

const CAT = { builtin: '標準', marketplace: 'マーケットプレイス', enterprise: 'エンタープライズ版', custom: '自社開発' };

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

  // アプリ概要
  const menus = (app.userviews || []).flatMap((uv) => (uv.categories || []).flatMap((c) => (c.menus || []).map((m) => `${c.category}/${m.label}`)));
  push('app_overview', `${app.name} アプリ概要`,
    [
      `アプリ名：${app.name}（appId: ${app.appId}、バージョン ${app.version}、所属パッケージ ${app.package}）`,
      `作成日時：${app.dateCreated}；最終更新：${app.dateModified}`,
      `構成：フォーム ${(app.forms || []).length} 個、データリスト ${(app.datalists || []).length} 個、ワークフロー ${(summary.xpdl.processes || []).length} 本、データテーブル ${Object.keys(summary.tableModel || summary.data || {}).length} 個`,
      `フロントメニュー：${menus.join('；') || 'なし'}`,
      `デプロイ依存：${((summary.analysis_inputs || {}).deployment_dependencies || []).join('；') || '特になし'}`,
    ].join('\n'));

  // フォーム（フィールド含む）
  for (const f of app.forms || []) {
    const lines = (f.fields || []).map((fd) =>
      `- ${fd.label || fd.id}（${fd.id}、${fd.type}${fd.mandatory ? '、必須' : ''}）${fd.options ? ' 選択肢：' + fd.options : ''}`);
    push('form', `フォーム：${f.name}`, [
      `フォーム ${f.name}（${f.id}）、データテーブル app_fd_${f.tableName}、フィールド ${(f.fields || []).length} 個。`,
      lines.join('\n'),
    ].join('\n'), { formId: f.id, table: f.tableName });
  }

  // データリスト
  for (const d of app.datalists || []) {
    push('datalist', `リスト：${d.name}`,
      `リスト ${d.name}（${d.id}）、Binder ${d.binder}${d.formDefId ? `、データ取得元フォーム ${d.formDefId}` : ''}。`,
      { datalistId: d.id, binder: d.binder });
  }

  // メニュー
  for (const uv of app.userviews || []) {
    for (const c of uv.categories || []) {
      push('menu_group', `メニュー分類：${c.category} / ${uv.name}`,
        (c.menus || []).map((m) => `- ${m.label}（${m.type}${m.target ? ' → ' + m.target : ''}）`).join('\n'),
        { userviewId: uv.id, category: c.category });
    }
  }

  // ワークフロー
  for (const p of summary.xpdl.processes || []) {
    const acts = (p.activities || []).map((a) =>
      `- ${a.name}（${a.id}）：実行者 ${a.performer || '-'}、方式 ${a.implementation}${a.isRoute ? '、ルーティング判定点' : ''}`);
    const trans = (p.transitions || []).map((t) => `- ${t.from} → ${t.to}${t.condition ? ' 条件：' + t.condition : '（順次遷移）'}`);
    push('process', `ワークフロー：${p.name}`, [
      `ワークフロー ${p.name}（${p.id}）、アクティビティ ${(p.activities || []).length} 個、遷移 ${(p.transitions || []).length} 本。`,
      p.participants && p.participants.length ? `参加ロール：${p.participants.map((x) => x.name).join('、')}` : '',
      'アクティビティ：', acts.join('\n'), '遷移：', trans.join('\n'),
    ].filter(Boolean).join('\n'), { processId: p.id });
  }

  // プロセスのデータ副作用
  const effects = summary.sql_effects || [];
  if (effects.length) {
    const byAct = {};
    effects.forEach((e) => { (byAct[e.activity || '-'] = byAct[e.activity || '-'] || []).push(e); });
    for (const [act, list] of Object.entries(byAct)) {
      const lines = list.flatMap((e) => (e.sets || []).map((s) => `- ${e.table}${e.table ? '.' : ''}${s.column} = '${s.value}'`));
      push('process_side_effect', `プロセスノードのデータ副作用：${act}`, lines.join('\n'), { activity: act });
    }
  }

  // データテーブル（テーブルモデルを優先：フォーム定義から導出し、.jwa のサンプルデータ有無に依存しない）
  const tableModel = summary.tableModel && Object.keys(summary.tableModel).length ? summary.tableModel : summary.data || {};
  for (const [table, info] of Object.entries(tableModel)) {
    const cols = info.all_fields || info.fields || [];
    const records = info.records ?? info.rows ?? 0;
    const fromForm = !info.fields;
    push('table', `データテーブル：${table}`,
      [
        `テーブル ${table}（DB テーブル名 ${table.startsWith('app_fd_') ? table : `app_fd_${table}`}）、フィールド ${cols.length} 個${fromForm ? `；デモデータ未エクスポート（.jwa のエクスポート時に「データを含める」を選択していない）` : `、デモデータ ${records} 件`}。`,
        cols.map((f) => `- ${f}`).join('\n'),
      ].join('\n'), { table });
  }

  // テーブル間の関係
  if ((summary.relations || []).length) {
    push('relations', 'テーブル間の関係（自動推定）',
      summary.relations.map((r) => `- ${r.from} → ${r.to}（外部キー ${r.field}）`).join('\n'));
  }

  // 影響分析
  const impact = summary.impact || {};
  for (const [table, writers] of Object.entries(impact.writeMap || {})) {
    push('impact_write', `書き込み影響：${table}`,
      writers.map((w) => `- ${w.source} → ${w.fields}`).join('\n'), { table });
  }
  for (const [table, readers] of Object.entries(impact.readMap || {})) {
    push('impact_read', `読み取り影響：${table}`,
      readers.map((r) => `- ${r.source}（${r.binder}）`).join('\n'), { table });
  }
  (impact.issues || []).forEach((issue, i) => {
    push('issue', `検出された問題 #${i + 1}`, issue);
  });

  // プラグイン
  const pr = summary.plugin_refs || {};
  const customPlugins = [
    ...Object.keys(pr.marketplace || {}).map((c) => ({ c, cat: 'マーケットプレイスプラグイン' })),
    ...Object.keys(pr.enterprise || {}).map((c) => ({ c, cat: 'エンタープライズ版プラグイン' })),
    ...Object.keys(pr.custom || {}).map((c) => ({ c, cat: '自社開発プラグイン' })),
  ];
  if (customPlugins.length) {
    push('plugin_inventory', '非標準プラグイン一覧',
      customPlugins.map(({ c, cat }) => `- [${cat}] ${c}`).join('\n'));
  }
  for (const item of ((summary.analysis_inputs || {}).custom_plugins || [])) {
    if (item.status === 'provided' && item.manifest) {
      push('plugin_manifest', `プラグインアーカイブ：${item.className.split('.').pop()}`,
        `プラグイン ${item.manifest.pom?.groupId}:${item.manifest.pom?.artifactId}:${item.manifest.pom?.version}、` +
        `コンポーネント：${(item.manifest.components || []).map((c) => c.class.split('.').pop()).join('、')}。`,
        { className: item.className });
    }
  }

  // プラグインソースのチャンク（プラグインソースが提供されている場合）
  if (manifest && manifest.components) {
    for (const c of manifest.components) {
      const names = (c.configProperties || []).map((p) => `${p.name}(${p.label})`);
      push('plugin_component', `プラグインコンポーネント：${c.class.split('.').pop()}`,
        [
          `コンポーネントクラス ${c.class}（${c.file}）、メソッド ${c.methodCount} 個。`,
          `設定項目の宣言（${names.length}）：${names.join('; ') || 'なし'}`,
        ].join('\n'), { className: c.class });
    }
    if (manifest.callGraph && manifest.callGraph.edges) {
      push('plugin_callgraph', 'プラグイン呼び出し関係',
        manifest.callGraph.edges.slice(0, 40).map((e) => `- ${e.from} → ${e.to}（${e.kind}、${e.weight} 回）`).join('\n'));
    }
  }

  // アプリ設定 ↔ プラグインソース の突合チャンク
  if (correlation && correlation.hasSource) {
    const bs = correlation.bindings || [];
    push('plugin_correlation', 'アプリとプラグインソースの突合概要',
      [
        `アプリが参照するプラグインクラスは計 ${correlation.stats.referencedClasses} 個；`,
        `うち ${correlation.stats.bound} 個は本プロジェクトのソースに実装があり、${correlation.stats.unresolved} 個はソース未提供、${correlation.stats.platform} 個はプラットフォーム標準です。`,
        `ソースには他に ${correlation.stats.unusedInSource} 個のクラスがあり、本アプリからは一度も参照されていません。`,
        `設定項目の異常：アプリで設定されているがソースに未宣言のパラメータが ${correlation.stats.unknownConfigKeys} 個。`,
      ].join('\n'), { kind: 'correlation_overview' });

    for (const b of bs.filter((x) => x.inSource)) {
      const lines = [
        `${b.categoryLabel} ${b.className}（ソース：${b.source.file}、メソッド ${b.source.methodCount} 個）`,
        `アプリからの参照 ${b.occurrences} 回、使用箇所：${b.usedIn.join('、') || '—'}`,
        `アプリの実際設定 ${b.setCount} 項目：${b.setKeys.map((k) => `${k}=${b.setValues[k]}`).join('; ') || '（なし）'}`,
        `ソースの宣言 ${b.declaredCount} 項目；未設定で既定値動作のものは ${b.unsetKeys.length} 項目。`,
      ];
      if (b.unknownKeys.length) lines.push(`⚠ アプリが設定したがソースに未宣言のパラメータ：${b.unknownKeys.join(', ')}`);
      if (b.calls.length) lines.push(`このコンポーネントの呼び出し：${b.calls.map((c) => `${c.to}[${c.kind}]`).join('、')}`);
      push('plugin_binding', `アプリ↔ソース：${b.simpleName}`, lines.join('\n'), {
        className: b.className, slot: b.usages[0] && b.usages[0].slot,
        unknownKeys: b.unknownKeys.join(','),
      });
    }

    if (correlation.unresolved.length) {
      push('plugin_gap', 'ソースが見つからないプラグインクラス',
        correlation.unresolved.map((u) => `- [${CAT[u.category] || u.category}] ${u.className}（参照 ${u.occurrences} 回、使用箇所 ${u.usedIn.join('、')}）`).join('\n'));
    }
  }

  return chunks;
}

function toJsonl(chunks) {
  return chunks.map((c) => JSON.stringify(c)).join('\n') + '\n';
}

module.exports = { buildChunks, toJsonl, clip };
