/**
 * 統合オブジェクトモデルの ESM 入口。
 *
 * 実装は lib/objectModel.js（CommonJS）にある。Node 側（設計書生成・解析）と
 * ブラウザ側（画面）が同じ実装を読むため、二重定義を避けるには CJS 一択。
 *
 * ここは「ブラウザから使いやすい形にする」ためだけの薄い層:
 *   - default import（esbuild の CJS 変換が既定でこうなる）を受け、
 *   - 画面側が使い慣れた「名前付き import」で扱えるように re-export する。
 *
 * ロジックは一切置かない。ロジックをここに書き始めると、サービス側と
 * 画面側で同じ結論が食い違う原因になる。
 */
import model from '../../lib/objectModel.js';

export const OBJ = model.OBJ;
export const STATUS = model.STATUS;
export const STATUS_LABEL = model.STATUS_LABEL;
export const objTypeLabel = model.objTypeLabel;
export const buildObjectModel = model.buildObjectModel;
/** 設計書の章語彙（docAnchors の値域）。生成側と同じ定義元 */
export const chapters = model.chapters;
export const sections = model.sections;
export const formSectionPrefix = model.formSectionPrefix;
/** カラムの出処の語彙（正式な説明・一覧用の短いラベル・脚注） */
export const BASIS_LABEL = model.BASIS_LABEL;
export const BASIS_SHORT = model.BASIS_SHORT;
export const BASIS_LEGEND = model.BASIS_LEGEND;
/** 未確認の成因の語彙（ラベル・説明・一覧の並び順） */
export const CAUSE_LABEL = model.CAUSE_LABEL;
export const CAUSE_DESC = model.CAUSE_DESC;
export const CAUSE_ORDER = model.CAUSE_ORDER;
/** 静的検査のルールカタログ（ルール名・検査範囲・解析上の限界）と並び順 */
export const CHECK_RULES = model.CHECK_RULES;
export const CHECK_RULE_ORDER = model.CHECK_RULE_ORDER;
