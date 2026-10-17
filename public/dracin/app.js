/* DyyRacin — Dracin streaming front-end
   Talks to the saipulanuar drama API (source: dramabox).
   Every network call goes through /.netlify/functions/dracin-proxy first (avoids
   CORS once deployed on Netlify) and falls back to a direct fetch so the
   page still works when opened locally without Netlify Functions running. */
(function () {
  "use strict";

  var SOURCE = "dramabox";
  var DIRECT_BASE = "https://api.saipulanuar.eu.org/api/drama";
  var PROXY_BASE = "/.netlify/functions/dracin-proxy";
  var TIMEOUT_MS = 14000;

  // ---------------------------------------------------------------- utils

  function qs(params) {
    var usp = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
        usp.set(k, params[k]);
      }
    });
    return usp.toString();
  }

  function fetchWithTimeout(url, ms) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms || TIMEOUT_MS);
    return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .finally(function () { clearTimeout(timer); });
  }

  // Calls one drama endpoint ("trending" | "foryou" | "recommended" | "search" | "detail" | "episode")
  // and returns the parsed JSON body. Tries the Netlify proxy first, then a
  // direct call to the public API as a fallback.
  function apiGet(endpoint, params) {
    var full = Object.assign({ source: SOURCE }, params || {});
    var query = qs(full);
    var proxyUrl = PROXY_BASE + "?path=" + encodeURIComponent(endpoint) + (query ? "&" + query : "");
    var directUrl = DIRECT_BASE + "/" + endpoint + (query ? "?" + query : "");

    return fetchWithTimeout(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error("proxy-http-" + res.status);
        return res.json();
      })
      .catch(function () {
        return fetchWithTimeout(directUrl).then(function (res) {
          if (!res.ok) throw new Error("direct-http-" + res.status);
          return res.json();
        });
      });
  }

  function escapeHTML(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function truthyList(json) {
    if (json && Array.isArray(json.result)) return json.result;
    if (Array.isArray(json)) return json;
    return [];
  }

  function pickImage(item) {
    return (item && (item.posterImg || item.cover)) || "";
  }

  function totalEps(item) {
    if (!item) return 0;
    var n = item.totalEpisodes;
    if (n === undefined || n === null || n === "" || n === 0) n = item.episodes;
    if (Array.isArray(n)) return n.length; // some sources put the full episode list under "episodes"
    return typeof n === "number" ? n : parseInt(n, 10) || 0;
  }

  // Looks up this drama's per-episode lock state, when the detail endpoint
  // provided a full "episodes" array (not every source does).
  function episodeLockInfo(item, epNumber) {
    var list = item && Array.isArray(item.episodes) ? item.episodes : null;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if ((e.number || e.episodeNumber) === epNumber) return e;
    }
    return null;
  }

  // Recursively hunt an object for anything that looks like a playable
  // video URL, since third-party wrapper APIs vary in field naming.
  function deepFindVideoUrl(obj, depth, seen) {
    depth = depth || 0;
    if (depth > 6 || !obj || typeof obj !== "object") return null;
    seen = seen || new Set();
    if (seen.has(obj)) return null;
    seen.add(obj);

    var preferred = [
      "videoUrl", "video_url", "playUrl", "play_url", "hlsUrl", "hls_url",
      "streamUrl", "stream_url", "cdnUrl", "cdn_url", "m3u8", "url", "videoPath"
    ];
    for (var i = 0; i < preferred.length; i++) {
      var v = obj[preferred[i]];
      if (typeof v === "string" && /\.(m3u8|mp4)(\?|$)/i.test(v)) return v;
    }
    for (var key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      var val = obj[key];
      if (typeof val === "string" && /^https?:\/\/.+\.(m3u8|mp4)(\?.*)?$/i.test(val)) return val;
      if (val && typeof val === "object") {
        var found = deepFindVideoUrl(val, depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function extractApiError(json) {
    if (!json) return "Tidak ada respons dari server.";
    if (json.status === false) {
      return (json.result && (json.result.error || json.result.message)) || json.message || "Permintaan gagal.";
    }
    if (json.result && typeof json.result === "object" && json.result.error) {
      return json.result.error;
    }
    return null;
  }

  // ------------------------------------------------------------- toast UI

  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add("is-shown"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-shown");
      setTimeout(function () { toastEl.hidden = true; }, 250);
    }, 3200);
  }

  // ------------------------------------------------------------ app state

  var app = document.getElementById("app");
  var state = {
    tab: "trending",
    query: "",
    trending: [],
    foryou: [],
    recommended: [],
    searchResults: [],
    heroIndex: 0,
    heroTimer: null,
    activeDetail: null,   // seed item currently shown in the panel
    activeEpisode: null,  // { id, ep, title, total, list }
  };
  var dataStore = {}; // id -> most complete item data seen so far, for the detail panel

  function rememberItem(item) {
    if (!item || !item.id) return;
    dataStore[item.id] = Object.assign({}, dataStore[item.id] || {}, item);
  }

  // --------------------------------------------------------------- shell

  function render() {
    app.innerHTML =
      '<section class="hero" id="hero"></section>' +
      '<section class="section" id="mainSection">' +
        '<div class="section-head">' +
          '<h2 class="section-title" id="sectionTitle">Trending minggu ini</h2>' +
          '<span class="section-sub" id="sectionSub"></span>' +
        '</div>' +
        '<div class="grid" id="grid"></div>' +
      '</section>';
    renderHeroSkeleton();
    renderSkeletonGrid(document.getElementById("grid"), 12);
  }

  function renderHeroSkeleton() {
    var hero = document.getElementById("hero");
    hero.innerHTML =
      '<div class="hero-bg skeleton" style="position:absolute;inset:0;"></div>' +
      '<div class="hero-scrim"></div>' +
      '<div class="hero-body"><div class="hero-eyebrow">Memuat…</div></div>';
  }

  function renderSkeletonGrid(container, n) {
    var html = "";
    for (var i = 0; i < n; i++) {
      html +=
        '<div class="card is-skeleton">' +
          '<div class="card-poster skeleton"></div>' +
          '<div class="card-info">' +
            '<div class="skeleton" style="height:12px;border-radius:4px;margin-bottom:6px;"></div>' +
            '<div class="skeleton" style="height:12px;width:60%;border-radius:4px;"></div>' +
          '</div>' +
        '</div>';
    }
    container.innerHTML = html;
  }

  function renderEmpty(container, title, sub) {
    container.innerHTML =
      '<div class="state-panel" style="grid-column:1/-1;">' +
        '<div class="state-title">' + escapeHTML(title) + '</div>' +
        '<div class="state-sub">' + escapeHTML(sub) + '</div>' +
      '</div>';
  }

  // --------------------------------------------------------------- hero

  function renderHero(items) {
    var hero = document.getElementById("hero");
    var pool = items.slice(0, 5);
    if (!pool.length) { hero.innerHTML = ""; hero.style.display = "none"; return; }
    hero.style.display = "";

    function paint(i) {
      var item = pool[i];
      var img = pickImage(item);
      hero.innerHTML =
        '<div class="hero-bg" style="background-image:url(\'' + (img ? img.replace(/'/g, "%27") : "") + '\')"></div>' +
        '<div class="hero-scrim"></div>' +
        '<div class="hero-body">' +
          '<div class="hero-eyebrow">Sedang naik daun</div>' +
          '<h1 class="hero-title">' + escapeHTML(item.title || "Tanpa judul") + '</h1>' +
          '<div class="hero-meta"><span>' + totalEps(item) + ' episode</span><span>' + (item.isCompleted === "1" ? "Tamat" : "Berjalan") + '</span></div>' +
          '<p class="hero-syn">' + escapeHTML(item.synopsis || item.description || "Sinopsis belum tersedia.") + '</p>' +
          '<div class="hero-actions">' +
            '<button class="btn btn-primary" id="heroPlay">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg> Tonton episode 1' +
            '</button>' +
            '<button class="btn btn-ghost" id="heroDetail">Lihat detail</button>' +
          '</div>' +
        '</div>' +
        '<div class="hero-dots" id="heroDots"></div>';

      var dotsWrap = document.getElementById("heroDots");
      pool.forEach(function (_, di) {
        var d = document.createElement("button");
        d.className = "hero-dot" + (di === i ? " is-active" : "");
        d.setAttribute("aria-label", "Slide " + (di + 1));
        d.addEventListener("click", function () { setHero(di); });
        dotsWrap.appendChild(d);
      });

      document.getElementById("heroPlay").addEventListener("click", function () {
        rememberItem(item);
        openPlayer(item.id, item.title, totalEps(item), 1);
      });
      document.getElementById("heroDetail").addEventListener("click", function () {
        openDetail(item);
      });
    }

    function setHero(i) {
      state.heroIndex = i;
      paint(i);
    }

    clearInterval(state.heroTimer);
    setHero(0);
    state.heroTimer = setInterval(function () {
      setHero((state.heroIndex + 1) % pool.length);
    }, 6500);
  }

  // --------------------------------------------------------------- grid

  // Shared <img onerror> handler for posters — swaps a broken image for a
  // text fallback card. Defined once globally instead of inlining JS per
  // card, so we never have to embed quote characters inside an HTML
  // attribute (which was corrupting the surrounding markup).
  window.__posterFallback = function (img) {
    var div = document.createElement("div");
    div.className = "card-fallback";
    div.textContent = img.getAttribute("data-title") || "Tanpa judul";
    img.replaceWith(div);
  };

  function cardHTML(item) {
    var img = pickImage(item);
    var eps = totalEps(item);
    var title = item.title || "Tanpa judul";
    var fallback = '<div class="card-fallback">' + escapeHTML(title) + '</div>';
    return (
      '<article class="card" tabindex="0" data-id="' + escapeHTML(item.id) + '">' +
        '<div class="card-poster">' +
          (img
            ? '<img loading="lazy" src="' + escapeHTML(img) + '" alt="' + escapeHTML(title) + '" data-title="' + escapeHTML(title) + '" onerror="window.__posterFallback(this)">'
            : fallback) +
          '<span class="card-badge' + (item.isCompleted !== "1" ? " is-live" : "") + '">' + (item.isCompleted === "1" ? "Tamat" : "On going") + '</span>' +
        '</div>' +
        '<div class="card-info">' +
          '<div class="card-title">' + escapeHTML(item.title || "Tanpa judul") + '</div>' +
          '<div class="card-eps">' + (eps ? eps + " episode" : "—") + '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderGrid(container, items) {
    if (!items.length) {
      renderEmpty(container, "Tidak ada hasil", "Coba kata kunci lain atau kembali ke Trending.");
      return;
    }
    container.innerHTML = items.map(cardHTML).join("");
    container.querySelectorAll(".card").forEach(function (card) {
      var id = card.getAttribute("data-id");
      var item = dataStore[id];
      var open = function () { if (item) openDetail(item); };
      card.addEventListener("click", open);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    });
  }

  // --------------------------------------------------------------- loads

  function loadTrending() {
    document.getElementById("sectionTitle").textContent = "Trending minggu ini";
    document.getElementById("sectionSub").textContent = "";
    var grid = document.getElementById("grid");
    renderSkeletonGrid(grid, 12);
    renderHeroSkeleton();
    return apiGet("trending", {}).then(function (json) {
      var err = extractApiError(json);
      var list = truthyList(json);
      list.forEach(rememberItem);
      state.trending = list;
      if (!list.length) {
        renderEmpty(grid, "Belum ada data trending", err || "Server sedang tidak mengembalikan data. Coba lagi sebentar lagi.");
        document.getElementById("hero").style.display = "none";
        return;
      }
      renderHero(list);
      renderGrid(grid, list);
    }).catch(function () {
      renderEmpty(grid, "Gagal memuat trending", "Periksa koneksi internetmu lalu coba lagi.");
      document.getElementById("hero").style.display = "none";
    });
  }

  function loadForYou() {
    document.getElementById("sectionTitle").textContent = "Rekomendasi untukmu";
    document.getElementById("sectionSub").textContent = "";
    var grid = document.getElementById("grid");
    renderSkeletonGrid(grid, 12);
    return apiGet("foryou", { q: 1 }).then(function (json) {
      var err = extractApiError(json);
      var list = truthyList(json);
      list.forEach(rememberItem);
      state.foryou = list;
      if (!list.length) {
        renderEmpty(grid, "Belum ada rekomendasi", err || "Coba muat ulang beberapa saat lagi.");
        return;
      }
      renderGrid(grid, list);
    }).catch(function () {
      renderEmpty(grid, "Gagal memuat rekomendasi", "Periksa koneksi internetmu lalu coba lagi.");
    });
  }

  function loadRecommended() {
    document.getElementById("sectionTitle").textContent = "Pilihan redaksi";
    document.getElementById("sectionSub").textContent = "";
    var grid = document.getElementById("grid");
    renderSkeletonGrid(grid, 12);
    return apiGet("recommended", {}).then(function (json) {
      var err = extractApiError(json);
      var list = truthyList(json);
      list.forEach(rememberItem);
      state.recommended = list;
      if (!list.length) {
        renderEmpty(grid, "Belum ada rekomendasi", err || "Coba muat ulang beberapa saat lagi.");
        return;
      }
      renderGrid(grid, list);
    }).catch(function () {
      renderEmpty(grid, "Gagal memuat rekomendasi", "Periksa koneksi internetmu lalu coba lagi.");
    });
  }

  function loadSearch(q) {
    document.getElementById("sectionTitle").textContent = 'Hasil untuk "' + q + '"';
    document.getElementById("sectionSub").textContent = "";
    document.getElementById("hero").style.display = "none";
    clearInterval(state.heroTimer);
    var grid = document.getElementById("grid");
    renderSkeletonGrid(grid, 8);
    return apiGet("search", { q: q }).then(function (json) {
      var err = extractApiError(json);
      var list = truthyList(json);
      list.forEach(rememberItem);
      state.searchResults = list;
      if (!list.length) {
        renderEmpty(grid, "Tidak ketemu", err || 'Tidak ada drama yang cocok dengan "' + q + '".');
        return;
      }
      document.getElementById("sectionSub").textContent = list.length + " judul";
      renderGrid(grid, list);
    }).catch(function () {
      renderEmpty(grid, "Pencarian gagal", "Periksa koneksi internetmu lalu coba lagi.");
    });
  }

  function switchTab(tab) {
    state.tab = tab;
    state.query = "";
    searchInput.value = "";
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === tab);
    });
    document.getElementById("hero").style.display = "";
    if (tab === "trending") loadTrending();
    else if (tab === "foryou") loadForYou();
    else loadRecommended();
  }

  // -------------------------------------------------------------- detail

  var detailScrim, detailPanel;

  function ensureDetailDom() {
    if (detailScrim) return;
    detailScrim = document.createElement("div");
    detailScrim.className = "detail-scrim";
    detailPanel = document.createElement("div");
    detailPanel.className = "detail-panel";
    document.body.appendChild(detailScrim);
    document.body.appendChild(detailPanel);
    detailScrim.addEventListener("click", closeDetail);
  }

  function detailBodyHTML(item, loadingMore) {
    var img = pickImage(item);
    var eps = totalEps(item);
    var epsChips = "";
    var n = eps || 0;
    for (var i = 1; i <= n; i++) {
      var lock = episodeLockInfo(item, i);
      var isLocked = !!(lock && lock.locked);
      epsChips += '<button class="ep-chip' + (isLocked ? " is-locked" : "") + '" data-ep="' + i + '"' + (isLocked ? ' data-locked="1"' : "") + '>' + i + (isLocked ? ' <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px"><path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 016 0v3z"/></svg>' : "") + '</button>';
    }
    return (
      '<div class="detail-top">' +
        (img ? '<img class="detail-cover" src="' + escapeHTML(img) + '" alt="">' : '<div class="detail-cover"></div>') +
        '<div class="detail-cover-fade"></div>' +
        '<button class="icon-btn detail-close" id="detailCloseBtn" aria-label="Tutup">' +
          '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="detail-body">' +
        '<h2 class="detail-title">' + escapeHTML(item.title || "Tanpa judul") + '</h2>' +
        '<div class="detail-meta">' +
          '<span>' + (n || "?") + ' episode</span>' +
          '<span>' + (item.isCompleted === "1" ? "Tamat" : "Sedang berjalan") + '</span>' +
          (item.defaultLanguage ? '<span>' + escapeHTML(String(item.defaultLanguage).toUpperCase()) + '</span>' : "") +
        '</div>' +
        '<p class="detail-syn">' + escapeHTML(item.synopsis || item.description || (loadingMore ? "Memuat sinopsis…" : "Sinopsis belum tersedia.")) + '</p>' +
        '<div class="detail-actions">' +
          '<button class="btn btn-primary" id="detailPlayBtn">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg> Tonton episode 1' +
          '</button>' +
        '</div>' +
        '<div class="detail-eps-head"><h3>Episode</h3></div>' +
        (n ? '<div class="ep-grid">' + epsChips + '</div>' : '<p class="state-sub">Jumlah episode belum diketahui.</p>') +
      '</div>'
    );
  }

  function openDetail(seedItem) {
    ensureDetailDom();
    rememberItem(seedItem);
    var item = dataStore[seedItem.id] || seedItem;
    state.activeDetail = item;

    detailPanel.innerHTML = detailBodyHTML(item, true);
    wireDetailEvents(item);
    requestAnimationFrame(function () {
      detailScrim.classList.add("is-open");
      detailPanel.classList.add("is-open");
    });
    document.body.style.overflow = "hidden";
    history.pushState({ dracinDetail: item.id }, "", "#/detail/" + item.id);

    // fetch fuller detail in the background; merge in if it adds anything real
    apiGet("detail", { id: item.id }).then(function (json) {
      var err = extractApiError(json);
      var full = json && json.result && typeof json.result === "object" ? json.result : null;
      if (err || !full) return;
      var merged = Object.assign({}, item);
      ["title", "synopsis", "description", "posterImg", "cover", "episodes", "totalEpisodes", "isCompleted", "defaultLanguage"].forEach(function (k) {
        if (full[k] !== undefined && full[k] !== null && full[k] !== "") merged[k] = full[k];
      });
      rememberItem(merged);
      if (state.activeDetail && state.activeDetail.id === merged.id) {
        state.activeDetail = merged;
        detailPanel.innerHTML = detailBodyHTML(merged, false);
        wireDetailEvents(merged);
      }
    }).catch(function () { /* keep showing the seed data — non-fatal */ });
  }

  function wireDetailEvents(item) {
    var closeBtn = document.getElementById("detailCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", closeDetail);
    var playBtn = document.getElementById("detailPlayBtn");
    if (playBtn) playBtn.addEventListener("click", function () { openPlayer(item.id, item.title, totalEps(item), 1); });
    detailPanel.querySelectorAll(".ep-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        if (chip.getAttribute("data-locked") === "1") {
          showToast("Episode ini terkunci di sumbernya.");
          return;
        }
        openPlayer(item.id, item.title, totalEps(item), parseInt(chip.getAttribute("data-ep"), 10));
      });
    });
  }

  function closeDetail() {
    if (!detailPanel) return;
    detailScrim.classList.remove("is-open");
    detailPanel.classList.remove("is-open");
    document.body.style.overflow = "";
    state.activeDetail = null;
    if (location.hash.indexOf("/detail/") !== -1) history.back();
  }

  // -------------------------------------------------------------- player

  var playerOverlay = document.getElementById("playerOverlay");
  var videoEl = document.getElementById("videoEl");
  var videoState = document.getElementById("videoState");
  var episodeRail = document.getElementById("episodeRail");
  var playerTitle = document.getElementById("playerTitle");
  var playerEpLabel = document.getElementById("playerEpLabel");
  var playerPrev = document.getElementById("playerPrev");
  var playerNext = document.getElementById("playerNext");
  var hlsInstance = null;

  function setVideoState(mode, opts) {
    opts = opts || {};
    videoState.classList.remove("is-hidden");
    if (mode === "loading") {
      videoState.innerHTML = '<div class="spinner"></div><div class="vs-sub">Memuat episode…</div>';
    } else if (mode === "error") {
      videoState.innerHTML =
        '<div class="vs-title">Episode tidak bisa diputar</div>' +
        '<div class="vs-sub">' + escapeHTML(opts.message || "Video tidak tersedia untuk episode ini.") + '</div>' +
        '<button class="btn btn-ghost" id="videoRetry">Coba lagi</button>';
      var retry = document.getElementById("videoRetry");
      if (retry) retry.addEventListener("click", function () { loadEpisode(state.activeEpisode.ep); });
    } else {
      videoState.classList.add("is-hidden");
      videoState.innerHTML = "";
    }
  }

  function renderEpisodeRail() {
    var ep = state.activeEpisode;
    if (!ep) { episodeRail.innerHTML = ""; return; }
    var total = ep.total || 1;
    var html = "";
    for (var i = 1; i <= total; i++) {
      html += '<button class="rail-chip' + (i === ep.ep ? " is-active" : "") + '" data-ep="' + i + '">' + i + '</button>';
    }
    episodeRail.innerHTML = html;
    episodeRail.querySelectorAll(".rail-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        loadEpisode(parseInt(chip.getAttribute("data-ep"), 10));
      });
    });
    var activeChip = episodeRail.querySelector(".is-active");
    if (activeChip) activeChip.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function openPlayer(id, title, total, ep) {
    total = total || 1;
    ep = ep || 1;
    state.activeEpisode = { id: id, title: title, total: total, ep: ep };
    playerOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    playerTitle.textContent = title || "Tanpa judul";
    renderEpisodeRail();
    history.pushState({ dracinWatch: id, ep: ep }, "", "#/watch/" + id + "/" + ep);
    loadEpisode(ep);
  }

  function closePlayer() {
    playerOverlay.hidden = true;
    document.body.style.overflow = detailPanel && detailPanel.classList.contains("is-open") ? "hidden" : "";
    try { videoEl.pause(); } catch (e) {}
    videoEl.removeAttribute("src");
    videoEl.load();
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    state.activeEpisode = null;
    if (location.hash.indexOf("/watch/") !== -1) history.back();
  }

  function loadEpisode(ep) {
    var ctx = state.activeEpisode;
    if (!ctx) return;
    ctx.ep = ep;
    playerEpLabel.textContent = "Episode " + ep + (ctx.total ? " / " + ctx.total : "");
    playerPrev.disabled = ep <= 1;
    playerNext.disabled = ctx.total ? ep >= ctx.total : false;
    renderEpisodeRail();
    setVideoState("loading");

    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    try { videoEl.pause(); } catch (e) {}
    videoEl.removeAttribute("src");
    videoEl.load();

    apiGet("episode", { id: ctx.id, ep: ep }).then(function (json) {
      if (!state.activeEpisode || state.activeEpisode.id !== ctx.id || state.activeEpisode.ep !== ep) return; // stale
      var apiErr = extractApiError(json);
      var url = deepFindVideoUrl(json && json.result);
      if (!url) url = deepFindVideoUrl(json);
      if (!url) {
        setVideoState("error", { message: apiErr || "Episode ini belum tersedia dari sumbernya." });
        return;
      }
      playVideo(url);
    }).catch(function () {
      if (!state.activeEpisode || state.activeEpisode.id !== ctx.id || state.activeEpisode.ep !== ep) return;
      setVideoState("error", { message: "Gagal menghubungi server video. Periksa koneksimu." });
    });
  }

  function playVideo(url) {
    var isHls = /\.m3u8(\?|$)/i.test(url);
    function onReady() { setVideoState("ready"); videoEl.play().catch(function () {}); }
    function onFail() { setVideoState("error", { message: "Video gagal dimuat. Coba lagi." }); }

    if (isHls && window.Hls && window.Hls.isSupported()) {
      hlsInstance = new window.Hls({ maxBufferLength: 30 });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
      hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, onReady);
      hlsInstance.on(window.Hls.Events.ERROR, function (_evt, data) {
        if (data && data.fatal) onFail();
      });
    } else {
      videoEl.src = url;
      videoEl.addEventListener("loadedmetadata", onReady, { once: true });
      videoEl.addEventListener("error", onFail, { once: true });
    }
  }

  playerPrev.addEventListener("click", function () {
    if (state.activeEpisode && state.activeEpisode.ep > 1) loadEpisode(state.activeEpisode.ep - 1);
  });
  playerNext.addEventListener("click", function () {
    var ctx = state.activeEpisode;
    if (ctx && (!ctx.total || ctx.ep < ctx.total)) loadEpisode(ctx.ep + 1);
  });
  document.getElementById("playerClose").addEventListener("click", closePlayer);

  // ---------------------------------------------------------------- nav

  var tabs = document.getElementById("tabs");
  tabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    switchTab(btn.getAttribute("data-tab"));
  });

  var searchForm = document.getElementById("searchForm");
  var searchInput = document.getElementById("searchInput");
  var searchDebounce = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchDebounce);
    var q = searchInput.value.trim();
    searchDebounce = setTimeout(function () {
      if (!q) { switchTab(state.tab === "search" ? "trending" : state.tab); return; }
      state.tab = "search";
      state.query = q;
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("is-active"); });
      loadSearch(q);
    }, 380);
  });
  searchForm.addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(searchDebounce);
    var q = searchInput.value.trim();
    if (q) { state.tab = "search"; state.query = q; loadSearch(q); }
  });

  document.querySelector(".brand").addEventListener("click", function (e) {
    e.preventDefault();
    closePlayer();
    closeDetail();
    switchTab("trending");
  });

  window.addEventListener("popstate", function () {
    if (!playerOverlay.hidden) { closePlayerSilently(); }
    else if (detailPanel && detailPanel.classList.contains("is-open")) { closeDetailSilently(); }
  });
  function closePlayerSilently() {
    playerOverlay.hidden = true;
    document.body.style.overflow = detailPanel && detailPanel.classList.contains("is-open") ? "hidden" : "";
    try { videoEl.pause(); } catch (e) {}
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    state.activeEpisode = null;
  }
  function closeDetailSilently() {
    detailScrim.classList.remove("is-open");
    detailPanel.classList.remove("is-open");
    document.body.style.overflow = "";
    state.activeDetail = null;
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!playerOverlay.hidden) closePlayer();
    else if (detailPanel && detailPanel.classList.contains("is-open")) closeDetail();
  });

  // --------------------------------------------------------------- boot

  render();
  loadTrending();
})();
