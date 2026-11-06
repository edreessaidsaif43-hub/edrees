const CHROME_ID = 'fgdlajfbjmobhaeabmgdfgmecpjjlmng';
const FIREFOX_ID = 3066318;
const STORE_CONFIG = Object.freeze({
  chrome: {
    // A high browser version requests the store release without an old-browser compatibility ceiling.
    url: 'https://clients2.google.com/service/update2/crx?response=updatecheck&prodversion=9999.0.0.0&acceptformat=crx2%2Ccrx3&x=id%3D' + CHROME_ID + '%26uc',
    storeUrl: 'https://chromewebstore.google.com/detail/' + CHROME_ID,
    accept: 'application/xml, text/xml',
    maxBytes: 64 * 1024,
  },
  firefox: {
    url: 'https://addons.mozilla.org/api/v5/addons/addon/' + FIREFOX_ID + '/',
    storeUrl: 'https://addons.mozilla.org/firefox/addon/' + encodeURIComponent('التحضير-الذكي-للمعلم-العماني') + '/',
    accept: 'application/json',
    maxBytes: 512 * 1024,
  },
});

function upstreamError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function normalizeVersion(value) {
  if (typeof value !== 'string') return null;
  const version = value.trim();
  if (version.length > 64 || !/^\d+(?:\.\d+){0,3}$/.test(version)) return null;
  return version.split('.').every(part => Number.isSafeInteger(Number(part)) && Number(part) <= 65535)
    ? version : null;
}

function xmlAttribute(attributes, name) {
  const pattern = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*([\"\x27])([^\"\x27]*)\\1(?=\\s|$)', 'g');
  const values = [...attributes.matchAll(pattern)];
  return values.length === 1 ? values[0][2] : null;
}

export function parseChromeVersion(text) {
  if (!/<gupdate\b[^>]*>[\s\S]*<\/gupdate>\s*$/.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) {
    throw upstreamError('invalid_upstream_response');
  }
  const apps = [...text.matchAll(/<app\b([^>]*)>([\s\S]*?)<\/app>/g)]
    .filter(match => xmlAttribute(match[1], 'appid') === CHROME_ID);
  if (apps.length !== 1 || xmlAttribute(apps[0][1], 'status') !== 'ok') {
    throw upstreamError('invalid_upstream_response');
  }
  const updates = [...apps[0][2].matchAll(/<updatecheck\b([^>]*?)(?:\/>|>)/g)];
  if (updates.length !== 1 || xmlAttribute(updates[0][1], 'status') !== 'ok') {
    throw upstreamError('invalid_upstream_response');
  }
  const version = normalizeVersion(xmlAttribute(updates[0][1], 'version'));
  if (!version) throw upstreamError('invalid_upstream_response');
  return version;
}

export function parseFirefoxVersion(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw upstreamError('invalid_upstream_response'); }
  const version = normalizeVersion(data?.current_version?.version);
  if (data?.id !== FIREFOX_ID || data?.is_disabled === true || data?.is_disabled_by_mozilla === true || !version) {
    throw upstreamError('invalid_upstream_response');
  }
  return version;
}

async function readBoundedText(response, maxBytes) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    if (response.body) response.body.cancel().catch(() => {});
    throw upstreamError('upstream_response_too_large');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw upstreamError('invalid_upstream_response');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw upstreamError('upstream_response_too_large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function fetchStoreVersion(store, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const operation = (async () => {
    const response = await fetchImpl(store.url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: store.accept },
    });
    if (!response.ok) {
      if (response.body) response.body.cancel().catch(() => {});
      throw upstreamError('upstream_http_error');
    }
    const text = await readBoundedText(response, store.maxBytes);
    return store === STORE_CONFIG.chrome ? parseChromeVersion(text) : parseFirefoxVersion(text);
  })();
  const deadline = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      reject(upstreamError('upstream_timeout'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export function createNoorExtensionVersionsHandler({ fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 6500, cacheTtlMs = 5 * 60 * 1000 } = {}) {
  const states = {
    chrome: { result: null, expiresAt: 0, inFlight: null },
    firefox: { result: null, expiresAt: 0, inFlight: null },
  };

  function getStore(name) {
    const state = states[name];
    const store = STORE_CONFIG[name];
    if (state.result && now() < state.expiresAt) return Promise.resolve(state.result);
    if (state.inFlight) return state.inFlight;
    state.inFlight = (async () => {
      try {
        const version = await fetchStoreVersion(store, fetchImpl, timeoutMs);
        const checked = now();
        const result = { version, storeUrl: store.storeUrl, checkedAt: new Date(checked).toISOString(), error: null };
        state.result = result;
        state.expiresAt = checked + cacheTtlMs;
        return result;
      } catch (error) {
        const knownErrors = new Set(['invalid_upstream_response', 'upstream_response_too_large', 'upstream_http_error', 'upstream_timeout']);
        return { version: null, storeUrl: store.storeUrl, checkedAt: null, error: knownErrors.has(error?.code) ? error.code : 'upstream_unavailable' };
      } finally {
        state.inFlight = null;
      }
    })();
    return state.inFlight;
  }

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const [chrome, firefox] = await Promise.all([getStore('chrome'), getStore('firefox')]);
    return res.status(chrome.version || firefox.version ? 200 : 503).json({ chrome, firefox });
  };
}

export default createNoorExtensionVersionsHandler();
