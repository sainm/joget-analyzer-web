const BASE = '';

/** ネットワーク層のフォールバック文言（サーバが error を返した場合はそちらを優先） */
async function j(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `リクエストに失敗しました（${res.status}）`);
  return data;
}

export function analyze({ jwa, pluginFiles }) {
  const fd = new FormData();
  fd.append('jwa', jwa);
  (pluginFiles || []).forEach((f) => fd.append('plugin', f));
  return fetch(`${BASE}/api/analyze`, { method: 'POST', body: fd }).then(j);
}

/** ローカルパスを入力にする（プロジェクトディレクトリまたは .jwa 単体） */
export function analyzeProject({ path: p }) {
  return fetch(`${BASE}/api/analyze-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: p }),
  }).then(j);
}

/** ローカルディレクトリを閲覧する */
export function listDir(p) {
  return fetch(`${BASE}/api/fs/list?path=${encodeURIComponent(p || '')}`).then(j);
}

/** パス内に何があるかを事前確認する */
export function discover(p) {
  return fetch(`${BASE}/api/fs/discover?path=${encodeURIComponent(p)}`).then(j);
}

export function listRuns() {
  return fetch(`${BASE}/api/runs`).then(j);
}

export function getRun(id) {
  return fetch(`${BASE}/api/runs/${id}`).then(j);
}

export function downloadUrl(id, name) {
  return `${BASE}/api/runs/${id}/download/${encodeURIComponent(name)}`;
}
