// Proxy ke RanggaCode (donghub) + ZelAPI (anibiplay) — apikey otomatis disisipkan di server,
// jadi tidak perlu dikirim dari browser. Untuk endpoint yang butuh parameter target
// (search/detail/watch) kita coba beberapa nama parameter yang umum dipakai sampai
// salah satu berhasil, karena dokumentasi resmi kedua API ini tidak dipublikasikan.

const DONGHUB_BASE = 'https://api.ranggacode.my.id/api/search/';
const DONGHUB_KEY = 'rc_769c9bd203e3d6d28ac8649b';
const DONGHUB_PLAIN = ['donghub-home', 'donghub-new', 'donghub-completed', 'donghub-schedule'];
const DONGHUB_TARGET = ['donghub-search', 'donghub-detail', 'donghub-watch'];

const ANIBI_URL = 'https://zelapi.eu.cc/anime/anibiplay/search';
const ANIBI_KEY = 'zelapi-0d3925e67885404e';

const TIMEOUT_MS = 20000;

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' },
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    const ok = res.ok && json && json.status !== false && !(json && json.error);
    return { ok, status: res.status, json, text };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 0, json: null, text: String(e) };
  } finally {
    clearTimeout(t);
  }
}

function hasUsefulData(json) {
  if (!json || typeof json !== 'object') return false;
  const s = JSON.stringify(json);
  return s.length > 40; // respon non-trivial
}

// Coba beberapa nama parameter sampai salah satu memberi respons valid.
async function tryVariants(baseUrl, apikey, value, paramNames, extra = {}) {
  let last = null;
  for (const name of paramNames) {
    const qs = new URLSearchParams({ apikey, [name]: value, ...extra }).toString();
    const r = await fetchJson(`${baseUrl}?${qs}`);
    last = r;
    if (r.ok && hasUsefulData(r.json)) return r;
  }
  return last || { ok: false, status: 502, json: null, text: 'no variant matched' };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=60',
  };
  const qs = { ...(event.queryStringParameters || {}) };
  const ep = String(qs.ep || '');
  delete qs.ep;

  try {
    // ── Donghub: endpoint tanpa target (home/new/completed/schedule) ──
    if (DONGHUB_PLAIN.includes(ep)) {
      const params = new URLSearchParams({ apikey: DONGHUB_KEY, ...qs }).toString();
      const r = await fetchJson(`${DONGHUB_BASE}${ep}?${params}`);
      return { statusCode: r.ok ? 200 : (r.status || 502), headers, body: r.text || JSON.stringify({ error: 'gagal memuat data' }) };
    }

    // ── Donghub: endpoint dengan target (search/detail/watch) ──
    if (DONGHUB_TARGET.includes(ep)) {
      const value = qs.target || qs.q || qs.url || '';
      if (!value) return { statusCode: 400, headers, body: JSON.stringify({ error: 'parameter target kosong' }) };
      const names = ep === 'donghub-search'
        ? ['keyword', 'query', 'q', 'search', 's', 'title']
        : ['url', 'link', 'href', 'slug', 'episode_url', 'episodeUrl'];
      const r = await tryVariants(`${DONGHUB_BASE}${ep}`, DONGHUB_KEY, value, names, ep === 'donghub-search' && qs.page ? { page: qs.page } : {});
      return { statusCode: r.ok ? 200 : (r.status || 502), headers, body: r.text || JSON.stringify({ error: 'API donghub tidak merespons untuk permintaan ini' }) };
    }

    // ── ZelAPI anibiplay (sumber pencarian tambahan) ──
    if (ep === 'anibi-search') {
      const value = qs.target || qs.q || '';
      if (!value) return { statusCode: 400, headers, body: JSON.stringify({ error: 'parameter target kosong' }) };
      const r = await tryVariants(ANIBI_URL, ANIBI_KEY, value, ['q', 'query', 'keyword', 'search', 's', 'title']);
      return { statusCode: r.ok ? 200 : (r.status || 502), headers, body: r.text || JSON.stringify({ error: 'API anibiplay tidak merespons untuk permintaan ini' }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'endpoint tidak dikenal' }) };
  } catch (e) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'gagal menghubungi API: ' + e.message }) };
  }
};
