const BASE = '';

/** 网络层兜底文案（服务端已返回 error 时不会用到） */
const FALLBACK = {
  zh: (s) => `请求失败（${s}）`,
  ja: (s) => `リクエストに失敗しました（${s}）`,
};

async function j(res, lang) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const f = FALLBACK[lang === 'ja' ? 'ja' : 'zh'];
    throw new Error(data.error || f(res.status));
  }
  return data;
}

const qs = (lang) => (lang === 'ja' ? '&lang=ja' : '');

export function analyze({ jwa, pluginFiles, lang }) {
  const fd = new FormData();
  fd.append('jwa', jwa);
  (pluginFiles || []).forEach((f) => fd.append('plugin', f));
  fd.append('lang', lang || 'zh');
  return fetch(`${BASE}/api/analyze`, { method: 'POST', body: fd }).then((r) => j(r, lang));
}

/** 以本机路径为输入（工程目录或 .jwa 文件） */
export function analyzeProject({ path: p, lang }) {
  return fetch(`${BASE}/api/analyze-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: p, lang: lang || 'zh' }),
  }).then((r) => j(r, lang));
}

/** 浏览本机目录 */
export function listDir(p, lang) {
  return fetch(`${BASE}/api/fs/list?path=${encodeURIComponent(p || '')}${qs(lang)}`).then((r) => j(r, lang));
}

/** 预检路径里有什么 */
export function discover(p, lang) {
  return fetch(`${BASE}/api/fs/discover?path=${encodeURIComponent(p)}${qs(lang)}`).then((r) => j(r, lang));
}

export function listRuns() {
  return fetch(`${BASE}/api/runs`).then((r) => j(r));
}

export function getRun(id) {
  return fetch(`${BASE}/api/runs/${id}`).then((r) => j(r));
}

export function downloadUrl(id, name) {
  return `${BASE}/api/runs/${id}/download/${encodeURIComponent(name)}`;
}
