/**
 * サーバー側のユーザー可視文言（日本語のみ）。
 * フロントエンドにそのまま表示する文字列だけを置く。内部例外はそのまま透過させる。
 * 本ツールは日本向けに納品するため、多言語化は行わない。
 */

const M = {
  /* ── パスとディレクトリ ── */
  needPath: 'ローカルプロジェクトまたは .jwa のパスを入力してください',
  pathMissing: 'パスが存在しません：{p}',
  notJwaFile: '.jwa アプリパッケージではありません',
  dirMissing: 'ディレクトリが存在しません',
  dirNoPerm: '読み取り権限がありません',

  /* ── プロジェクト範囲 ── */
  refuseSelf: 'これは解析ツール自身のディレクトリです。対象プロジェクトを指定してください（同梱のサンプルは fixtures/ 配下にあります）。',
  ambiguousProjects:
    'このディレクトリには独立したプロジェクトが {n} 個あります：{list}。別プロジェクトのファイルを混在させないため、いずれかのプロジェクトディレクトリを直接指定してください。',

  /* ── アップロード ── */
  needJwaUpload: '.jwa アプリパッケージをアップロードしてください',

  /* ── API パラメータ ── */
  needPathParam: 'path パラメータがありません',
  noJwaInDir: 'このディレクトリに .jwa はありません',
};

/** 文言取得。{name} 形式のプレースホルダを置換する */
function msg(key, vars) {
  let s = M[key];
  if (s === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

module.exports = { msg, M };
