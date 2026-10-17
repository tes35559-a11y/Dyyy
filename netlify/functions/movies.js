// netlify/functions/movies.js
// Home + Search hybrid — JansenFlix + MovieZone + Cinevu + TMDB
// Creator: @Zerozx
// Chanel: https://whatsapp.com/channel/0029Vb7oMPtEgGfH0ngzXu1o

const https = require("https");
const zlib = require("zlib");

const BASE_JANSEN = "https://jansenflix.biz.id";
const BASE_CINEVU_WEB = "https://cinevu.icu";
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

/* =========================================================
   HELPER
   ========================================================= */
function cleanText(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function tmdbImage(path, size = "w500") {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${TMDB_IMG}/${size}${path}`;
}

const TYPE_ALIAS = {
  all: 0, movie: 1, movies: 1, film: 1,
  series: 2, tv: 2, show: 2, shows: 2,
  short: 7, shortdrama: 7
};

function resolveTypeId(input) {
  if (input == null || input === "") return 0;
  if (/^\d+$/.test(input)) return Number(input);
  return TYPE_ALIAS[String(input).toLowerCase()] ?? 0;
}

function slugFromInput(input) {
  let path = cleanText(input);
  if (path.startsWith("http")) {
    try { path = new URL(path).pathname; } catch {}
  }
  return path.replace(/^\/|\/$/g, "").split("/").pop();
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

function normalizeJansenItem(item) {
  return {
    subjectId: item?.subjectId ?? null,
    subjectType: item?.subjectType ?? null,
    typeLabel: item?.typeLabel ?? null,
    releaseDate: item?.releaseDate ?? null,
    year: item?.year ?? null,
    durationFormatted: item?.durationFormatted ?? null,
    genre: Array.isArray(item?.genre) ? item.genre : [],
    stillsUrl: item?.stillsUrl || null,
    imdbRating: item?.imdbRating ?? null,
    detailPath: item?.detailPath ?? null,

    title: cleanText(item?.title) || null,
    slug: item?.detailPath ?? null,
    poster: item?.coverUrl ?? null,
    coverUrl: item?.coverUrl ?? null,
    backdrop: item?.stillsUrl || item?.coverUrl || null,
    rating: item?.imdbRating ?? null,
    synopsis: cleanText(item?.description) || "Deskripsi belum tersedia.",
    overview: cleanText(item?.description) || "Deskripsi belum tersedia.",
    description: cleanText(item?.description) || "Deskripsi belum tersedia.",
    type: item?.typeLabel || (item?.subjectType === 1 ? "Film" : "Serial"),
    url: item?.detailPath ? `${BASE_JANSEN}/detail/${item.detailPath}` : null,
    _source: "jansen"
  };
}

async function jansenHome() {
  const data = await jansenFetchNextData(`/index.json`);
  const props = data?.pageProps ?? {};
  const hero = props.heroItem ? normalizeJansenItem(props.heroItem) : null;
  const categories = Array.isArray(props.categories)
    ? props.categories.map((cat) => ({
        title: cleanText(cat?.title) || null,
        items: Array.isArray(cat?.items) ? cat.items.map(normalizeJansenItem) : []
      }))
    : [];

  const popular = [], latest = [], upcoming = [], topRated = [], trending = [];
  categories.forEach((cat) => {
    const t = (cat.title || "").toLowerCase();
    if (t.includes("trending") || t.includes("populer") || t.includes("ramai")) {
      popular.push(...cat.items); trending.push(...cat.items);
    } else if (t.includes("terbaru") || t.includes("baru") || t.includes("update")) {
      latest.push(...cat.items);
    } else if (t.includes("segera") || t.includes("coming") || t.includes("upcoming")) {
      upcoming.push(...cat.items);
    } else if (t.includes("rating") || t.includes("top") || t.includes("kritikus")) {
      topRated.push(...cat.items);
    }
  });
  if (!popular.length && categories[0]) popular.push(...categories[0].items);
  if (!latest.length && categories[1]) latest.push(...categories[1].items);
  if (!topRated.length && categories[2]) topRated.push(...categories[2].items);
  if (!upcoming.length && categories[3]) upcoming.push(...categories[3].items);

  return { hero, popular, latest, upcoming, topRated, trending };
}

async function jansenSearch(q, type = 0, page = 1) {
  const params = new URLSearchParams({
    q: cleanText(q),
    type: String(resolveTypeId(type)),
    page: String(page)
  });
  const data = await jansenFetchJson(`${BASE_JANSEN}/api/search?${params.toString()}`);
  return {
    query: data?.query ?? q,
    count: data?.count ?? 0,
    data: Array.isArray(data?.data) ? data.data.map(normalizeJansenItem) : []
  };
}

async function jansenDetail(slugOrUrl) {
  const slug = slugFromInput(slugOrUrl);
  const data = await jansenFetchNextData(`/detail/${encodeURIComponent(slug)}.json?path=${encodeURIComponent(slug)}`);
  const detail = data?.pageProps?.detail;
  if (!detail) throw new Error(`Detail tidak ditemukan untuk "${slug}"`);
  return normalizeJansenItem(detail);
}

/* =========================================================
   TMDB
   ========================================================= */
async function tmdbFetch(path, params = {}, timeoutMs = 20000) {
  const url = new URL(`${BASE_TMDB}${path}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
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
    const text = await res.text();
    try { return JSON.parse(text); } catch { throw new Error("Bukan JSON"); }
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTmdbItem(item) {
  if (!item) return null;
  const isTv = item.media_type === "tv" || (!item.title && item.name);
  const title = item.title || item.name || item.original_title || item.original_name;
  const releaseDate = item.release_date || item.first_air_date || null;
  const poster = tmdbImage(item.poster_path, "w500");

  return {
    id: item.id ?? null,
    tmdbId: item.id ?? null,
    mediaType: isTv ? "tv" : "movie",
    type: isTv ? "TV" : "Film",

    title: cleanText(title) || null,
    originalTitle: cleanText(item.original_title || item.original_name) || null,
    overview: cleanText(item.overview) || "Deskripsi belum tersedia.",
    releaseDate,
    year: releaseDate ? String(releaseDate).slice(0, 4) : null,
    rating: Number.isFinite(item.vote_average) ? Math.round(item.vote_average * 100) / 100 : null,
    voteCount: Number.isFinite(item.vote_count) ? item.vote_count : null,
    popularity: Number.isFinite(item.popularity) ? item.popularity : null,
    genreIds: Array.isArray(item.genre_ids) ? item.genre_ids : [],

    poster,
    posterPath: item.poster_path ?? null,
    coverUrl: poster,
    backdrop: tmdbImage(item.backdrop_path, "w1280") || poster,
    backdropPath: item.backdrop_path ?? null,

    slug: item.id ? `movie-${item.id}` : null,
    synopsis: cleanText(item.overview) || "Deskripsi belum tersedia.",
    description: cleanText(item.overview) || "Deskripsi belum tersedia.",
    url: item.id ? `https://www.themoviedb.org/${isTv ? "tv" : "movie"}/${item.id}` : null,
    _source: "tmdb"
  };
}

async function tmdbHome() {
  const [trending, popular, topRated, upcoming, nowPlaying, tvPopular, tvAiring] = await Promise.all([
    tmdbFetch("/trending/all/day").catch(() => null),
    tmdbFetch("/movie/popular").catch(() => null),
    tmdbFetch("/movie/top_rated").catch(() => null),
    tmdbFetch("/movie/upcoming").catch(() => null),
    tmdbFetch("/movie/now_playing").catch(() => null),
    tmdbFetch("/tv/popular").catch(() => null),
    tmdbFetch("/tv/airing_today").catch(() => null)
  ]);

  const pick = (data) => Array.isArray(data?.results) ? data.results.map(normalizeTmdbItem).filter(Boolean) : [];

  return {
    trending: pick(trending),
    popular: pick(popular),
    topRated: pick(topRated),
    upcoming: pick(upcoming),
    nowPlaying: pick(nowPlaying),
    tvPopular: pick(tvPopular),
    tvAiring: pick(tvAiring)
  };
}

async function tmdbSearch(q, type = "multi", page = 1) {
  const path = type === "tv" ? "/search/tv" : type === "movie" ? "/search/movie" : "/search/multi";
  const data = await tmdbFetch(path, { query: cleanText(q), page });
  const results = Array.isArray(data?.results) ? data.results.map(normalizeTmdbItem).filter(Boolean) : [];
  return {
    query: cleanText(q),
    count: results.length,
    totalPages: data?.total_pages ?? 1,
    data: results
  };
}

async function tmdbDetail(idOrSlug, type = "movie") {
  const id = String(idOrSlug || "").match(/(\d+)/)?.[1];
  if (!id) throw new Error("ID TMDB tidak ditemukan");
  const path = type === "tv" ? `/tv/${id}` : `/movie/${id}`;
  const data = await tmdbFetch(path, { append_to_response: "videos,credits,recommendations" });
  return normalizeTmdbItem(data);
}

/* =========================================================
   CINEVU
   ========================================================= */
const CINEVU_LISTS = {
  "movie-top": "Movie Top",
  "movie-theatres": "Movie Theatres",
  "movie-trending": "Movie Trending",
  "movie-popular": "Movie Popular",
  "movie-upcoming": "Movie Upcoming",
  "movie-nowplaying": "Movie Now Playing",
  "tv-top": "TV Top",
  "tv-trending": "TV Trending",
  "tv-popular": "TV Popular",
  "tv-airing": "TV Airing Today"
};

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

function normalizeCinevuItem(item) {
  const poster = tmdbImage(item?.poster, "w500");
  return {
    id: item?.id ?? null,
    tmdbId: item?.id ?? null,
    type: item?.type === "tv" ? "TV" : "Film",
    mediaType: item?.type ?? "movie",
    title: cleanText(item?.title) || null,
    date: item?.date ?? null,
    year: item?.date ? String(item.date).slice(0, 4) : null,
    poster,
    posterPath: item?.poster ?? null,
    coverUrl: poster,
    backdrop: poster,
    rating: Number.isFinite(item?.rating) ? item.rating : null,
    synopsis: cleanText(item?.overview) || "Deskripsi belum tersedia.",
    overview: cleanText(item?.overview) || "Deskripsi belum tersedia.",
    description: cleanText(item?.overview) || "Deskripsi belum tersedia.",
    slug: item?.id ? `movie-${item.id}` : null,
    url: item?.id ? `${BASE_CINEVU_WEB}/movie/${item.id}` : null,
    _source: "cinevu"
  };
}

async function cinevuCatalog(list = "movie-top") {
  if (!CINEVU_LISTS[list]) throw new Error(`List tidak dikenal: ${list}`);
  const url = `${BASE_CINEVU_WEB}/api/catalog?list=${encodeURIComponent(list)}`;
  const data = await cinevuFetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.map(normalizeCinevuItem);
}

async function cinevuSearch(q, type = "multi", page = 1) {
  const params = new URLSearchParams({
    query: cleanText(q),
    type: ["multi", "movie", "tv"].includes(type) ? type : "multi",
    page: String(page)
  });
  const url = `${BASE_CINEVU_WEB}/api/search?${params.toString()}`;
  const data = await cinevuFetchJson(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  return {
    query: cleanText(q),
    count: results.length,
    totalPages: data?.total_pages ?? 1,
    data: results.map(normalizeCinevuItem)
  };
}

async function cinevuHome() {
  const [top, trending, popular, upcoming, nowPlaying, tvTop, tvAiring] = await Promise.all([
    cinevuCatalog("movie-top").catch(() => []),
    cinevuCatalog("movie-trending").catch(() => []),
    cinevuCatalog("movie-popular").catch(() => []),
    cinevuCatalog("movie-upcoming").catch(() => []),
    cinevuCatalog("movie-nowplaying").catch(() => []),
    cinevuCatalog("tv-top").catch(() => []),
    cinevuCatalog("tv-airing").catch(() => [])
  ]);
  return { top, trending, popular, upcoming, nowPlaying, tvTop, tvAiring };
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

function normalizeMovieZoneItem(item) {
  return {
    subjectId: item?.id ?? null,
    subjectType: item?.type ?? null,
    typeLabel: item?.type ?? null,
    releaseDate: item?.releaseDate ?? null,
    year: item?.year ?? null,
    durationFormatted: item?.duration ?? null,
    genre: Array.isArray(item?.genres) ? item.genres : (Array.isArray(item?.genre) ? item.genre : []),
    imdbRating: item?.rating ?? null,
    detailPath: item?.slug ?? null,

    title: cleanText(item?.title) || null,
    slug: item?.slug ?? null,
    poster: item?.poster ?? null,
    coverUrl: item?.poster ?? null,
    backdrop: item?.backdrop || item?.poster || null,
    rating: item?.rating ?? null,
    synopsis: cleanText(item?.synopsis || item?.overview || item?.description) || "Deskripsi belum tersedia.",
    overview: cleanText(item?.synopsis || item?.overview || item?.description) || "Deskripsi belum tersedia.",
    description: cleanText(item?.synopsis || item?.overview || item?.description) || "Deskripsi belum tersedia.",
    type: item?.type || "Movie",
    url: item?.slug ? `https://moviezone.web.id/detail/${item.slug}` : null,
    _source: "moviezone"
  };
}

async function mzHome() {
  const [popular, latest, upcoming, topRated, trending] = await Promise.all([
    mzGet(`/popular?page=1&type=all`).catch(() => []),
    mzGet(`/latest?type=all`).catch(() => []),
    mzGet(`/upcoming`).catch(() => []),
    mzGet(`/top-rated?type=movie&page=1`).catch(() => []),
    mzGet(`/trending`).catch(() => [])
  ]);

  const pick = (arr) => Array.isArray(arr) ? arr.map(normalizeMovieZoneItem) : [];

  return {
    popular: pick(popular),
    latest: pick(latest),
    upcoming: pick(upcoming),
    topRated: pick(topRated),
    trending: pick(trending)
  };
}

async function mzSearch(q) {
  const data = await mzGet(`/search?q=${encodeURIComponent(q)}&page=1`);
  const list = Array.isArray(data) ? data : (data.results || data.data || []);
  return {
    query: q,
    count: list.length,
    data: list.map(normalizeMovieZoneItem)
  };
}

async function mzDetail(slugOrUrl) {
  const slug = slugFromInput(slugOrUrl);
  const raw = await mzGet(`/detail/${encodeURIComponent(slug)}`);
  const r = Array.isArray(raw) ? raw[0] || {} : raw;
  return normalizeMovieZoneItem(r);
}

/* =========================================================
   HYBRID HELPERS
   ========================================================= */
function dedupByTitle(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = (item.title || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function interleaveN(...arrays) {
  const result = [];
  const maxLen = Math.max(...arrays.map(a => a.length));
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (arr[i]) result.push(arr[i]);
    }
  }
  return result;
}

/* =========================================================
   HANDLER NETLIFY
   ========================================================= */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const params = event.queryStringParameters || {};
  const action = (params.action || "popular").toLowerCase();
  const page = Number(params.page) || 1;
  const type = params.type || "all";

  try {
    let results;

    switch (action) {
      case "popular":
      case "home": {
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenHome().catch(() => null),
          mzHome().catch(() => null),
          cinevuHome().catch(() => null),
          tmdbHome().catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.popular || [],
          moviezone?.popular || [],
          cinevu?.trending || [],
          tmdb?.popular || []
        ));
        break;
      }

      case "trending": {
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenHome().catch(() => null),
          mzHome().catch(() => null),
          cinevuHome().catch(() => null),
          tmdbHome().catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.trending || [],
          moviezone?.trending || [],
          cinevu?.trending || [],
          tmdb?.trending || []
        ));
        break;
      }

      case "latest": {
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenHome().catch(() => null),
          mzHome().catch(() => null),
          cinevuHome().catch(() => null),
          tmdbHome().catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.latest || [],
          moviezone?.latest || [],
          cinevu?.popular || [],
          tmdb?.nowPlaying || []
        ));
        break;
      }

      case "upcoming": {
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenHome().catch(() => null),
          mzHome().catch(() => null),
          cinevuHome().catch(() => null),
          tmdbHome().catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.upcoming || [],
          moviezone?.upcoming || [],
          cinevu?.upcoming || cinevu?.nowPlaying || [],
          tmdb?.upcoming || []
        ));
        break;
      }

      case "top-rated": {
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenHome().catch(() => null),
          mzHome().catch(() => null),
          cinevuHome().catch(() => null),
          tmdbHome().catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.topRated || [],
          moviezone?.topRated || [],
          cinevu?.top || [],
          tmdb?.topRated || []
        ));
        break;
      }

      case "catalog": {
        const list = params.list || "movie-top";
        results = await cinevuCatalog(list);
        break;
      }

      case "catalogs": {
        const lists = Object.keys(CINEVU_LISTS);
        const all = {};
        for (const list of lists) {
          try { all[list] = await cinevuCatalog(list); }
          catch { all[list] = []; }
        }
        results = all;
        break;
      }

      case "search": {
        if (!params.q) {
          return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              status: false, code: 401, creator: "@Zerozx",
              message: "Query pencarian tidak boleh kosong."
            })
          };
        }
        const searchType = type === "tv" ? "tv" : type === "movie" ? "movie" : "multi";
        const [jansen, moviezone, cinevu, tmdb] = await Promise.all([
          jansenSearch(params.q, type, page).catch(() => null),
          mzSearch(params.q).catch(() => null),
          cinevuSearch(params.q, searchType, page).catch(() => null),
          tmdbSearch(params.q, searchType, page).catch(() => null)
        ]);
        results = dedupByTitle(interleaveN(
          jansen?.data || [],
          moviezone?.data || [],
          cinevu?.data || [],
          tmdb?.data || []
        ));
        break;
      }

      case "detail":
      case "stream": {
        if (!params.slug) {
          return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              status: false, code: 401, creator: "@Zerozx",
              message: "Slug film tidak boleh kosong."
            })
          };
        }
        const settled = await Promise.allSettled([
          jansenDetail(params.slug),
          mzDetail(params.slug),
          tmdbDetail(params.slug, type === "tv" ? "tv" : "movie")
        ]);
        const jd = settled[0].status === "fulfilled" ? settled[0].value : null;
        const md = settled[1].status === "fulfilled" ? settled[1].value : null;
        const td = settled[2].status === "fulfilled" ? settled[2].value : null;

        if (!jd && !md && !td) {
          return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({
              status: false, code: 404, creator: "@Zerozx",
              message: "Film tidak ditemukan."
            })
          };
        }
        results = jd || md || td;
        break;
      }

      default:
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            status: false, code: 400, creator: "@Zerozx",
            message: "Action tidak dikenal. Gunakan: popular, trending, latest, upcoming, top-rated, catalog, catalogs, search, detail."
          })
        };
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=1800" },
      body: JSON.stringify({
        status: true,
        code: 200,
        creator: "@Zerozx",
        results
      })
    };
  } catch (error) {
    console.error("❌ Movies API error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        status: false,
        code: 500,
        creator: "@Zerozx",
        message: error.message || "Internal error"
      })
    };
  }
};