/**
 * 設計書の章・節の見出し語彙。
 *
 * なぜ単独のファイルなのか:
 *  生成側（lib/designDoc.js、CJS）と参照側（src/lib/objectModel.js、ESM）が
 *  同じ定義を読む必要がある。ここを二重に持つと、
 *  「片方だけ見出しを直した」状態でオブジェクト → 設計書の対応が静かに切れ、
 *  設計書センターからオブジェクトへ戻れなくなる（誰もエラーを見ない）。
 *
 * なぜ .cjs なのか:
 *  同じ定義を CJS と ESM の両方から読む必要がある。
 *  JSON import は Node の ESM で import attribute が必須になり、
 *  bundler 側でも扱いが揺れる。CommonJS は Node ではそのまま require でき、
 *  Vite / esbuild は CJS を ESM に変換して取り込めるため、両方の経路が素直。
 */
'use strict';

/** 章の見出し（「## 」の接頭辞と連番は含めない） */
const chapters = {
  overview: '1. 概要',
  architecture: '2. システムアーキテクチャとモジュール構成',
  function: '3. 機能設計',
  process: '4. プロセス設計',
  dataModel: '5. データモデル設計',
  impact: '6. 影響範囲分析',
  appendix: '7. 付録',
};

/** 節の見出し（「### 」の接頭辞は含める。見出しそのものになる） */
const sections = {
  modules: '2.1 機能モジュール（メニュー別）',
  plugins: '2.2 コンポーネント・プラグイン一覧',
  pluginCorrelation: '2.3 アプリ設定 ↔ プラグインソースの突合',
  tableList: '5.1 テーブル構造一覧',
  tableRelations: '5.2 テーブル間の関係（自動推定）',
  customTables: '5.3 カスタム / 外部テーブル',
  writeSources: '6.1 書込元',
  readSources: '6.2 参照元',
  issues: '6.3 検出された問題',
  fileList: '7.1 アプリパッケージのファイル一覧',
  terms: '7.2 用語',
};

/**
 * フォームの節見出しは「### 3.<連番> <フォーム名>（`id`）」の形。
 * 連番は生成時に振られるため、実際の節見出しを一意に指定できない。
 * そこで章番号の接頭辞だけを公開し、照合は「接頭辞 + 名前」の 2 要素で行う
 * （src/lib/designDocView.js の anchorsMatch が担当）。
 */
const formSectionPrefix = '3.';

module.exports = { chapters, sections, formSectionPrefix };
