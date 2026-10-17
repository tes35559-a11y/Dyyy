/* =========================================================
   DyyMovie — anime-watch.js
   Player Anime (v3 — smooth loading, 404-style error)
   URL: /anime/watch?url=...
   Creator: @Zerozx
   ========================================================= */

const API = "/api/anime";
const main = document.getElementById("main");

function esc(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

const params = new URLSearchParams(location.search);
const WATCH_URL = params.get("url") || "";

console.log("🔍 Watch URL:", WATCH_URL);

if(!WATCH_URL){
  renderError("URL tidak ditemukan", "Parameter 'url' wajib diisi.");
} else {
  loadWatch();
}

async function loadWatch(){
  try{
    const res = await fetch(`${API}?action=watch&url=${encodeURIComponent(WATCH_URL)}`);
    const data = await res.json();

    console.log("🔍 Watch API Response:", data);

    if(!data.status || !data.results){
      renderError("Gagal memuat", data.message || "Tidak bisa memuat episode.");
      return;
    }
    const ep = data.results;

    if(ep.videoAvailable === false){
      renderError(
        "Video tidak tersedia",
        ep.message || "Server tidak menyediakan video untuk episode ini. Coba episode lain."
      );
      return;
    }

    document.title = (ep.title || "Anime") + " — DyyMovie";
    renderPlayer(ep);
  }catch(e){
    console.error("❌ Watch error:", e);
    renderError("Kesalahan koneksi", e.message || "Periksa koneksi kamu.");
  }
}

/* ---------- Render Player ---------- */
function renderPlayer(ep){
  const streams = Array.isArray(ep.streamSources) ? ep.streamSources.filter(s => s && s.url) : [];
  const episodes = Array.isArray(ep.episodeList) ? ep.episodeList : [];
  const currentEp = ep.episode?.number || "";

  const allEpNumbers = episodes
    .map(e => parseInt(e.number, 10))
    .filter(n => !isNaN(n))
    .sort((a,b) => a - b);

  const currentIdx = allEpNumbers.indexOf(parseInt(currentEp, 10));
  const prevEp = currentIdx > 0 ? allEpNumbers[currentIdx - 1] : null;
  const nextEp = currentIdx >= 0 && currentIdx < allEpNumbers.length - 1 ? allEpNumbers[currentIdx + 1] : null;

  main.innerHTML = `
    <div class="anime-watch-container">

      <div class="anime-player-box" id="playerBox">
        <div class="fallback">
          <div class="spinner"></div>
          <p>Menyiapkan player...</p>
        </div>
      </div>

      <div class="anime-ep-info">
        <div class="anime-ep-title">
          <h1>${esc(ep.title || "Episode")}</h1>
          ${ep.series?.title ? `<p>${esc(ep.series.title)}</p>` : ""}
        </div>
        <div class="anime-ep-nav">
          <button class="anime-nav-btn" ${!prevEp ? "disabled" : ""} onclick="${prevEp ? `changeEpisode(${prevEp})` : ''}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Prev</span>
          </button>
          <button class="anime-nav-btn" ${!nextEp ? "disabled" : ""} onclick="${nextEp ? `changeEpisode(${nextEp})` : ''}">
            <span>Next</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
      </div>

      ${streams.length > 0 ? `
        <div class="anime-server-section">
          <div class="anime-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Pilih Server (${streams.length})
          </div>
          <div class="anime-server-tabs" id="serverTabs">
            ${streams.map((s, i) => `
              <button class="anime-server-tab ${i===0?'active':''}" onclick="switchServer(${i}, this)">
                <span class="server-name">${esc(s.source || ("Server " + (i+1)))}</span>
                ${s.type && s.type !== "stream" ? `<span class="server-type">${esc(String(s.type).toUpperCase())}</span>` : ""}
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}

      ${allEpNumbers.length > 0 ? `
        <div class="anime-episode-section">
          <div class="anime-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
            Semua Episode (${allEpNumbers.length})
          </div>
          <div class="anime-episode-grid">
            ${allEpNumbers.map(n => `
              <button class="anime-ep-btn ${String(n) === String(currentEp) ? 'active' : ''}"
                      onclick="changeEpisode(${n})">
                ${n}
              </button>
            `).join("")}
          </div>
        </div>
      ` : ""}

      <div class="anime-action-bar">
        <button class="anime-action-btn" onclick="window.location.href='/anime'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Kembali ke Anime
        </button>
        <button class="anime-action-btn" onclick="shareEpisode()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Bagikan
        </button>
      </div>

    </div>
  `;

  window.__streams = streams;
  window.__ep = ep;
  playStream(0);
}

/* ---------- Play Stream ---------- */
function playStream(index){
  const streams = window.__streams || [];
  const box = document.getElementById("playerBox");
  if(!box) return;

  if(!streams.length){
    box.innerHTML = `
      <div class="fallback">
        <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <h3>Stream belum tersedia</h3>
        <p>Server streaming tidak tersedia untuk episode ini.</p>
      </div>`;
    return;
  }

  const s = streams[index];
  const url = s.url;
  if(!url){
    box.innerHTML = `<div class="fallback"><h3>Server tidak valid</h3></div>`;
    return;
  }

  box.innerHTML = `<div class="player-loading"><div class="spinner"></div></div>`;

  const hideLoading = () => {
    const l = box.querySelector(".player-loading");
    if(!l) return;
    l.classList.add("fade-out");
    setTimeout(() => l.remove(), 300);
  };

  if(s.type === "mp4" || s.type === "mkv"){
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText = "width:100%;height:100%;background:#000";
    video.onloadeddata = hideLoading;
    video.onerror = hideLoading;
    video.oncanplay = hideLoading;
    box.innerHTML = "";
    box.appendChild(video);
    setTimeout(hideLoading, 2500);
  } else if(s.type === "hls"){
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.cssText = "width:100%;height:100%;background:#000";
    video.oncanplay = hideLoading;
    video.onloadeddata = hideLoading;
    box.innerHTML = "";
    box.appendChild(video);
    if(window.Hls && window.Hls.isSupported()){
      const hls = new window.Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, hideLoading);
      hls.on(window.Hls.Events.ERROR, hideLoading);
    } else if(video.canPlayType("application/vnd.apple.mpegurl")){
      video.src = url;
    } else {
      const iframe = document.createElement("iframe");
      iframe.src = url;
      iframe.allowFullscreen = true;
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      box.innerHTML = "";
      box.appendChild(iframe);
    }
    setTimeout(hideLoading, 2500);
  } else {
    const iframe = document.createElement("iframe");
    iframe.src = s.embedUrl || url;
    iframe.allowFullscreen = true;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.setAttribute("referrerpolicy", "origin");
    iframe.setAttribute("scrolling", "no");
    iframe.onload = hideLoading;
    box.innerHTML = "";
    box.appendChild(iframe);
    setTimeout(hideLoading, 2000);
  }
}

function switchServer(index, btnEl){
  document.querySelectorAll(".anime-server-tab").forEach(b => b.classList.remove("active"));
  if(btnEl) btnEl.classList.add("active");
  playStream(index);
}

/* ---------- Navigasi Episode ---------- */
function changeEpisode(epNumber){
  if(!epNumber){ toast("Episode tidak tersedia"); return; }
  const ep = window.__ep;
  if(!ep || !ep.series?.slug) {
    toast("Tidak bisa ganti episode");
    return;
  }

  const base = "https://oploverz.site";
  const newUrl = `${base}/series/${ep.series.slug}/episode/${epNumber}`;

  console.log("🔀 Change episode to:", newUrl);
  window.location.href = `/anime/watch?url=${encodeURIComponent(newUrl)}`;
}

function shareEpisode(){
  const url = location.href;
  const title = window.__ep?.title || "Anime";
  if(navigator.share){
    navigator.share({ title, text: `Nonton ${title} di DyyMovie`, url });
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

    <div class="anime-watch-container" style="display:flex;align-items:center;justify-content:center;min-height:70vh;padding:20px">
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
          <a href="/anime" class="err-btn-404 ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Halaman Anime</span>
          </a>
        </div>

        <div class="err-url-404">
          <strong>URL diminta:</strong> ${esc(location.href.length > 80 ? location.href.slice(0, 80) + '…' : location.href)}
        </div>

      </div>
    </div>
  `;
}