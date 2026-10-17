"use strict";

const API = "/api/movie2";
const view = document.getElementById("view");
const store = {
  get type() { return localStorage.getItem("dyy:type") || "all"; },
  set type(v) { localStorage.setItem("dyy:type", v); },
  get server() { return localStorage.getItem("dyy:server") || ""; },
  set server(v) { localStorage.setItem("dyy:server", v); },
  get noSandbox() { try { return JSON.parse(localStorage.getItem("dyy:nosandbox")) || []; } catch { return []; } },
  set noSandbox(v) { localStorage.setItem("dyy:nosandbox", JSON.stringify(v)); },
  get history() { try { return JSON.parse(localStorage.getItem("dyy:history")) || []; } catch { return []; } },
  set history(v) { localStorage.setItem("dyy:history", JSON.stringify(v.slice(0, 20))); },
};

const ROWS = [
  { action: "trending", title: "Lagi Trending", kicker: "Minggu ini" },
  { action: "popular", title: "Paling Populer", kicker: "Ramai ditonton" },
  { action: "latest", title: "Rilis Terbaru", kicker: "Baru tayang" },
  { action: "toprated", title: "Rating Tertinggi", kicker: "Pilihan kritikus" },
  { action: "upcoming", title: "Segera Tayang", kicker: "Coming soon" },
];

/* ---------- utilitas ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const isUrl = (u) => typeof u === "string" && /^https:\/\//i.test(u.trim());
const isSlug = (s) => /^(movie|tv)-\d+$/.test(s || "");
const typeLabel = (it) => (/^tv-/.test(it.slug) || /series/i.test(it.type) ? "Series" : "Film");

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
}

const cache = new Map();
async function api(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    let data;
    try { data = await res.json(); } catch { throw new Error("Respons server tidak valid"); }
    if (!res.ok || !data?.status) throw new Error(data?.message || "Gagal memuat data");
    return data;
  })();
  cache.set(url, p);
  p.catch(() => cache.delete(url));
  return p;
}

/* ---------- thumbnail anti-bug ----------
 * Gambar baru terlihat setelah benar-benar ter-load. Jika gagal, coba ukuran
 * TMDB lain, lalu tampilkan placeholder berisi judul (tidak ada ikon rusak). */
function tmdbVariants(url, sizes) {
  if (!isUrl(url)) return [];
  const m = url.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)[^/]+(\/.+)$/);
  if (!m) return [url];
  return [...new Set([...sizes.map((s) => m[1] + s + m[2]), url])];
}

function imgTag(url, alt, sizes, cls = "") {
  const list = tmdbVariants(url, sizes);
  if (!list.length) return "";
  const [first, ...rest] = list;
  return `<img class="${cls}" src="${esc(first)}" data-fallbacks="${esc(rest.join("|"))}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function posterFrame(it, sizes = ["w342", "w500"]) {
  const initials = esc((it.title || "?").trim().slice(0, 1).toUpperCase());
  return `<div class="poster">
    <div class="poster-ph" aria-hidden="true"><b>${initials}</b><span>${esc(it.title || "Tanpa judul")}</span></div>
    ${imgTag(it.poster, it.title || "Poster", sizes)}
  </div>`;
}

document.addEventListener("load", (e) => {
  if (e.target.tagName === "IMG") e.target.classList.add("loaded");
}, true);

document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.hasAttribute("data-fallbacks")) return;
  const rest = img.dataset.fallbacks ? img.dataset.fallbacks.split("|") : [];
  if (rest.length) {
    img.dataset.fallbacks = rest.slice(1).join("|");
    img.src = rest[0];
  } else {
    img.remove();
  }
}, true);

// Gambar yang sudah ada di cache browser bisa selesai sebelum listener terpasang.
function markLoaded(scope) {
  scope.querySelectorAll("img").forEach((img) => {
    if (img.complete && img.naturalWidth > 0) img.classList.add("loaded");
  });
}

/* ---------- komponen ---------- */
function card(it, i = 0) {
  const rating = parseFloat(it.rating);
  return `<a class="card" href="#/title/${esc(it.slug)}" style="--i:${Math.min(i, 12)}">
    ${posterFrame(it)}
    <span class="badge">${typeLabel(it)}</span>
    ${rating > 0 ? `<span class="score">★ ${rating.toFixed(1)}</span>` : ""}
    <div class="card-meta"><strong>${esc(it.title || "Tanpa judul")}</strong><small>${esc(it.year || "—")}</small></div>
  </a>`;
}

const skeletonCards = (n) => Array.from({ length: n }, () => `<div class="card skeleton"><div class="poster"></div><div class="card-meta"><i></i><i></i></div></div>`).join("");

function errorBlock(msg, retryId) {
  return `<div class="state state-error"><p>${esc(msg)}</p><button class="btn ghost" id="${retryId}">Coba lagi</button></div>`;
}

const validItems = (list) => (Array.isArray(list) ? list.filter((x) => x && isSlug(x.slug)) : []);

/* ---------- halaman beranda ---------- */
async function renderHome() {
  const type = store.type;
  const hist = store.history;
  view.innerHTML = `
    <section class="hero" id="hero"><div class="hero-skel"></div></section>
    ${hist.length ? `<section class="row"><header class="row-head"><span class="kicker">Lanjutkan</span><h2>Terakhir Ditonton</h2></header><div class="rail">${hist.map(card).join("")}</div></section>` : ""}
    ${ROWS.map((r) => `
      <section class="row" data-action="${r.action}">
        <header class="row-head"><span class="kicker">${r.kicker}</span><h2>${r.title}</h2></header>
        <div class="rail">${skeletonCards(8)}</div>
      </section>`).join("")}`;
  markLoaded(view);

  ROWS.forEach((r) => loadRow(r.action, type));
  loadHero(type);
}

async function loadRow(action, type) {
  const rail = view.querySelector(`.row[data-action="${action}"] .rail`);
  if (!rail) return;
  try {
    const data = await api({ action, type });
    const items = validItems(data.result);
    if (!view.contains(rail)) return;
    rail.innerHTML = items.length ? items.map(card).join("") : `<div class="state">Belum ada judul.</div>`;
    markLoaded(rail);
  } catch (err) {
    if (!view.contains(rail)) return;
    const id = `retry-${action}`;
    rail.innerHTML = errorBlock(err.message, id);
    rail.querySelector(`#${id}`).onclick = () => { rail.innerHTML = skeletonCards(8); loadRow(action, type); };
  }
}

async function loadHero(type) {
  const hero = document.getElementById("hero");
  try {
    const list = validItems((await api({ action: "trending", type })).result);
    if (!list.length) throw new Error("kosong");
    const pick = list[Math.floor(Math.random() * Math.min(5, list.length))];
    const d = (await api({ action: "detail", slug: pick.slug, type: "all" })).result || pick;
    if (!document.body.contains(hero)) return;
    const genres = Array.isArray(d.genres) ? d.genres.slice(0, 3) : [];
    hero.innerHTML = `
      <div class="hero-bg">${imgTag(d.backdrop || d.poster, "", ["w1280", "original", "w780"])}</div>
      <div class="hero-inner">
        <span class="kicker">Sorotan malam ini · ${typeLabel(d)}</span>
        <h1>${esc(d.title)}</h1>
        <div class="facts">${[d.year, d.duration, parseFloat(d.rating) > 0 ? "★ " + d.rating : "", ...genres].filter(Boolean).map((f) => `<span>${esc(f)}</span>`).join("")}</div>
        <p>${esc(d.synopsis || "")}</p>
        <div class="actions">
          <a class="btn primary" href="#/watch/${esc(d.slug)}">▶ Tonton Sekarang</a>
          <a class="btn ghost" href="#/title/${esc(d.slug)}">Detail</a>
        </div>
      </div>
      <div class="hero-poster">${posterFrame(d, ["w500", "w342"])}</div>`;
    markLoaded(hero);
  } catch {
    if (document.body.contains(hero)) hero.remove();
  }
}

/* ---------- pencarian ---------- */
async function renderSearch(q) {
  document.getElementById("searchInput").value = q;
  view.innerHTML = `
    <section class="page">
      <header class="page-head"><span class="kicker">Hasil pencarian</span><h1>“${esc(q)}”</h1></header>
      <div class="grid" id="results">${skeletonCards(12)}</div>
    </section>`;
  const box = document.getElementById("results");
  try {
    const items = validItems((await api({ action: "search", query: q, type: store.type })).result);
    box.innerHTML = items.length ? items.map(card).join("") : `<div class="state">Tidak ada hasil untuk “${esc(q)}”. Coba kata kunci lain.</div>`;
    markLoaded(box);
  } catch (err) {
    box.innerHTML = errorBlock(err.message, "retry-search");
    box.querySelector("#retry-search").onclick = () => renderSearch(q);
  }
}

/* ---------- detail ---------- */
async function getDetail(slug) {
  const d = (await api({ action: "detail", slug, type: "all" })).result;
  if (!d || !isSlug(d.slug || slug)) throw new Error("Judul tidak ditemukan");
  return { ...d, slug: d.slug || slug };
}

async function renderDetail(slug) {
  view.innerHTML = `<section class="detail"><div class="detail-skel"></div></section>`;
  try {
    const d = await getDetail(slug);
    const genres = Array.isArray(d.genres) ? d.genres : [];
    const cast = Array.isArray(d.cast) ? d.cast.slice(0, 12) : [];
    const isTv = typeLabel(d) === "Series";
    document.title = `${d.title} — DyyMovie2`;
    view.innerHTML = `
      <section class="detail">
        <div class="detail-bg">${imgTag(d.backdrop || d.poster, "", ["w1280", "original", "w780"])}</div>
        <div class="detail-body">
          <div class="detail-poster">${posterFrame(d, ["w500", "w342"])}</div>
          <div class="detail-info">
            <a class="back" href="#/">← Beranda</a>
            <span class="kicker">${typeLabel(d)}${d.status ? " · " + esc(d.status) : ""}</span>
            <h1>${esc(d.title)}</h1>
            ${d.tagline ? `<p class="tagline">${esc(d.tagline)}</p>` : ""}
            <div class="facts">${[d.year, d.duration, isTv && d.seasons ? `${d.seasons} Season` : "", isTv && d.episodes ? `${d.episodes} Episode` : "", parseFloat(d.rating) > 0 ? "★ " + d.rating : ""].filter(Boolean).map((f) => `<span>${esc(f)}</span>`).join("")}</div>
            <p class="synopsis">${esc(d.synopsis || "Sinopsis belum tersedia.")}</p>
            ${genres.length ? `<div class="chips">${genres.map((g) => `<span>${esc(g)}</span>`).join("")}</div>` : ""}
            <dl class="credits">
              ${d.director ? `<dt>Sutradara</dt><dd>${esc(d.director)}</dd>` : ""}
              ${cast.length ? `<dt>Pemeran</dt><dd>${cast.map(esc).join(", ")}</dd>` : ""}
            </dl>
            <div class="actions">
              <a class="btn primary" href="#/watch/${esc(d.slug)}">▶ ${isTv ? "Tonton Episode 1" : "Tonton Film"}</a>
              ${isUrl(d.trailer) ? `<a class="btn ghost" href="${esc(d.trailer)}" target="_blank" rel="noopener">Trailer</a>` : ""}
            </div>
          </div>
        </div>
      </section>`;
    markLoaded(view);
  } catch (err) {
    view.innerHTML = `<section class="page">${errorBlock(err.message, "retry-detail")}</section>`;
    document.getElementById("retry-detail").onclick = () => renderDetail(slug);
  }
}

/* ---------- pemutar ---------- */
// API hanya memberi URL episode 1 season 1; ganti nomornya untuk episode lain.
function episodeUrl(url, s, e) {
  return url
    .replace(/([?&]s=)\d+(&e=)\d+/, `$1${s}$2${e}`)
    .replace(/(\/tv\/[^/?#]+)\/\d+\/\d+(?=$|[?#])/, `$1/${s}/${e}`);
}

// Hampir semua server embed menolak iframe ber-sandbox ("Sandboxing is not allowed" / "Playback Blocked").
// Sandbox (anti popup/iklan) hanya aktif otomatis untuk host yang terbukti kompatibel;
// server lain bisa dicoba manual lewat tombol di bawah pemutar.
const SANDBOX_OK_HOSTS = ["vidsrc.sbs", "vidsrcapi.com"];
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
function useSandbox(server) {
  const saved = store.noSandbox;
  if (saved.includes("!" + server.name)) return true;
  if (saved.includes(server.name)) return false;
  return SANDBOX_OK_HOSTS.includes(hostOf(server.url));
}
function setSandbox(name, on) {
  const rest = store.noSandbox.filter((n) => n !== name && n !== "!" + name);
  store.noSandbox = [...rest, on ? "!" + name : name];
}

function getServers(d) {
  const list = (Array.isArray(d.servers) ? d.servers : []).filter((s) => s && isUrl(s.url));
  if (isUrl(d.primary_stream) && !list.some((s) => s.url === d.primary_stream)) list.unshift({ name: "Utama", url: d.primary_stream });
  return list.map((s, i) => ({ name: String(i + 1), url: s.url.trim() }));
}

async function renderWatch(slug, query) {
  view.innerHTML = `<section class="watch"><div class="screen"><div class="screen-msg"><span class="spinner"></span>Menyiapkan pemutar…</div></div></section>`;
  let d;
  try {
    d = await getDetail(slug);
  } catch (err) {
    view.innerHTML = `<section class="page">${errorBlock(err.message, "retry-watch")}</section>`;
    document.getElementById("retry-watch").onclick = () => renderWatch(slug, query);
    return;
  }

  const servers = getServers(d);
  const isTv = typeLabel(d) === "Series";
  const seasons = Math.max(1, parseInt(d.seasons, 10) || 1);
  const totalEps = Math.max(1, parseInt(d.episodes, 10) || 1);
  const s = Math.min(seasons, Math.max(1, parseInt(query.get("s"), 10) || 1));
  const e = Math.max(1, parseInt(query.get("e"), 10) || 1);
  const epsInSeason = seasons === 1 ? totalEps : Math.min(60, Math.max(e, Math.ceil(totalEps / seasons) + 4));
  let current = Math.max(0, servers.findIndex((x) => x.name === store.server));

  document.title = `Nonton ${d.title}${isTv ? ` S${s}E${e}` : ""} — DyyMovie2`;
  store.history = [{ slug: d.slug, title: d.title, poster: d.poster, year: d.year, rating: d.rating, type: d.type }, ...store.history.filter((h) => h.slug !== d.slug)];

  view.innerHTML = `
    <section class="watch">
      <div class="watch-head">
        <a class="back" href="#/title/${esc(d.slug)}">← ${esc(d.title)}</a>
        <h1>${esc(d.title)}${isTv ? ` <em>S${s} · E${e}</em>` : ""}</h1>
      </div>
      <div class="screen" id="screen"></div>
      <div class="servers" role="group" aria-label="Pilih server">
        <span class="label">Server</span>
        ${servers.map((x, i) => `<button data-i="${i}">${esc(x.name)}</button>`).join("")}
      </div>
      <p class="hint">Video tidak muncul atau lambat? Pilih server lain di atas — setiap server punya sumber berbeda.</p>
      <button type="button" class="btn ghost" id="sbToggle" style="margin-top:10px"></button>
      ${isTv ? `
        <div class="episodes">
          <div class="ep-head">
            <span class="label">Episode</span>
            <select id="seasonSel" aria-label="Pilih season">${Array.from({ length: seasons }, (_, i) => `<option value="${i + 1}" ${i + 1 === s ? "selected" : ""}>Season ${i + 1}</option>`).join("")}</select>
          </div>
          <div class="ep-grid">${Array.from({ length: epsInSeason }, (_, i) => `<a href="#/watch/${esc(d.slug)}?s=${s}&e=${i + 1}" class="${i + 1 === e ? "active" : ""}">${i + 1}</a>`).join("")}</div>
          <div class="ep-nav">
            ${e > 1 ? `<a class="btn ghost" href="#/watch/${esc(d.slug)}?s=${s}&e=${e - 1}">← Sebelumnya</a>` : ""}
            <a class="btn primary" href="#/watch/${esc(d.slug)}?s=${s}&e=${e + 1}">Berikutnya →</a>
          </div>
        </div>` : ""}
    </section>`;

  const screen = document.getElementById("screen");
  const buttons = [...view.querySelectorAll(".servers button")];

  const sbBtn = document.getElementById("sbToggle");
  function updateSbBtn() {
    const server = servers[current];
    if (!sbBtn || !server) return;
    sbBtn.textContent = useSandbox(server)
      ? "Anti-iklan aktif · Jika video diblokir, klik di sini"
      : "Anti-iklan nonaktif · Klik untuk mencoba mengaktifkan";
  }
  sbBtn?.addEventListener("click", () => {
    const server = servers[current];
    if (!server) return;
    setSandbox(server.name, !useSandbox(server));
    play(current);
  });

  function play(i) {
    current = i;
    buttons.forEach((b, j) => b.classList.toggle("active", j === i));
    const server = servers[i];
    if (!server) {
      screen.innerHTML = `<div class="screen-msg">Sumber video untuk judul ini belum tersedia.</div>`;
      return;
    }
    const src = isTv ? episodeUrl(server.url, s, e) : server.url;
    screen.innerHTML = `<div class="screen-msg" id="screenMsg"><span class="spinner"></span>Memuat ${esc(server.name)}…</div>`;
    const frame = document.createElement("iframe");
    frame.src = src;
    frame.title = `Pemutar ${d.title}`;
    frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    frame.allowFullscreen = true;
    // Blokir popup/iklan & redirect halaman (sama seperti pemutar DYY_MOVIE_GABUNG)
    if (useSandbox(server)) frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-forms");
    updateSbBtn();
    frame.referrerPolicy = "origin";
    let loadFallback = setTimeout(() => {
      const msg = document.getElementById("screenMsg");
      if (msg) msg.innerHTML = "Server masih memuat. Jika video tidak muncul, pilih nomor server lain.";
    }, 10000);
    frame.addEventListener("load", () => {
      clearTimeout(loadFallback);
      document.getElementById("screenMsg")?.remove();
    }, { once: true });
    screen.appendChild(frame);
  }

  buttons.forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.i);
    store.server = servers[i].name;
    play(i);
  }));
  document.getElementById("seasonSel")?.addEventListener("change", (ev) => {
    location.hash = `#/watch/${d.slug}?s=${ev.target.value}&e=1`;
  });
  play(current);
}

/* ---------- router ---------- */
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = hash.split("?");
  const query = new URLSearchParams(qs);
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  document.title = "DyyMovie2 — Nonton Film & Series";
  document.body.dataset.page = parts[0] || "home";
  window.scrollTo({ top: 0 });

  if (parts[0] === "title" && isSlug(parts[1])) return renderDetail(parts[1]);
  if (parts[0] === "watch" && isSlug(parts[1])) return renderWatch(parts[1], query);
  if (parts[0] === "search" && parts[1]?.trim()) return renderSearch(parts[1].trim());
  return renderHome();
}

/* ---------- event global ---------- */
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("searchInput").value.trim();
  if (q.length < 2) return toast("Ketik minimal 2 huruf");
  location.hash = `#/search/${encodeURIComponent(q)}`;
});

const tabs = document.getElementById("typeTabs");
function syncTabs() {
  tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.type === store.type));
}
tabs.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  store.type = b.dataset.type;
  syncTabs();
  const page = document.body.dataset.page;
  if (page === "home" || page === "search") route();
  else location.hash = "#/";
});

window.addEventListener("scroll", () => {
  document.getElementById("topbar").classList.toggle("solid", window.scrollY > 40);
}, { passive: true });

window.addEventListener("hashchange", route);
syncTabs();
route();
