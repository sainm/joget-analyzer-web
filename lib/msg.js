/**
 * 服务端用户可见文案（中文 / 日本語）。
 * 只放会被前端直接展示给用户的字符串；内部异常原样透传。
 */

const M = {
  /* ── 路径与目录 ── */
  needPath: ['请填写本机工程目录或 .jwa 文件路径', 'ローカルプロジェクトまたは .jwa のパスを入力してください'],
  pathMissing: ['路径不存在：{p}', 'パスが存在しません：{p}'],
  notJwaFile: ['该文件不是 .jwa 应用包', '.jwa アプリパッケージではありません'],
  dirMissing: ['目录不存在', 'ディレクトリが存在しません'],
  dirNoPerm: ['无权限读取', '読み取り権限がありません'],

  /* ── 工程范围 ── */
  refuseSelf: ['这是分析工具自身的目录，不能作为分析目标。请指向你的工程目录。', 'これは解析ツール自身のディレクトリです。対象プロジェクトを指定してください。'],
  ambiguousProjects: [
    '该目录下有 {n} 个独立工程：{list}。为避免把不同工程的文件混在一起，请直接指向其中一个工程目录。',
    'このディレクトリには独立したプロジェクトが {n} 個あります：{list}。別プロジェクトのファイルを混在させないため、いずれかのプロジェクトディレクトリを直接指定してください。',
  ],

  /* ── 上传 ── */
  needJwaUpload: ['请上传 .jwa 应用包文件', '.jwa アプリパッケージをアップロードしてください'],

  /* ── 接口参数 ── */
  needPathParam: ['缺少 path 参数', 'path パラメータがありません'],
  noJwaInDir: ['该目录里没有 .jwa 应用包', 'このディレクトリに .jwa はありません'],
};

/** 取词，支持 {name} 占位替换；lang 仅识别 'ja'，其余回落中文 */
function msg(lang, key, vars) {
  const pair = M[key];
  if (!pair) return key;
  let s = lang === 'ja' ? pair[1] : pair[0];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

module.exports = { msg, M };
