/* =========================================================
   DyyMovie — anime.js
   Halaman Anime (Oploverz)
   API: /api/anime?action=...
   Creator: @Zerozx
   ========================================================= */

const API = "/api/anime";
const main = document.getElementById("main");
const nav = document.getElementById("nav");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const heroEl = document.getElementById("hero");

/* ---------- DB ---------- */
const DB = {
  FAV: "zerozx_anime_favorites",
  HIST: "zerozx_anime_history",
  SEARCH_HIST: "zerozx_anime_search_history",
  get(k, f){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} },
};

const favorites = {
  list(){ return DB.get(DB.FAV, []); },
  has(slug){ return this.list().some(m=>m.slug===slug); },
  toggle(item){
    const list = this.list();
    const idx = list.findIndex(m=>m.slug===item.slug);
    if(idx >= 0){ list.splice(idx, 1); DB.set(DB.FAV, list); updateBadges(); return false; }
    list.unshift({ ...item, savedAt: Date.now() });
    DB.set(DB.FAV, list);
    updateBadges();
    return true;
  },
};

const history = {
  list(){ return DB.get(DB.HIST, []); },
  add(item){
    const list = this.list().filter(m=>m.slug!==item.slug);
    list.unshift({ ...item, watchedAt: Date.now() });
    DB.set(DB.HIST, list.slice(0, 100));
    updateBadges();
  },
};

const searchHistory = {
  list(){ return DB.get(DB.SEARCH_HIST, []); },
  add(q){
    const list = this.list().filter(x=>x.toLowerCase() !== q.toLowerCase());
    list.unshift(q);
    DB.set(DB.SEARCH_HIST, list.slice(0, 12));
  },
  remove(q){ DB.set(DB.SEARCH_HIST, this.list().filter(x=>x !== q)); },
  clear(){ DB.set(DB.SEARCH_HIST, []); },
};

function updateBadges(){
  const favCount = favorites.list().length;
  const histCount = history.list().length;
  const favBadge = document.getElementById("favBadge");
  const histBadge = document.getElementById("histBadge");
  if(favBadge){
    if(favCount > 0){ favBadge.textContent = favCount > 99 ? "99+" : favCount; favBadge.classList.remove("hidden"); }
    else favBadge.classList.add("hidden");
  }
  if(histBadge){
    if(histCount > 0){ histBadge.textContent = histCount > 99 ? "99+" : histCount; histBadge.classList.remove("hidden"); }
    else histBadge.classList.add("hidden");
  }
}

/* ---------- Utils ---------- */
let toastTimer;
function toast(msg){
  toastMsg.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toastEl.classList.remove("show"), 2400);
}

function esc(s=""){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function api(params){
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}?${qs}`);
  return res.json();
}

/* ---------- Routing anime ---------- */
const ROUTES = {
  anime:   "/anime",
  search:  "/anime/search",
};

function readRoute(){
  const p = location.pathname.replace(/\/+$/,"");
  if(p === "/anime/search") return "search";
  return "anime";
}

function setRoute(tab, { replace=false }={}){
  const target = ROUTES[tab] || ROUTES.anime;
  if(location.pathname === target) return;
  if(replace) history.replaceState({ tab }, "", target);
  else history.pushState({ tab }, "", target);
}

function routeAnimeTab(tab, { push=true }={}){
  if(!ROUTES[tab]) tab = "anime";
  switchAnimeTab(tab);
  setRoute(tab, { replace: !push });
}

window.addEventListener("popstate", () => {
  switchAnimeTab(readRoute());
});

function switchAnimeTab(tab){
  document.querySelectorAll(".dock-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  window.scrollTo({top:0, behavior:"smooth"});
  if(tab === "anime") loadAnimeHome();
  else if(tab === "search") renderAnimeSearch();
}

/* ---------- Skeleton ---------- */
function skeletonGrid(n=12){
  return `<div class="grid">${Array.from({length:n}).map(()=>`<div class="skeleton"></div>`).join("")}</div>`;
}
function skeletonRow(n=7){
  return `<div class="row-scroll">${Array.from({length:n}).map(()=>`<div class="skeleton"></div>`).join("")}</div>`;
}

function emptyAnimeState(msg, sub="Coba lagi nanti."){
  return `<div class="state">
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>
    <h3>${esc(msg)}</h3><p>${esc(sub)}</p>
  </div>`;
}

/* ---------- Card ---------- */
function animeCardHTML(item, i=0){
  const url = item.url || item.watchUrl || "";
  const image = item.image || item.poster || "";
  const title = item.title || "Tanpa Judul";
  const isFav = favorites.has(url);
  const key = `a_${(url||"").replace(/[^a-z0-9]/gi,"_")}`;
  window[key] = { slug: url, title, poster: image, url };

  return `
    <div class="card" style="animation-delay:${i*40}ms" onclick="openAnimeDetail('${esc(url)}')">
      <div class="card-poster">
        ${image ? `<img loading="lazy" src="${esc(image)}" alt="${esc(title)}" onerror="this.style.display='none'">` : ""}
        ${item.episode ? `<div class="card-ep-badge">${esc(item.episode)}</div>` : ""}
        ${item.age ? `<div class="card-score">${esc(item.age)}</div>` : ""}
        <div class="card-actions">
          <button class="btn-mini ${isFav?'active':''}" onclick="event.stopPropagation();toggleAnimeFav('${esc(url)}', this)" title="Favorit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
        </div>
        <div class="card-overlay">
          <div class="card-play">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>
      <div class="card-info">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub"><span>${esc(item.type || "Anime")}</span></div>
      </div>
    </div>`;
}

/* ---------- HOME ---------- */
async function loadAnimeHome(){
  main.innerHTML = `
    <section class="section">
      <div class="section-head">
        <div class="section-title">Sedang Trending</div>
      </div>
      <div id="trending-wrap">${skeletonRow()}</div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title">Rilis Terbaru</div>
      </div>
      <div id="latest-wrap">${skeletonGrid(12)}</div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title">Tayangan Baru</div>
      </div>
      <div id="newly-wrap">${skeletonRow()}</div>
    </section>
  `;

  try{
    const r = await api({ action: "home" });
    console.log("🎌 Anime home response:", r);

    if(!r.status || !r.results){
      document.getElementById("trending-wrap").innerHTML =
        emptyAnimeState("Gagal memuat", r.message || "API tidak merespons");
      document.getElementById("latest-wrap").innerHTML = "";
      document.getElementById("newly-wrap").innerHTML = "";
      return;
    }

    const { featured, trending, latestEpisodes, newlyAdded } = r.results;

    // Hero dari featured[0]
    if(Array.isArray(featured) && featured.length){
      const f = featured[0];
      heroEl.style.display = "flex";
      const bg = document.getElementById("heroBg");
      bg.style.backgroundImage = `url('${esc(f.image)}')`;
      document.getElementById("heroTitle").textContent = f.title || "Anime";
      document.getElementById("heroDesc").textContent = f.description || "Streaming anime subtitle Indonesia.";
      document.getElementById("heroMeta").innerHTML = `<span class="pill">HD</span><span class="pill">Sub Indo</span><span>Oploverz</span>`;
      const heroPlay = document.getElementById("heroPlay");
      if(heroPlay && f.url) heroPlay.onclick = () => openAnimeDetail(f.url);
    }

    // Trending
    const tw = document.getElementById("trending-wrap");
    if(Array.isArray(trending) && trending.length){
      tw.innerHTML = `<div class="row-scroll">${trending.map((m,i)=>animeCardHTML(m,i)).join("")}</div>`;
    } else {
      tw.innerHTML = emptyAnimeState("Belum ada trending");
    }

    // Latest episodes
    const lw = document.getElementById("latest-wrap");
    if(Array.isArray(latestEpisodes) && latestEpisodes.length){
      lw.innerHTML = `<div class="grid">${latestEpisodes.map((m,i)=>animeCardHTML(m,i)).join("")}</div>`;
    } else {
      lw.innerHTML = emptyAnimeState("Belum ada episode");
    }

    // Newly added
    const nw = document.getElementById("newly-wrap");
    if(Array.isArray(newlyAdded) && newlyAdded.length){
      nw.innerHTML = `<div class="row-scroll">${newlyAdded.map((m,i)=>animeCardHTML(m,i)).join("")}</div>`;
    } else {
      nw.innerHTML = emptyAnimeState("Belum ada tayangan baru");
    }
  }catch(e){
    console.error("❌ Anime home error:", e);
    document.getElementById("trending-wrap").innerHTML = emptyAnimeState("Gagal memuat", e.message);
    document.getElementById("latest-wrap").innerHTML = "";
    document.getElementById("newly-wrap").innerHTML = "";
  }
}

/* ---------- DETAIL (modal) ---------- */
async function openAnimeDetail(url){
  if(!url){ toast("URL tidak tersedia"); return; }
  let modal = document.getElementById("modal");
  if(!modal){
    modal = document.createElement("div");
    modal.id = "modal";
    modal.className = "modal-backdrop";
    modal.innerHTML = `<div class="modal" id="modalContent"></div>`;
    modal.onclick = (e) => { if(e.target === modal) closeAnimeModal(); };
    document.body.appendChild(modal);
  }
  const content = document.getElementById("modalContent");
  modal.classList.add("open");
  content.innerHTML = `<div style="padding:80px;text-align:center"><div class="spinner"></div><p style="color:var(--muted)">Memuat detail...</p></div>`;

  try{
    const r = await api({ action: "detail", url });
    console.log("🎌 Anime detail response:", r);

    if(!r.status || !r.results){
      content.innerHTML = `<div style="padding:40px;text-align:center"><button class="modal-close" onclick="closeAnimeModal()">×</button><h3>Gagal memuat detail</h3><p style="color:var(--muted)">${esc(r.message||"Error")}</p></div>`;
      return;
    }

    const d = r.results;
    const episodes = Array.isArray(d.episodes) ? d.episodes.filter(e => e && e.url) : [];

    content.innerHTML = `
      <div class="modal-head">
        <button class="modal-close" onclick="closeAnimeModal()">×</button>
        ${d.poster ? `<img src="${esc(d.poster)}" alt="${esc(d.title)}">` : ""}
      </div>
      <div class="modal-body">
        <h2 class="modal-title">${esc(d.title || "Tanpa Judul")}</h2>
        ${d.japaneseTitle ? `<p style="color:var(--muted);font-size:14px;margin-bottom:12px">${esc(d.japaneseTitle)}</p>` : ""}
        <div class="anime-detail-info">
          ${d.score ? `<span class="score">★ ${Number(d.score).toFixed(1)}</span>` : ""}
          ${d.type ? `<span class="pill">${esc(d.type)}</span>` : ""}
          ${d.studio ? `<span class="pill">${esc(d.studio)}</span>` : ""}
          ${d.status ? `<span class="pill">${esc(d.status)}</span>` : ""}
          ${d.releaseDate ? `<span>${esc(d.releaseDate)}</span>` : ""}
          ${d.duration ? `<span>${esc(d.duration)}</span>` : ""}
        </div>
        ${Array.isArray(d.genres) && d.genres.length ? `<div class="modal-genres">${d.genres.map(g=>`<span>${esc(g)}</span>`).join("")}</div>` : ""}
        <p class="modal-desc">${esc(d.description || "Sinopsis belum tersedia.")}</p>

        ${episodes.length ? `
          <h3 style="font-family:var(--font-display);font-size:16px;font-weight:800;margin-bottom:12px;margin-top:8px">Episode (${episodes.length})</h3>
          <div class="ep-list">
            ${episodes.map((ep, i) => `
              <div class="ep-item" onclick="goAnimeWatch('${esc(ep.url)}')">
                ${esc(ep.title || ("Episode " + (ep.episodeNumber || (i+1))))}
              </div>
            `).join("")}
          </div>
        ` : `
          <div style="padding:16px;background:var(--bg-3);border-radius:12px;margin-top:12px;text-align:center">
            <p style="color:var(--muted);font-size:13px;margin-bottom:10px">
              Episode belum tersedia di scraper. Buka langsung di sumber:
            </p>
            <a href="${esc(d.url)}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:linear-gradient(135deg,var(--red),var(--red-2));color:#fff;border-radius:10px;font-weight:700;text-decoration:none">
              Buka di Oploverz
            </a>
          </div>
        `}
      </div>
    `;
  }catch(e){
    console.error("❌ Detail error:", e);
    content.innerHTML = `
      <div style="padding:40px;text-align:center">
        <button class="modal-close" onclick="closeAnimeModal()">×</button>
        <h3>Gagal memuat detail</h3>
        <p style="color:var(--muted);font-size:14px">${esc(e.message||"Kesalahan")}</p>
      </div>`;
  }
}

function closeAnimeModal(){
  const m = document.getElementById("modal");
  if(m) m.classList.remove("open");
}

/* ---------- Watch anime ---------- */
function goAnimeWatch(url){
  if(!url){ toast("URL episode tidak valid"); return; }
  const encoded = encodeURIComponent(url);
  window.location.href = `/anime/watch?url=${encoded}`;
}

/* ---------- Favorite toggle ---------- */
function toggleAnimeFav(url, btnEl){
  const key = `a_${(url||"").replace(/[^a-z0-9]/gi,"_")}`;
  const item = window[key] || { slug:url, title:"Tanpa Judul", poster:"", url };
  const added = favorites.toggle(item);
  if(btnEl){
    btnEl.classList.toggle("active", added);
    const svg = btnEl.querySelector("svg");
    if(svg) svg.setAttribute("fill", added ? "currentColor" : "none");
  }
  toast(added ? "Ditambahkan ke favorit ❤" : "Dihapus dari favorit");
}

/* ---------- SEARCH ---------- */
function renderAnimeSearch(initialQuery=""){
  const sh = searchHistory.list();
  main.innerHTML = `
    <div class="search-hero">
      <h1>Cari <span class="red">Anime</span></h1>
      <p class="sub">Temukan ribuan judul anime dari Oploverz</p>

      <div class="big-search ${initialQuery?'has-value':''}" id="bigSearchWrap">
        <svg class="lead" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="bigSearchInput" type="text" placeholder="Ketik judul anime..." value="${esc(initialQuery)}" autocomplete="off">
        <button class="btn-clear" onclick="clearAnimeSearch()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
        <button class="btn-search" onclick="submitAnimeSearch()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span class="txt">Cari</span>
        </button>
      </div>

      ${sh.length ? `
        <div class="chips-wrap">
          <div class="chips-title">Riwayat Pencarian</div>
          <div class="chips">
            ${sh.map(q=>`
              <span class="chip" onclick="submitAnimeSearch('${esc(q)}')">
                ${esc(q)}
                <svg class="rm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" onclick="event.stopPropagation();removeAnimeSearchHistory('${esc(q)}')"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </span>
            `).join("")}
            <span class="chip chip-clear" onclick="clearAnimeSearchHistory()">Hapus semua</span>
          </div>
        </div>
      ` : ""}
    </div>

    <section class="search-section" id="searchResultSection">
      <div id="searchResultGrid"></div>
    </section>
  `;

  const input = document.getElementById("bigSearchInput");
  input.addEventListener("input", () => {
    document.getElementById("bigSearchWrap").classList.toggle("has-value", !!input.value);
  });
  input.addEventListener("keydown", e => { if(e.key === "Enter") submitAnimeSearch(); });
  if(!initialQuery) setTimeout(()=>input.focus(), 150);
  if(initialQuery) doAnimeSearch(initialQuery);
}

async function submitAnimeSearch(forceQuery){
  const q = (forceQuery !== undefined ? forceQuery : document.getElementById("bigSearchInput").value).trim();
  if(!q){ toast("Masukkan kata kunci"); return; }
  searchHistory.add(q);
  doAnimeSearch(q);
}

async function doAnimeSearch(q){
  const input = document.getElementById("bigSearchInput");
  if(input){ input.value = q; document.getElementById("bigSearchWrap").classList.add("has-value"); }
  const section = document.getElementById("searchResultSection");
  section.innerHTML = `<div class="search-section-title">Hasil untuk "${esc(q)}"</div><div id="searchResultGrid">${skeletonGrid(12)}</div>`;

  try{
    const r = await api({ action: "search", q });
    console.log("🎌 Anime search response:", r);
    const list = Array.isArray(r.results?.data) ? r.results.data : [];
    const wrap = document.getElementById("searchResultGrid");
    if(!list.length){ wrap.innerHTML = emptyAnimeState("Tidak ditemukan", `Tidak ada hasil untuk "${q}"`); return; }
    wrap.innerHTML = `<div class="grid">${list.map((m,i)=>animeCardHTML(m,i)).join("")}</div>`;
  }catch(e){
    document.getElementById("searchResultGrid").innerHTML = emptyAnimeState("Gagal mencari", e.message);
  }
}

function clearAnimeSearch(){
  document.getElementById("bigSearchInput").value = "";
  document.getElementById("bigSearchWrap").classList.remove("has-value");
  renderAnimeSearch();
}

function removeAnimeSearchHistory(q){
  searchHistory.remove(q);
  renderAnimeSearch(document.getElementById("bigSearchInput")?.value || "");
}
function clearAnimeSearchHistory(){
  searchHistory.clear();
  toast("Riwayat pencarian dihapus");
  renderAnimeSearch();
}

/* ---------- INIT ---------- */
updateBadges();
switchAnimeTab(readRoute());