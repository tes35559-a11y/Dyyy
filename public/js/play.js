/* =========================================================
   DyyMovie — play.js
   Halaman Player Film/Serial
   URL: /play/:type/:id
   API: /api/stream?id=...&type=...
   Creator: @Zerozx
   ========================================================= */

const API = "/api/stream";
const main = document.getElementById("main");
const DB = {
  HIST: "zerozx_history",
  FAV: "zerozx_favorites",
  get(k,f){ try{return JSON.parse(localStorage.getItem(k)) ?? f}catch{return f} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch{} },
};

function esc(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function imgUrl(p){
  if(!p) return "";
  if(p.startsWith("http")) return p;
  return "https://image.tmdb.org/t/p/w500" + p;
}

/* ---------- Parse URL path: /play/film/movie-1740545 ---------- */
const pathParts = location.pathname.split("/").filter(Boolean);
let TYPE = "film";
let ID = "";

if(pathParts[0] === "play"){
  TYPE = pathParts[1] || "film";
  ID = decodeURIComponent(pathParts.slice(2).join("/"));
} else {
  const qp = new URLSearchParams(location.search);
  TYPE = qp.get("type") || "film";
  ID = qp.get("id") || "";
}

if(!ID){
  renderError("ID tidak ditemukan", "URL harusnya berformat /play/film/movie-1740545 atau /play/tv/breaking-bad-2008.");
} else {
  loadPlayer();
}

/* ---------- Load data ---------- */
async function loadPlayer(){
  document.title = "Memuat... — DyyMovie";
  try{
    const res = await fetch(`${API}?id=${encodeURIComponent(ID)}&type=${encodeURIComponent(TYPE)}`);
    const data = await res.json();

    console.log("🔍 Play API Response:", data);

    if(data.status === false){
      renderError("Gagal memuat", data.message || "Tidak bisa memuat data film.");
      return;
    }

    const results = data.results || {};
    const play = data.play || {};
    const streamsObj = play.streams || results.stream || {};
    const servers = Array.isArray(streamsObj.servers) ? streamsObj.servers : [];
    const primaryIframe = streamsObj.primaryIframe || (servers[0] && servers[0].url) || null;

    const movie = normalize(results, TYPE);
    movie.streams = servers.map((s, i) => ({
      name: String(i + 1),
      url: s.url || s.link || ""
    })).filter(s => s.url);
    movie.primaryIframe = primaryIframe;

    if(!movie.streams.length && primaryIframe){
      movie.streams = [{ name: "1", url: primaryIframe }];
    }

    document.title = movie.title + " — DyyMovie";
    history_add(movie);
    renderPlayerPage(movie);
  }catch(e){
    console.error("❌ Play error:", e);
    renderError("Kesalahan koneksi", e.message || "Periksa koneksi internet kamu.");
  }
}

/* ---------- Normalisasi ---------- */
function normalize(item, type){
  const poster = item.poster || item.poster_path || "";
  const backdrop = item.backdrop || item.backdrop_path || poster;
  const title = item.title || item.name || "Tanpa Judul";
  const year = (item.releaseDate || item.release_date || item.year || "").toString().slice(0,4) || "—";
  const rating = item.rating ?? item.vote_average ?? null;
  const overview = item.synopsis || item.overview || "Deskripsi belum tersedia.";
  let genres = item.genres || [];
  if(!Array.isArray(genres)) genres = [genres];
  const slug = item.slug || item.id || "";
  const runtime = item.duration || item.runtime || null;
  const status = item.status || null;
  return { poster, backdrop, title, year, rating, overview, genres, slug, runtime, status, type };
}

/* ---------- Render halaman player ---------- */
function renderPlayerPage(movie){
  const isFav = (DB.get(DB.FAV, []) || []).some(m=>m.slug === movie.slug);

  main.innerHTML = `
    <div class="player-box">
      <div class="player-aspect" id="playerBox">
        <div class="fallback">
          <div class="spinner"></div>
          <p>Menyiapkan player...</p>
        </div>
      </div>
    </div>

    ${movie.streams.length > 1 ? `
      <div class="servers">
        <div class="servers-head">Pilih Server (${movie.streams.length})</div>
        <div class="server-list" id="serverList">
          ${movie.streams.map((s,i)=>`
            <button class="server-btn ${i===0?'active':''}" onclick="switchServer(${i}, this)">
              ${esc(s.name)}
            </button>
          `).join("")}
        </div>
      </div>
    ` : ""}

    <div class="info">
      ${movie.backdrop ? `<div class="info-banner" style="background-image:url('${esc(imgUrl(movie.backdrop))}')"></div>` : `<div class="info-banner" style="background:linear-gradient(135deg,#1a1a22,#0d0d12)"></div>`}
      <div class="info-body">
        ${movie.poster ? `
          <div class="info-poster">
            <img src="${esc(imgUrl(movie.poster))}" alt="${esc(movie.title)}" onerror="this.style.display='none'">
          </div>
        ` : ""}
        <div class="info-detail">
          <h1 class="info-title">${esc(movie.title)}</h1>
          <div class="info-meta">
            ${movie.rating ? `<span class="score">★ ${Number(movie.rating).toFixed(1)}</span>` : ""}
            <span class="pill">HD</span>
            <span class="pill">${esc(movie.year)}</span>
            <span class="pill">${movie.type === "tv" ? "Serial TV" : "Film"}</span>
            ${movie.runtime ? `<span>${esc(String(movie.runtime).replace(/menit/gi,"").trim())} menit</span>` : ""}
            ${movie.status ? `<span class="pill">${esc(movie.status)}</span>` : ""}
          </div>
          ${movie.genres.length ? `
            <div class="info-genres">
              ${movie.genres.map(g=>`<span>${esc(typeof g === "string" ? g : g.name)}</span>`).join("")}
            </div>
          ` : ""}
          <p class="info-desc">${esc(movie.overview)}</p>
          <div class="info-actions">
            <button class="btn btn-primary" onclick="reloadPlayer()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Muat Ulang
            </button>
            <button class="btn btn-ghost ${isFav?'fav-active':''}" id="favBtn" onclick="toggleFav()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span class="fav-text">${isFav ? "Tersimpan" : "Favoritkan"}</span>
            </button>
            <button class="btn btn-ghost" onclick="shareMovie()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              Bagikan
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  window.__movie = movie;
  playStream(0);
}

/* ---------- Putar stream ---------- */
function playStream(index){
  const movie = window.__movie;
  if(!movie) return;
  const box = document.getElementById("playerBox");
  if(!box) return;

  if(!movie.streams.length){
    box.innerHTML = `
      <div class="fallback">
        <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <h3>Stream belum tersedia</h3>
        <p>Sumber data tidak menyediakan link streaming untuk judul ini.</p>
      </div>`;
    return;
  }

  const s = movie.streams[index];
  const url = s.url;
  if(!url){
    box.innerHTML = `<div class="fallback"><h3>Server tidak valid</h3></div>`;
    return;
  }

  box.innerHTML = "";

  const loading = document.createElement("div");
  loading.className = "player-loading";
  loading.innerHTML = '<div class="spinner"></div>';
  box.appendChild(loading);

  const hideLoading = () => {
    const l = box.querySelector(".player-loading");
    if(!l) return;
    l.style.transition = "opacity .3s ease";
    l.style.opacity = "0";
    setTimeout(() => l.remove(), 300);
  };

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.allowFullscreen = true;
  iframe.setAttribute("allowfullscreen", "true");
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; accelerometer; gyroscope";
  iframe.setAttribute("referrerpolicy", "origin");
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("frameborder", "0");
  iframe.onload = hideLoading;
  box.appendChild(iframe);

  // Auto-hide loading setelah 3 detik (jangan tunggu onload yang kadang lambat)
  setTimeout(hideLoading, 3000);
}

function switchServer(index, btnEl){
  document.querySelectorAll(".server-btn").forEach(b=>b.classList.remove("active"));
  if(btnEl) btnEl.classList.add("active");
  playStream(index);
}

function reloadPlayer(){
  const active = document.querySelector(".server-btn.active");
  const idx = active ? Array.from(document.querySelectorAll(".server-btn")).indexOf(active) : 0;
  playStream(idx >= 0 ? idx : 0);
}

/* ---------- Riwayat & Favorit ---------- */
function history_add(movie){
  const list = DB.get(DB.HIST, []);
  const filtered = list.filter(m=>m.slug !== movie.slug);
  filtered.unshift({
    slug: movie.slug, title: movie.title, poster: movie.poster,
    year: movie.year, rating: movie.rating, genres: movie.genres,
    watchedAt: Date.now()
  });
  DB.set(DB.HIST, filtered.slice(0, 100));
}

function toggleFav(){
  const movie = window.__movie;
  if(!movie) return;
  const list = DB.get(DB.FAV, []);
  const idx = list.findIndex(m=>m.slug === movie.slug);
  const btn = document.getElementById("favBtn");
  const svg = btn.querySelector("svg");
  const txt = btn.querySelector(".fav-text");

  if(idx >= 0){
    list.splice(idx, 1);
    DB.set(DB.FAV, list);
    btn.classList.remove("fav-active");
    svg.setAttribute("fill","none");
    txt.textContent = "Favoritkan";
  } else {
    list.unshift({ slug:movie.slug, title:movie.title, poster:movie.poster, year:movie.year, rating:movie.rating, genres:movie.genres, savedAt: Date.now() });
    DB.set(DB.FAV, list);
    btn.classList.add("fav-active");
    svg.setAttribute("fill","currentColor");
    txt.textContent = "Tersimpan";
  }
}

function shareMovie(){
  const movie = window.__movie;
  if(!movie) return;
  const url = location.href;
  if(navigator.share){
    navigator.share({ title: movie.title, text: "Nonton " + movie.title + " di DyyMovie", url });
  } else {
    navigator.clipboard.writeText(url);
    toast("Link disalin!");
  }
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg){
  let el = document.getElementById("toastEl");
  if(!el){
    el = document.createElement("div");
    el.id = "toastEl";
    el.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(80px);
      background:rgba(21,21,28,.96);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);
      padding:13px 22px;border-radius:14px;font-size:14px;font-weight:600;z-index:500;
      transition:transform .4s;pointer-events:none;max-width:90vw;color:#f5f5f7`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(()=>{ el.style.transform = "translateX(-50%) translateY(0)"; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.transform = "translateX(-50%) translateY(80px)"; }, 2400);
}

/* ---------- Utils ---------- */
function goBack(){
  if(document.referrer && document.referrer.includes(location.host)){
    history.back();
  } else {
    location.href = "/home";
  }
}

/* ---------- ERROR PAGE (404-style) ---------- */
function renderError(title, msg){
  document.title = "Error — DyyMovie";
  main.innerHTML = `
    <style>
      .err-icon-404 {
        display:inline-flex;align-items:center;justify-content:center;
        width:100px;height:100px;border-radius:50%;
        background:radial-gradient(circle at 30% 30%, rgba(229,9,20,.28), rgba(229,9,20,.06));
        border:2px solid rgba(229,9,20,.4);color:#ff2233;
        margin:0 auto 24px;position:relative;
        animation:pulseErr 2.4s ease-in-out infinite;
      }
      .err-icon-404::before {
        content:'';position:absolute;inset:-2px;border-radius:50%;
        background:conic-gradient(from 0deg, transparent, #e50914, transparent 40%);
        -webkit-mask:radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
        mask:radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
        animation:spinErr 4s linear infinite;opacity:.8;
      }
      @keyframes spinErr { to { transform: rotate(360deg); } }
      @keyframes pulseErr {
        0%, 100% { box-shadow: 0 0 0 0 rgba(229,9,20,.45); }
        50% { box-shadow: 0 0 0 24px rgba(229,9,20,0); }
      }
      .err-title-404 {
        font-size:23px;font-weight:800;color:#f5f5f7;
        margin:0 0 14px;letter-spacing:-.4px;
      }
      .err-desc-404 {
        color:#92929e;font-size:15px;line-height:1.75;
        margin:0 auto 30px;max-width:440px;
      }
      .err-actions-404 {
        display:flex;gap:12px;flex-wrap:wrap;justify-content:center;
      }
      .err-btn-404 {
        display:inline-flex;align-items:center;justify-content:center;gap:9px;
        padding:14px 26px;border-radius:13px;font-size:14.5px;font-weight:700;
        transition:all .25s;text-decoration:none;cursor:pointer;border:none;
        font-family:inherit;white-space:nowrap;
      }
      .err-btn-404.primary {
        background:linear-gradient(135deg,#e50914,#ff2233);color:#fff;
        box-shadow:0 10px 30px rgba(229,9,20,.5);
      }
      .err-btn-404.primary:hover {
        transform:translateY(-3px);box-shadow:0 18px 45px rgba(229,9,20,.7);
      }
      .err-btn-404.ghost {
        background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
        color:#f5f5f7;
      }
      .err-btn-404.ghost:hover {
        background:rgba(255,255,255,.13);transform:translateY(-3px);
      }
      .err-url-404 {
        margin-top:26px;padding:12px 16px;background:rgba(0,0,0,.4);
        border:1px solid rgba(255,255,255,.06);border-radius:10px;
        font-family:'SF Mono','Courier New',monospace;font-size:11.5px;
        color:#8a8a96;word-break:break-all;text-align:left;
      }
      .err-url-404 strong { color:#ff2233; }
    </style>

    <div style="display:flex;align-items:center;justify-content:center;min-height:70vh;padding:20px">
      <div style="max-width:580px;width:100%;text-align:center;padding:50px 32px 40px;background:linear-gradient(160deg, rgba(20,20,28,.85), rgba(10,10,15,.9));border:1px solid rgba(255,255,255,.08);border-radius:26px;box-shadow:0 30px 90px rgba(0,0,0,.75);position:relative;overflow:hidden">

        <div class="err-icon-404">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:relative;z-index:1">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v5M12 16h.01"/>
          </svg>
        </div>

        <h2 class="err-title-404">${esc(title)}</h2>
        <p class="err-desc-404">${esc(msg)}</p>

        <div class="err-actions-404">
          <a href="/home" class="err-btn-404 primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Kembali ke Beranda</span>
          </a>
          <button class="err-btn-404 ghost" onclick="goBack()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Halaman Sebelumnya</span>
          </button>
        </div>

        <div class="err-url-404">
          <strong>URL diminta:</strong> ${esc(location.href.length > 80 ? location.href.slice(0, 80) + '…' : location.href)}
        </div>

      </div>
    </div>
  `;
}