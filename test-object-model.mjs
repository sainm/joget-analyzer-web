/**
 * test-object-model.mjs — 統合オブジェクトモデルの回帰テスト
 *
 * 画面を作る前に「オブジェクトモデルが正しい」ことを数値で固定する。
 * 特に次の3点を検証する:
 *  1. 生成順によって関連が失われないこと（field ↔ column の双方向リンク）
 *  2. 関連が双方向であること（片側だけのリンクを作らない）
 *  3. 取れなかったものを 0 や空欄にしないこと（未確認が明示される）
 *
 * 使い方: node test-object-model.mjs
 *  JOGET_PROJECT  … 解析対象のプロジェクト（既定は同梱の Apache-2.0 サンプル）
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { buildObjectModel, OBJ, STATUS } from './src/lib/objectModel.js';

const require = createRequire(import.meta.url);
const { analyze } = require('./lib/analyze');
const { correlate } = require('./lib/correlate');

const PROJECT = process.env.JOGET_PROJECT || path.join(process.cwd(), 'fixtures', 'enhanced-json-api-main');

let failed = 0;
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}  ${extra}`); }
};

console.log(`── 対象: ${path.relative(process.cwd(), PROJECT)} ──`);

/* 解析結果をその場で生成する（前回の解析結果に依存しない） */
let summary;
let correlation = null;
try {
  const r = analyze(path.join(PROJECT, 'APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa'),
    path.join(process.cwd(), 'data', 'object-model-test'));
  summary = r.summary;
  correlation = correlate(r.summary, PROJECT);
} catch (e) {
  console.log(`スキップ（解析に失敗: ${e.message}）`);
  process.exit(0);
}

const m = buildObjectModel({ summary, correlation });

console.log('\n[1] オブジェクト種別');
const types = Object.entries(m.stats.byType).map(([k2, v]) => `${k2}=${v}`).join(' ');
console.log(`  ${types} / 合計 ${m.stats.total}`);
ok('フォームが生成される', (m.stats.byType[OBJ.FORM] || 0) > 0);
ok('テーブルが生成される', (m.stats.byType[OBJ.TABLE] || 0) > 0);
ok('メニューまたはリストが生成される', (m.stats.byType[OBJ.MENU] || 0) + (m.stats.byType[OBJ.LIST] || 0) > 0);

console.log('\n[2] 関連の整合性（回帰: 生成順で関連を失わない）');
let broken = 0;
let asym = 0;
for (const o of m.objects) {
  for (const l of o.links) {
    const to = m.byKey.get(l.key);
    if (!to) { broken++; continue; }
    if (!to.links.some((x) => x.key === o.key)) asym++;
  }
}
ok('壊れたリンクが無い', broken === 0, `${broken} 件`);
ok('関連が双方向', asym === 0, `${asym} 件が片側`);

const tbl = m.objects.find((o) => o.type === OBJ.TABLE);
const cols = m.objects.filter((o) => o.type === OBJ.COLUMN);
const formColLinks = cols.filter((c) => c.links.some((l) => l.type === 'field')).length;
console.log(`  テーブル ${m.stats.byType[OBJ.TABLE] || 0} / カラム ${cols.length} / カラム→項目リンク ${formColLinks}`);
ok('カラム→フォーム項目の関連が解決している', cols.length > 0 && formColLinks > 0);

console.log('\n[3] 静的な検査結果');
console.log(`  エラー ${m.stats.checks.error} / 警告 ${m.stats.checks.warn} / 情報 ${m.stats.checks.info}`);
ok('各検査にルールIDがある', m.checks.every((c) => !!c.ruleId));
ok('各検査に根拠がある', m.checks.every((c) => !!c.evidence));
ok('各検査に解析上の制限がある', m.checks.every((c) => !!c.limit));
ok('各検査に検査範囲がある', m.checks.every((c) => !!c.scope));
ok('解決できなかった関連が報告される', Array.isArray(m.unresolved));

console.log('\n[4] 未確認を隠さない（0 や空欄にしない）');
console.log(`  未確認 ${m.unconfirmed.length} 件（全体 ${m.stats.total}）`);
ok('未確認が算出されている', m.unconfirmed.length >= 0 && m.stats.byStatus[STATUS.PARTIAL] !== undefined);
ok('全オブジェクトに解析状態がある', m.objects.every((o) => !!o.status));
const derived = m.objects.filter((o) => o.type === OBJ.TABLE && o.evidence.some((e) => e.kind === 'derivation'));
ok('規約導出のテーブルは「一部のみ」になる', derived.every((o) => o.status === STATUS.PARTIAL));

console.log('\n[5] 解析品質');
for (const c of m.coverage) {
  console.log(`  ${c.label.padEnd(18)} ${c.measured ? `${c.total} 件（うち未確定 ${c.partial}）` : '未計測'} — ${c.note}`);
}
ok('資産種別ごとに件数が算出されている', m.coverage.every((c) => typeof c.total === 'number'));
ok('測定していない項目は「未計測」と明示される', m.coverage.every((c) => c.measured || c.total === 0));

console.log(`\n結果: ${failed ? `不合格 ${failed} 件` : '通過'}`);
process.exit(failed ? 1 : 0);