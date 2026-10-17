/* =========================================================
   DyyMovie — app.js
   Frontend logic untuk index.html
   Backend: /api/movies
   Creator: @Zerozx
   ========================================================= */

const API = "/api/movies";
const main = document.getElementById("main");
const nav = document.getElementById("nav");
const toastEl = document.getElementById("toast");
const toastMsg = document.getElementById("toastMsg");
const heroEl = document.getElementById("hero");

/* ---------- LocalStorage DB ---------- */
const DB = {
  FAV: "zerozx_favorites",
  HIST: "zerozx_history",
  SEARCH_HIST: "zerozx_search_history",
  get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; } },
  set(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} },
};

const favorites = {
  list(){ return DB.get(DB.FAV, []); },
  has(slug){ return this.list().some(m=>m.slug===slug); },
  toggle(movie){
    const list = this.list();
    const idx = list.findIndex(m=>m.slug===movie.slug);
    if(idx >= 0){ list.splice(idx, 1); DB.set(DB.FAV, list); updateBadges(); return false; }
    list.unshift({ ...movie, savedAt: Date.now() });
    DB.set(DB.FAV, list);
    updateBadges();
    return true;
  },
};

const history = {
  list(){ return DB.get(DB.HIST, []); },
  add(movie){
    const list = this.list().filter(m=>m.slug!==movie.slug);
    list.unshift({ ...movie, watchedAt: Date.now() });
    DB.set(DB.HIST, list.slice(0, 100));
    updateBadges();
  },
  clear(){ DB.set(DB.HIST, []); updateBadges(); },
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

function imgUrl(path){
  if(!path) return "";
  if(path.startsWith("http")) return path;
  return "https://image.tmdb.org/t/p/w500" + path;
}
function esc(str=""){
  return String(str).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function api(params){
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}?${qs}`);
  return res.json();
}

function normalize(item){
  const poster = item.poster || item.poster_path || item.image || item.cover || item.thumbnail || "";
  const backdrop = item.backdrop || item.backdrop_path || item.banner || poster;
  const title = item.title || item.name || item.original_title || item.original_name || "Tanpa Judul";
  const year = (item.release_date || item.first_air_date || item.year || "").toString().slice(0,4) || "—";
  const rating = item.vote_average ?? item.rating ?? item.score ?? null;
  const overview = item.overview || item.description || item.synopsis || "Deskripsi belum tersedia untuk judul ini.";
  let genres = item.genres || item.genre_ids || (item.genre ? [item.genre] : []) || [];
  if(!Array.isArray(genres)) genres = [genres];
  const slug = item.slug || item.id || item.tmdb_id || item.movie_id || "";
  let type = item.type || item.media_type || null;
  if(!type){
    if(item.first_air_date || item.original_name || item.name) type = "tv";
    else if(item.release_date || item.title) type = "film";
  }
  return { poster, backdrop, title, year, rating, overview, genres, slug, type, raw:item };
}

function skeletonGrid(n=12){
  return `<div class="grid">${Array.from({length:n}).map(()=>`<div class="skeleton"></div>`).join("")}</div>`;
}
function skeletonRow(n=7){
  return `<div class="row-scroll">${Array.from({length:n}).map(()=>`<div class="skeleton"></div>`).join("")}</div>`;
}

/* ---------- Navigasi ke halaman player ---------- */
function goPlay(slug, type){
  if(!slug){ toast("ID film tidak ditemukan"); return; }
  const t = (type === "tv" || type === "series" || type === "show") ? "tv" : "film";
  window.location.href = `/play/${t}/${encodeURIComponent(slug)}`;
}

/* ---------- CARD ---------- */
function cardHTML(m, i=0, rank=null){
  const rating = m.rating ? Number(m.rating).toFixed(1) : null;
  const genreNames = m.genres.map(g=> typeof g==="string"?g:g.name).filter(Boolean).slice(0,3);
  const slugSafe = esc(m.slug);
  const titleSafe = esc(m.title);
  const typeSafe = esc(m.type || "film");
  const isFav = favorites.has(m.slug);
  const key = `c_${m.slug.replace(/[^a-z0-9]/gi,"_")}`;
  window[key] = m;

  return `
    <div class="card" style="animation-delay:${i*40}ms" onclick="goPlay('${slugSafe}','${typeSafe}')">
      <div class="card-poster">
        ${m.poster ? `<img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(imgUrl(m.poster))}" alt="${titleSafe}" onerror="dyyImgFail(this)">` : ""}
        ${rank !== null ? `<div class="card-rank">#${rank+1}</div>` : ""}
        ${rating ? `<div class="card-score">★ ${rating}</div>` : ""}
        <div class="card-actions">
          <button class="btn-mini ${isFav?'active':''}" onclick="event.stopPropagation();toggleFav('${slugSafe}', this)" title="Favorit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </button>
          <button class="btn-mini" onclick="event.stopPropagation();goPlay('${slugSafe}','${typeSafe}')" title="Putar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
        <div class="card-overlay">
          <div class="card-play">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </div>
          ${genreNames.length ? `<div class="card-overlay-genres">${genreNames.map(g=>`<span>${esc(g)}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="card-info">
        <div class="card-title">${titleSafe}</div>
        <div class="card-sub"><span>${esc(m.year)}</span>${rating?`<span class="star">★ ${rating}</span>`:""}</div>
      </div>
    </div>`;
}

function emptyState(msg, sub="Coba lagi nanti atau ganti kategori."){
  return `<div class="state">
    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>
    <h3>${esc(msg)}</h3><p>${esc(sub)}</p>
  </div>`;
}

function setActiveNav(name){
  document.querySelectorAll(".nav-links a").forEach(a=>{
    a.classList.toggle("active", a.dataset.nav === name);
  });
}
function setActiveDock(tab){
  document.querySelectorAll(".dock-btn").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab === tab);
  });
}

let currentTab = "home";

function switchTab(tab){
  currentTab = tab;
  setActiveDock(tab);
  window.scrollTo({top:0, behavior:"smooth"});

  if(tab === "home"){ goHome(); return; }
  heroEl.style.display = "none";
  if(tab === "search") renderSearchTab();
  else if(tab === "favorites") renderFavorites();
  else if(tab === "history") renderHistory();
}

/* =========================================================
   ROUTING URL
   ========================================================= */
const ROUTES = {
  home:      "/home",
  search:    "/search",
  favorites: "/favorites",
  history:   "/history",
};

function readRoute(){
  const path = location.pathname.replace(/\/+$/,"") || "/";
  for(const [tab, route] of Object.entries(ROUTES)){
    if(path === route) return tab;
  }
  return "home";
}

function setRoute(tab, { replace = false } = {}){
  const target = ROUTES[tab] || ROUTES.home;
  if(location.pathname === target) return;
  if(replace) history.replaceState({ tab }, "", target);
  else history.pushState({ tab }, "", target);
}

function routeToTab(tab, { push = true } = {}){
  if(!ROUTES[tab]) tab = "home";
  switchTab(tab);
  setRoute(tab, { replace: !push });
}

window.addEventListener("popstate", () => {
  const tab = readRoute();
  switchTab(tab);
});

/* ---------- Hero ---------- */
function setHero(m){
  heroEl.style.display = "flex";
  const bg = document.getElementById("heroBg");
  bg.style.backgroundImage = `url('${imgUrl(m.backdrop)}')`;
  document.getElementById("heroTitle").textContent = m.title;
  document.getElementById("heroDesc").textContent = m.overview;
  document.getElementById("heroMeta").innerHTML =
    `${m.rating?`<span class="score">★ ${Number(m.rating).toFixed(1)}</span>`:""}
     <span class="pill">HD</span>
     <span class="pill">${esc(m.year)}</span>
     <span>DyyMovie</span>`;
  document.getElementById("heroPlay").onclick = ()=>goPlay(m.slug, m.type || "film");
}

/* ---------- HOME ---------- */
async function goHome(){
  currentTab = "home";
  setActiveDock("home");
  setActiveNav("home");
  heroEl.style.display = "flex";
  window.scrollTo({top:0, behavior:"smooth"});

  main.innerHTML = `
    <section class="section">
      <div class="section-head">
        <div class="section-title">Populer Saat Ini</div>
        <div class="tabs">
          <button class="tab active" onclick="switchType('popular',this,'all')">Semua</button>
          <button class="tab" onclick="switchType('popular',this,'movie')">Film</button>
          <button class="tab" onclick="switchType('popular',this,'tv')">Serial</button>
        </div>
      </div>
      <div id="popular-wrap">${skeletonRow()}</div>
    </section>
    <section class="section">
      <div class="section-head"><div class="section-title">Segera Tayang</div></div>
      <div id="upcoming-wrap">${skeletonRow()}</div>
    </section>
    <section class="section">
      <div class="section-head"><div class="section-title">Terbaru</div></div>
      <div id="latest-wrap">${skeletonRow()}</div>
    </section>
    <section class="section">
      <div class="section-head">
        <div class="section-title">Top Rated</div>
        <div class="tabs">
          <button class="tab active" onclick="switchTopRated(this,'movie')">Film</button>
          <button class="tab" onclick="switchTopRated(this,'tv')">Serial</button>
        </div>
      </div>
      <div id="toprated-wrap">${skeletonRow()}</div>
    </section>
  `;

  await Promise.all([
    fillRow("popular-wrap", { action:"popular", type:"all", page:1 }, false),
    fillRow("upcoming-wrap",{ action:"upcoming", page:1 }, false),
    fillRow("latest-wrap",  { action:"latest", type:"all" }, false),
    fillRow("toprated-wrap",{ action:"top-rated", type:"movie", page:1 }, true)
  ]);

  try{
    const r = await api({action:"popular",type:"all",page:1});
    const list = (r.results||[]).map(normalize).filter(x=>x.backdrop);
    if(list[0]) setHero(list[0]);
  }catch(e){}
}

async function fillRow(wrapId, params, ranked=false){
  const wrap = document.getElementById(wrapId);
  if(!wrap) return;
  try{
    const res = await api(params);
    const list = (res.results||[]).map(normalize);
    if(!list.length){ wrap.innerHTML = emptyState("Belum ada data"); return; }
    wrap.innerHTML = `<div class="row-scroll">${list.map((m,i)=>cardHTML(m,i, ranked?i:null)).join("")}</div>`;
  }catch(e){
    wrap.innerHTML = emptyState("Gagal memuat data");
  }
}

/* ---------- SECTION ---------- */
async function loadSection(action){
  currentTab = "section";
  setActiveDock("");
  setActiveNav(action);
  heroEl.style.display = "none";
  window.scrollTo({top:0, behavior:"smooth"});

  const titles = {
    popular:"Film & Serial Populer",
    upcoming:"Segera Tayang",
    latest:"Rilisan Terbaru",
    "top-rated":"Rating Tertinggi"
  };

  main.innerHTML = `
    <section class="section" style="padding-top:40px">
      <div class="section-head">
        <div class="section-title">${titles[action] || "Jelajahi"}</div>
        ${(action==="popular"||action==="top-rated") ? `
          <div class="tabs">
            <button class="tab active" onclick="switchType('${action}',this,'all')">Semua</button>
            <button class="tab" onclick="switchType('${action}',this,'movie')">Film</button>
            <button class="tab" onclick="switchType('${action}',this,'tv')">Serial</button>
          </div>` : ""}
      </div>
      <div id="section-grid">${skeletonGrid(12)}</div>
    </section>
  `;

  await loadSectionGrid(action, action==="top-rated" ? "movie" : "all");
}

async function loadSectionGrid(action, type="all"){
  const wrap = document.getElementById("section-grid");
  if(!wrap) return;
  wrap.innerHTML = skeletonGrid(12);
  try{
    const params = { action };
    if(action==="popular"){ params.type = type; params.page = 1; }
    else if(action==="upcoming"){ params.page = 1; }
    else if(action==="latest"){ params.type = type; }
    else if(action==="top-rated"){ params.type = type; params.page = 1; }

    const res = await api(params);
    const list = (res.results||[]).map(normalize);
    if(!list.length){ wrap.innerHTML = emptyState("Belum ada data"); return; }
    wrap.innerHTML = `<div class="grid">${list.map((m,i)=>cardHTML(m,i, action==="top-rated"?i:null)).join("")}</div>`;
  }catch(e){
    wrap.innerHTML = emptyState("Gagal memuat data");
  }
}

function switchType(action, el, type){
  el.parentElement.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  el.classList.add("active");
  loadSectionGrid(action, type);
}

function switchTopRated(el, type){
  el.parentElement.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  el.classList.add("active");
  fillRow("toprated-wrap", { action:"top-rated", type, page:1 }, true);
}

/* =========================================================
   SEARCH TAB
   ========================================================= */
const POPULAR_KEYWORDS = [
  "Avatar", "Oppenheimer", "Dune", "Barbie", "John Wick",
  "Spiderman", "Batman", "Interstellar", "Inception", "Naruto"
];

function renderSearchTab(initialQuery=""){
  const sh = searchHistory.list();

  main.innerHTML = `
    <div class="search-hero">
      <h1>Cari <span class="red">Film & Serial</span></h1>
      <p class="sub">Temukan ribuan judul dari seluruh dunia</p>

      <div class="big-search ${initialQuery?'has-value':''}" id="bigSearchWrap">
        <svg class="lead" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="bigSearchInput" type="text" placeholder="Ketik judul film atau serial..." value="${esc(initialQuery)}" autocomplete="off">
        <button class="btn-clear" onclick="clearBigSearch()" title="Bersihkan">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
        <button class="btn-search" id="btnSearchGo" onclick="submitBigSearch()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <span class="txt">Cari</span>
        </button>
      </div>

      ${sh.length ? `
        <div class="chips-wrap">
          <div class="chips-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
            Riwayat Pencarian
          </div>
          <div class="chips">
            ${sh.map(q=>`
              <span class="chip" onclick="submitBigSearch('${esc(q)}')">
                ${esc(q)}
                <svg class="rm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" onclick="event.stopPropagation();removeSearchHistory('${esc(q)}')"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </span>
            `).join("")}
            <span class="chip chip-clear" onclick="clearSearchHistory()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              Hapus semua
            </span>
          </div>
        </div>
      ` : ""}

      <div class="chips-wrap">
        <div class="chips-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="fire"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-4 4-8 4-8z" opacity=".6"/><path d="M8.5 9.5c-1.5 2-3 4-3 6.5a6.5 6.5 0 0 0 13 0c0-3-2-5-4.5-7-.5 1.5-1.5 2.5-3 2.5-1 0-2-.5-2.5-2z"/></svg>
          Pencarian Populer
        </div>
        <div class="chips">
          ${POPULAR_KEYWORDS.map(k=>`<span class="chip" onclick="submitBigSearch('${esc(k)}')">${esc(k)}</span>`).join("")}
        </div>
      </div>
    </div>

    <section class="search-section" id="searchResultSection">
      <div class="search-section-title">🔥 Trending Sekarang</div>
      <div id="trendingGrid">${skeletonGrid(10)}</div>
    </section>
  `;

  const input = document.getElementById("bigSearchInput");
  input.addEventListener("input", ()=>{
    document.getElementById("bigSearchWrap").classList.toggle("has-value", !!input.value);
  });
  input.addEventListener("keydown", e=>{ if(e.key === "Enter") submitBigSearch(); });
  if(!initialQuery) setTimeout(()=>input.focus(), 150);

  if(initialQuery) doSearchFromTab(initialQuery);
  else loadTrending();
}

async function loadTrending(){
  const wrap = document.getElementById("trendingGrid");
  if(!wrap) return;
  try{
    const res = await api({ action:"popular", type:"all", page:1 });
    const list = (res.results||[]).map(normalize).slice(0, 20);
    if(!list.length){ wrap.innerHTML = emptyState("Belum ada data trending"); return; }
    wrap.innerHTML = `<div class="grid">${list.map((m,i)=>cardHTML(m,i)).join("")}</div>`;
  }catch(e){
    wrap.innerHTML = emptyState("Gagal memuat trending");
  }
}

function clearBigSearch(){
  const input = document.getElementById("bigSearchInput");
  input.value = "";
  document.getElementById("bigSearchWrap").classList.remove("has-value");
  input.focus();
  renderSearchTab();
}

async function submitBigSearch(forceQuery){
  const q = (forceQuery !== undefined ? forceQuery : document.getElementById("bigSearchInput").value).trim();
  if(!q){ toast("Masukkan kata kunci"); return; }
  searchHistory.add(q);
  doSearchFromTab(q);
}

async function doSearchFromTab(q){
  const input = document.getElementById("bigSearchInput");
  if(input){ input.value = q; document.getElementById("bigSearchWrap").classList.add("has-value"); }

  const section = document.getElementById("searchResultSection");
  if(!section){ renderSearchTab(q); return; }
  section.innerHTML = `
    <div class="search-section-title">Hasil untuk "${esc(q)}"</div>
    <div id="searchResultGrid">${skeletonGrid(12)}</div>
  `;

  try{
    const res = await api({ action:"search", q, page:1 });
    const list = (res.results||[]).map(normalize);
    const wrap = document.getElementById("searchResultGrid");
    if(!list.length){
      wrap.innerHTML = emptyState("Tidak ditemukan", `Tidak ada hasil untuk "${q}". Coba kata kunci lain.`);
      return;
    }
    wrap.innerHTML = `<div class="grid">${list.map((m,i)=>cardHTML(m,i)).join("")}</div>`;
  }catch(e){
    document.getElementById("searchResultGrid").innerHTML = emptyState("Gagal mencari", "Periksa koneksi dan coba lagi.");
  }
}

function removeSearchHistory(q){
  searchHistory.remove(q);
  renderSearchTab(document.getElementById("bigSearchInput")?.value || "");
}
function clearSearchHistory(){
  searchHistory.clear();
  toast("Riwayat pencarian dihapus");
  renderSearchTab();
}

/* =========================================================
   FAVORITES TAB
   ========================================================= */
function renderFavorites(){
  const list = favorites.list();
  if(!list.length){
    main.innerHTML = `
      <div class="tab-hero">
        <h1>Daftar <span class="red">Favorit</span></h1>
        <p>Simpan film dan serial favoritmu supaya gampang ditemukan lagi nanti.</p>
      </div>
      <section class="section" style="padding-top:20px">
        ${emptyState("Belum ada favorit", "Tap ikon ❤ pada kartu film untuk menyimpannya di sini.")}
      </section>
    `;
    return;
  }
  main.innerHTML = `
    <div class="tab-hero">
      <h1>Daftar <span class="red">Favorit</span></h1>
      <p>Film dan serial pilihanmu yang tersimpan.</p>
      <div class="count"><span class="red">❤</span> ${list.length} judul tersimpan</div>
    </div>
    <section class="section" style="padding-top:20px">
      <div class="grid">${list.map((m,i)=>cardHTML(m,i)).join("")}</div>
    </section>
  `;
}

/* =========================================================
   HISTORY TAB
   ========================================================= */
function renderHistory(){
  const list = history.list();
  if(!list.length){
    main.innerHTML = `
      <div class="tab-hero">
        <h1>Riwayat <span class="red">Tontonan</span></h1>
        <p>Semua film yang pernah kamu buka atau putar akan muncul di sini.</p>
      </div>
      <section class="section" style="padding-top:20px">
        ${emptyState("Riwayat masih kosong", "Mulai tonton film untuk mengisi riwayat.")}
      </section>
    `;
    return;
  }
  main.innerHTML = `
    <div class="tab-hero">
      <h1>Riwayat <span class="red">Tontonan</span></h1>
      <p>Lanjutkan dari yang terakhir kamu buka.</p>
      <div class="count"><span class="red">${list.length}</span> judul dalam riwayat</div>
    </div>
    <section class="section" style="padding-top:20px">
      <div class="section-head" style="justify-content:flex-end">
        <button class="btn btn-ghost" style="padding:10px 20px;font-size:13px" onclick="clearHistory()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          Hapus Semua
        </button>
      </div>
      <div class="grid">${list.map((m,i)=>cardHTML(m,i)).join("")}</div>
    </section>
  `;
}

function clearHistory(){
  if(!confirm("Hapus semua riwayat tontonan?")) return;
  history.clear();
  toast("Riwayat dihapus");
  renderHistory();
}

/* =========================================================
   FAVORITE TOGGLE
   ========================================================= */
function toggleFav(slug, btnEl){
  const key = `c_${slug.replace(/[^a-z0-9]/gi,"_")}`;
  let movie = window[key];
  if(!movie) movie = { slug, title:slug };
  const added = favorites.toggle(movie);
  if(btnEl){
    btnEl.classList.toggle("active", added);
    const svg = btnEl.querySelector("svg");
    if(svg) svg.setAttribute("fill", added ? "currentColor" : "none");
  }
  toast(added ? "Ditambahkan ke favorit ❤" : "Dihapus dari favorit");
  if(currentTab === "favorites") renderFavorites();
}

/* =========================================================
   MODAL DETAIL (backup)
   ========================================================= */
async function openDetail(slug, fallbackTitle){
  if(!slug){ toast("Detail tidak tersedia"); return; }
  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");
  modal.classList.add("open");
  content.innerHTML = `<div style="padding:80px;text-align:center"><div class="spinner"></div><p style="color:var(--muted)">Memuat detail...</p></div>`;

  try{
    const res = await api({ action:"detail", slug });
    const raw = res.results || res.data || res;
    const m = normalize(raw);
    const key = `c_${m.slug.replace(/[^a-z0-9]/gi,"_")}`;
    window[key] = m;
    const isFav = favorites.has(m.slug);

    content.innerHTML = `
      <div class="modal-head">
        <button class="modal-close" onclick="closeModal()">×</button>
        ${(m.backdrop||m.poster) ? `<img src="${esc(imgUrl(m.backdrop||m.poster))}" alt="${esc(m.title)}">` : ""}
      </div>
      <div class="modal-body">
        <h2 class="modal-title">${esc(m.title || fallbackTitle || "Tanpa Judul")}</h2>
        <div class="modal-meta">
          ${m.rating?`<span class="score">★ ${Number(m.rating).toFixed(1)}</span>`:""}
          <span class="pill">HD</span>
          <span class="pill">${esc(m.year)}</span>
        </div>
        ${m.genres.length ? `<div class="modal-genres">${m.genres.map(g=>`<span>${esc(typeof g==="string"?g:g.name)}</span>`).join("")}</div>` : ""}
        <p class="modal-desc">${esc(m.overview)}</p>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="goPlay('${esc(m.slug)}','${esc(m.type||"film")}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            Tonton Sekarang
          </button>
          <button class="btn btn-ghost" onclick="toggleFav('${esc(m.slug)}', this)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            ${isFav ? "Tersimpan" : "Favoritkan"}
          </button>
        </div>
      </div>
    `;
  }catch(e){
    content.innerHTML = `
      <div style="padding:40px;text-align:center">
        <button class="modal-close" onclick="closeModal()">×</button>
        <h3 style="margin-bottom:8px">Gagal memuat detail</h3>
        <p style="color:var(--muted);font-size:14px">${esc(e.message||"Terjadi kesalahan")}</p>
      </div>`;
  }
}

function closeModal(){
  document.getElementById("modal").classList.remove("open");
}

/* ---------- SCROLL ---------- */
window.addEventListener("scroll", () => {
  nav.classList.toggle("scrolled", window.scrollY > 30);
}, { passive: true });

/* =========================================================
   INIT
   ========================================================= */
updateBadges();
const initialTab = readRoute();
routeToTab(initialTab, { push: false });