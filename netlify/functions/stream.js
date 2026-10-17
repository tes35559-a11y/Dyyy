// netlify/functions/stream.js
// Stream endpoint — hybrid 3 sumber (Jansen + MovieZone + Cinevu multi-source)
// Creator: @Zerozx
// Chanel: https://whatsapp.com/channel/0029Vb7oMPtEgGfH0ngzXu1o

const https = require("https");
const zlib = require("zlib");

const BASE_JANSEN = "https://jansenflix.biz.id";
const BASE_CINEVU_WEB = "https://cinevu.icu";
const BASE_CINEVU_API = "https://api.cinevu.icu";
const BASE_TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "603b3a029ec4f3222d788b8de4945dba";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const CINEVU_SOURCES = ["gucci", "prada", "versace", "dior", "chanel", "hermes", "default"];

/* =========================================================
   HELPER
   ========================================================= */
function slugFromInput(input) {
  let path = String(input || "").trim();
  if (path.startsWith("http")) {
    try { path = new URL(path).pathname; } catch {}
  }
  return path.replace(/^\/|\/$/g, "").split("/").pop();
}

function extractTmdbId(slug) {
  const match = String(slug || "").match(/(\d{4,7})/);
  return match ? match[1] : null;
}

function tmdbImage(path, size = "w500") {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}/${size}${path}`;
}

/* =========================================================
   TMDB (metadata only, bukan stream)
   ========================================================= */
async function tmdbFetch(path, params = {}, timeoutMs = 15000) {
  const url = new URL(`${BASE_TMDB}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url.href, {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        "accept-language": "id-ID,id;q=0.9,en;q=0.8"
      },
      redirect: "follow",
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function tmdbGetMeta(id, type = "movie") {
  const path = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const data = await tmdbFetch(path, { append_to_response: "videos" });
  return {
    title: data?.title || data?.name || "",
    poster: tmdbImage(data?.poster_path, "w500") || "",
    backdrop: tmdbImage(data?.backdrop_path, "w1280") || "",
    synopsis: data?.overview || "",
    year: (data?.release_date || data?.first_air_date || "").slice(0, 4) || null,
    rating: data?.vote_average || null,
    type: type === "tv" ? "Serial" : "Film",
    duration: data?.runtime ? `${data.runtime} min` : null,
    genres: Array.isArray(data?.genres) ? data.genres.map(g => g.name) : [],
    detail: data
  };
}

/* =========================================================
   JANSENFLIX
   ========================================================= */
let JANSEN_BUILD_ID = "NQmTt0lLPbvsfqA-3V9iX";
let jansenLastFetch = 0;

async function jansenFetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json, text/plain, */*",
        "accept-language": "id-ID,id;q=0.9,en;q=0.8",
        "x-nextjs-data": "1",
        referer: `${BASE_JANSEN}/`
      },
      redirect: "follow",
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error("Bukan JSON"); }
  } finally {
    clearTimeout(timer);
  }
}

async function jansenRefreshBuildId() {
  const now = Date.now();
  if (now - jansenLastFetch < 60000) return false;
  jansenLastFetch = now;
  try {
    const res = await fetch(`${BASE_JANSEN}/`, { headers: { "user-agent": UA } });
    const html = await res.text();
    const m = html.match(/"buildId":"([^"]+)"/);
    if (m && m[1]) { JANSEN_BUILD_ID = m[1]; return true; }
  } catch {}
  return false;
}

async function jansenFetchNextData(path) {
  try {
    return await jansenFetchJson(`${BASE_JANSEN}/_next/data/${JANSEN_BUILD_ID}${path}`);
  } catch (e) {
    const refreshed = await jansenRefreshBuildId();
    if (refreshed) {
      return await jansenFetchJson(`${BASE_JANSEN}/_next/data/${JANSEN_BUILD_ID}${path}`);
    }
    throw e;
  }
}

async function jansenGetStream(slugOrUrl) {
  const slug = slugFromInput(slugOrUrl);
  const data = await jansenFetchNextData(`/play/${encodeURIComponent(slug)}.json?slug=${encodeURIComponent(slug)}`);
  const props = data?.pageProps ?? {};
  if (!props.stream) throw new Error(`Tidak ada stream untuk "${slug}"`);

  const stream = props.stream;
  const detail = props.detail || {};
  const streams = Array.isArray(stream.streams) ? stream.streams : [];

  const servers = streams.map((s, i) => ({
    server: s.quality || s.format || `Server ${i + 1}`,
    url: s.proxyUrl ? `${BASE_JANSEN}${s.proxyUrl}` : (s.url || "")
  })).filter(s => s.url);

  return {
    source: "jansen",
    title: stream.title || detail.title || "",
    poster: detail.coverUrl || "",
    backdrop: detail.coverUrl || "",
    synopsis: detail.description || "",
    year: detail.year || null,
    rating: detail.imdbRating || null,
    type: detail.typeLabel || (stream.isMovie ? "Film" : "Serial"),
    duration: detail.durationFormatted || null,
    genres: Array.isArray(detail.genre) ? detail.genre : [],
    servers,
    detail
  };
}

/* =========================================================
   CINEVU — MULTI SOURCE
   ========================================================= */
async function cinevuFetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json, text/plain, */*",
        "accept-language": "id-ID,id;q=0.9,en;q=0.8",
        origin: BASE_CINEVU_WEB,
        referer: `${BASE_CINEVU_WEB}/`
      },
      redirect: "follow",
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error("Bukan JSON"); }
  } finally {
    clearTimeout(timer);
  }
}

async function cinevuGetDetails(id, type = "movie") {
  const url = `${BASE_CINEVU_WEB}/api/details?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
  return await cinevuFetchJson(url);
}

async function cinevuGetStream(id, source = "gucci", type = "movie") {
  const url = `${BASE_CINEVU_API}/api/movie/${encodeURIComponent(id)}?source=${encodeURIComponent(source)}`;
  return await cinevuFetchJson(url);
}

async function cinevuGetAllStreams(id, type = "movie") {
  const results = await Promise.allSettled(
    CINEVU_SOURCES.map(src => cinevuGetStream(id, src, type))
  );

  const working = [];
  for (let i = 0; i < CINEVU_SOURCES.length; i++) {
    const src = CINEVU_SOURCES[i];
    const r = results[i];

    if (r.status === "fulfilled" && r.value?.url) {
      const data = r.value;
      working.push({
        source: src,
        label: src.charAt(0).toUpperCase() + src.slice(1),
        url: data.url,
        format: data.format,
        resolutions: data.resolutions,
        title: data.title,
        providerId: data.provider_id,
        matchMethod: data.match_method
      });

      if (Array.isArray(data.streams)) {
        data.streams.forEach((s, idx) => {
          if (s?.url && s.url !== data.url) {
            working.push({
              source: src,
              label: `${src.charAt(0).toUpperCase() + src.slice(1)} ${idx + 2}`,
              url: s.url,
              format: data.format,
              resolutions: s.resolutions,
              title: data.title
            });
          }
        });
      }
    }
  }
  return working;
}

async function cinevuGetStreamBySlug(slug) {
  const tmdbId = extractTmdbId(slug);
  if (!tmdbId) throw new Error("Tidak bisa extract TMDB ID dari slug");

  const cinevuStreams = await cinevuGetAllStreams(tmdbId, "movie");
  if (!cinevuStreams.length) throw new Error("Tidak ada stream di Cinevu");

  const servers = cinevuStreams.map(s => ({
    server: s.format ? `Cinevu ${s.label} (${s.format})` : `Cinevu ${s.label}`,
    url: s.url
  }));

  let detail = null;
  try { detail = await cinevuGetDetails(tmdbId, "movie"); } catch {}

  return {
    source: "cinevu",
    title: cinevuStreams[0]?.title || detail?.title || "",
    poster: tmdbImage(detail?.poster_path, "w500") || "",
    backdrop: tmdbImage(detail?.backdrop_path, "w1280") || "",
    synopsis: detail?.overview || "",
    year: detail?.release_date ? String(detail.release_date).slice(0, 4) : null,
    rating: detail?.vote_average || null,
    type: detail?.title ? "Movie" : "Series",
    duration: detail?.runtime ? `${detail.runtime} min` : null,
    genres: Array.isArray(detail?.genres) ? detail.genres.map(g => g.name) : [],
    servers,
    detail
  };
}

/* =========================================================
   MOVIEZONE
   ========================================================= */
const mzJar = new Map();
if (process.env.MZ_COOKIE) {
  process.env.MZ_COOKIE.split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) mzJar.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  });
}

function mzCookieHeader() {
  return [...mzJar].map(([k, v]) => `${k}=${v}`).join("; ");
}

function mzRequest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const h = {
      "User-Agent": UA,
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      ...headers
    };
    if (mzJar.size) h.Cookie = mzCookieHeader();

    const r = https.request({ hostname: "moviezone.web.id", path, method: "GET", headers: h }, (res) => {
      for (const c of res.headers["set-cookie"] || []) {
        const pair = c.split(";")[0];
        const i = pair.indexOf("=");
        if (i > 0) mzJar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        try {
          const enc = res.headers["content-encoding"];
          if (enc === "gzip") buf = zlib.gunzipSync(buf);
          else if (enc === "deflate") buf = zlib.inflateSync(buf);
          else if (enc === "br") buf = zlib.brotliDecompressSync(buf);
        } catch {}
        resolve({ status: res.statusCode, body: buf.toString() });
      });
    });
    r.setTimeout(15000, () => r.destroy(new Error("Timeout")));
    r.on("error", reject);
    r.end();
  });
}

let mzSessionReady = false;
async function mzInitSession() {
  if (mzSessionReady) return;
  await mzRequest("/", {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
  });
  mzSessionReady = true;
}

function mzApiHeaders() {
  return {
    "Accept": "*/*",
    "Referer": "https://moviezone.web.id/",
    "Origin": "https://moviezone.web.id",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin"
  };
}

function mzParse(res) {
  try { return JSON.parse(res.body); }
  catch { throw new Error(`Bukan JSON (HTTP ${res.status})`); }
}

function mzIsSessionError(j, res) {
  const msg = String((j && (j.message || j.error)) || "").toLowerCase();
  return msg.includes("sesi") || msg.includes("session") || res.status === 401 || res.status === 403;
}

async function mzGet(path) {
  if (!mzJar.size) await mzInitSession();
  let res = await mzRequest("/api/movies" + path, mzApiHeaders());
  let j = mzParse(res);
  if (mzIsSessionError(j, res)) {
    mzJar.clear();
    mzSessionReady = false;
    await mzInitSession();
    res = await mzRequest("/api/movies" + path, mzApiHeaders());
    j = mzParse(res);
  }
  if (res.status >= 400 || j.status === false) {
    throw new Error((j && (j.message || j.error)) || `HTTP ${res.status}`);
  }
  return j.results !== undefined ? j.results : j;
}

async function mzGetStream(slugOrUrl) {
  const slug = slugFromInput(slugOrUrl);
  const raw = await mzGet(`/detail/${encodeURIComponent(slug)}`);
  const r = Array.isArray(raw) ? raw[0] || {} : raw;

  const stream = r.stream && typeof r.stream === "object" ? r.stream : {};
  let servers = Array.isArray(stream.servers) ? stream.servers : [];
  if (!servers.length && Array.isArray(r.servers)) servers = r.servers;

  const normalizedServers = servers.map((s, i) => ({
    server: s.server || s.name || s.label || `Server ${i + 1}`,
    url: s.url || s.link || s.embed || ""
  })).filter(s => s.url);

  if (!normalizedServers.length && stream.primaryIframe) {
    normalizedServers.push({ server: "Server Utama", url: stream.primaryIframe });
  }

  return {
    source: "moviezone",
    title: r.title || r.name || "",
    poster: r.poster || "",
    backdrop: r.backdrop || r.banner || r.poster || "",
    synopsis: r.synopsis || r.overview || "",
    year: r.year || null,
    rating: r.rating || null,
    type: r.type || "Movie",
    duration: r.duration || null,
    genres: Array.isArray(r.genres) ? r.genres : (Array.isArray(r.genre) ? r.genre : []),
    servers: normalizedServers,
    detail: r
  };
}

/* =========================================================
   HYBRID FETCH — JANSEN + MOVIEZONE + CINEVU + TMDB (metadata)
   ========================================================= */
async function hybridFetch(slugOrUrl) {
  const slug = slugFromInput(slugOrUrl);
  const tmdbId = extractTmdbId(slug);

  const results = await Promise.allSettled([
    jansenGetStream(slug).catch(e => { console.warn("Jansen fail:", e.message); return null; }),
    mzGetStream(slug).catch(e => { console.warn("MovieZone fail:", e.message); return null; }),
    cinevuGetStreamBySlug(slug).catch(e => { console.warn("Cinevu fail:", e.message); return null; }),
    tmdbId ? tmdbGetMeta(tmdbId, "movie").catch(e => { console.warn("TMDB meta fail:", e.message); return null; }) : Promise.resolve(null)
  ]);

  const jansen = results[0].status === "fulfilled" ? results[0].value : null;
  const moviezone = results[1].status === "fulfilled" ? results[1].value : null;
  const cinevu = results[2].status === "fulfilled" ? results[2].value : null;
  const tmdb = results[3].status === "fulfilled" ? results[3].value : null;

  // Stream hanya dari Jansen, MovieZone, Cinevu (TMDB gak sediain stream)
  const streamsAvailable = jansen || moviezone || cinevu;

  if (!streamsAvailable && !tmdb) {
    throw new Error("Film tidak ditemukan di sumber manapun.");
  }

  // Metadata prioritas: TMDB → Jansen → Cinevu → MovieZone
  const meta = tmdb || jansen || cinevu || moviezone;

  const allServers = [];
  const seenUrls = new Set();

  const pushServers = (list) => {
    (list || []).forEach(s => {
      if (!s.url || seenUrls.has(s.url)) return;
      seenUrls.add(s.url);
      allServers.push(s);
    });
  };

  if (jansen) pushServers(jansen.servers);
  if (cinevu) pushServers(cinevu.servers);
  if (moviezone) pushServers(moviezone.servers);

  return {
    title: meta.title,
    poster: meta.poster,
    backdrop: meta.backdrop,
    synopsis: meta.synopsis,
    year: meta.year,
    rating: meta.rating,
    type: meta.type,
    duration: meta.duration,
    genres: meta.genres || [],
    servers: allServers,
    detail: meta.detail,
    hasStream: allServers.length > 0
  };
}

/* =========================================================
   HANDLER NETLIFY
   ========================================================= */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const params = event.queryStringParameters || {};
  const { id, type } = params;

  if (!id) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: false, code: 400, creator: "@Zerozx",
        message: "Parameter 'id' wajib diisi."
      })
    };
  }

  try {
    const data = await hybridFetch(id);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: true,
        code: 200,
        creator: "@Zerozx",
        results: {
          title: data.title,
          slug: id,
          type: data.type,
          year: data.year,
          rating: data.rating,
          poster: data.poster,
          backdrop: data.backdrop,
          synopsis: data.synopsis,
          overview: data.synopsis,
          description: data.synopsis,
          duration: data.duration,
          genres: data.genres,
          url: id
        },
        play: {
          id,
          type: type || "film",
          title: data.title,
          poster: data.poster,
          backdrop: data.backdrop,
          streams: {
            primaryIframe: data.servers[0]?.url || null,
            servers: data.servers
          }
        }
      })
    };
  } catch (error) {
    console.error("❌ Stream error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: false,
        code: 500,
        creator: "@Zerozx",
        message: error.message || "Gagal memuat stream."
      })
    };
  }
};