/**
 * Sync picks and plan between devices through one secret GitHub Gist (web mode only).
 * The user makes a classic token with only the "gist" scope; it stays in this browser.
 * Gist: description "trip-planner-sync", file "trip-data.json" = { version, updatedAt, planT, plan, picks }.
 * Claude reads the same gist (a secret gist is readable by its id).
 */
const KEY = "trip-sync";
export const SYNC_FILE = "trip-data.json";
const DESC = "trip-planner-sync";
const API = "https://api.github.com";

function readCfg() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

function writeCfg(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch (e) {
    /* private window: sync stays off after reload */
  }
}

async function api(token, path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {})
    }
  });
  if (res.status === 401) throw new Error("토큰이 맞지 않거나 만료됐습니다");
  if (res.status === 403 || res.status === 404) throw new Error("토큰에 gist 권한이 없습니다");
  if (!res.ok) throw new Error(`GitHub 응답 ${res.status}`);
  return res.json();
}

async function fileOf(token, gist) {
  const f = gist.files?.[SYNC_FILE];
  if (!f) return null;
  let text = f.content;
  if (f.truncated && f.raw_url) {
    const r = await fetch(f.raw_url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
    text = await r.text();
  }
  try {
    return JSON.parse(text || "null");
  } catch (e) {
    return null;
  }
}

export const sync = {
  config() {
    return readCfg();
  },
  enabled() {
    const c = readCfg();
    return Boolean(c.token && c.gistId);
  },

  /** Find this user's sync gist (so a second device with the same token joins it), or make one. */
  async connect(token, initialData) {
    token = String(token || "").trim();
    if (!token) throw new Error("토큰을 넣어 주세요");
    let gistId = null;
    for (let page = 1; page <= 5 && !gistId; page++) {
      const list = await api(token, `/gists?per_page=100&page=${page}`);
      const hit = list.find((g) => g.description === DESC && g.files && g.files[SYNC_FILE]);
      if (hit) gistId = hit.id;
      if (list.length < 100) break;
    }
    if (!gistId) {
      const made = await api(token, "/gists", {
        method: "POST",
        body: JSON.stringify({
          description: DESC,
          public: false,
          files: { [SYNC_FILE]: { content: JSON.stringify(initialData, null, 1) } }
        })
      });
      gistId = made.id;
    }
    writeCfg({ token, gistId });
    return gistId;
  },

  disconnect() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* nothing to remove */
    }
  },

  async pull() {
    const { token, gistId } = readCfg();
    const gist = await api(token, `/gists/${gistId}`);
    return fileOf(token, gist);
  },

  async push(dataObj) {
    const { token, gistId } = readCfg();
    await api(token, `/gists/${gistId}`, {
      method: "PATCH",
      body: JSON.stringify({ files: { [SYNC_FILE]: { content: JSON.stringify(dataObj, null, 1) } } })
    });
  }
};

/** Merge two pick maps: for each id the entry with the later time wins. */
export function mergePicks(a, b) {
  const out = { ...(a || {}) };
  for (const [id, v] of Object.entries(b || {})) {
    const cur = out[id];
    if (!cur || (v?.t || 0) > (cur?.t || 0)) out[id] = v;
  }
  return out;
}
