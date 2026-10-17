'use strict';
const API = '/.netlify/functions/donghua-api';
const $ = (s) => document.querySelector(s);
const app = $('#app');
const cache = new Map();
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jumat", 'Sabtu'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (u) => u ? `/.netlify/functions/donghua-img?src=${encodeURIComponent(u)}` : '';
const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return ''; };

async function api(ep, params = {}) {
  const qs = new URLSearchParams({ ep, ...params }).toString();
  if (cache.has(qs)) return cache.get(qs);
  const r = await fetch(`${API}?${qs}`);
  let j; try { j = await r.json(); } catch { throw new Error('Respon server tidak valid'); }
  if (!r.ok) throw new Error((j && j.error) || `HTTP ${r.status}`);
  cache.set(qs, j);
  return j;
}

/* ---------- normalisasi item drama/series ---------- */
function toItem(o) {
  return {
    title: String(pick(o, ['title', 'name', 'bookName'])),
    url: String(pick(o, ['url', 'link', 'href'])),
    cover: String(pick(o, ['thumbnail', 'cover', 'poster', 'image', 'img'])),
    episode: String(pick(o, ['episode', 'chapter', 'ep']) || ''),
    status: String(pick(o, ['status']) || ''),
    type: String(pick(o, ['type']) || ''),
  };
}
function findArraysOfItems(node, out = [], depth = 0) {
  if (!node || depth > 6) return out;
  if (Array.isArray(node)) {
    const looksLikeItems = node.length && node.every((x) => x && typeof x === 'object' && !Array.isArray(x) && (x.title || x.name || x.bookName) && (x.url || x.link || x.href));
    if (looksLikeItems) out.push(node);
    else node.forEach((n) => findArraysOfItems(n, out, depth + 1));
  } else if (typeof node === 'object') {
    Object.values(node).forEach((n) => findArraysOfItems(n, out, depth + 1));
  }
  return out;
}
function allItems(j) {
  const seen = new Set(), res = [];
  findArraysOfItems(j).flat().forEach((o) => {
    const it = toItem(o);
    const key = it.url || it.title;
    if (key && !seen.has(key)) { seen.add(key); res.push(it); }
  });
  return res;
}

/* ---------- pencarian string URL video/embed di dalam objek ---------- */
function isVideoFile(u) { return /\.(mp4|m3u8|webm|mov)(\?|$)/i.test(u); }
function isHttpUrl(u) { return /^https?:\/\//i.test(u); }
function findMediaCandidates(node, out = [], depth = 0) {
  if (!node || depth > 8) return out;
  if (typeof node === 'string') {
    if (isHttpUrl(node) && !/\.(jpe?g|png|webp|gif|avif|svg)(\?|$)/i.test(node)) out.push(node);
  } else if (Array.isArray(node)) node.forEach((n) => findMediaCandidates(n, out, depth + 1));
  else if (typeof node === 'object') Object.values(node).forEach((n) => findMediaCandidates(n, out, depth + 1));
  return out;
}
function mediaServers(j) {
  const list = [...new Set(findMediaCandidates(j))];
  return list.map((url, i) => ({ label: `Server ${i + 1}`, url, video: isVideoFile(url) }));
}

/* ---------- episode dari halaman detail ---------- */
function findEpisodeArray(j) {
  let best = [];
  (function walk(n, d) {
    if (!n || d > 7) return;
    if (Array.isArray(n)) {
      const hit = n.length && n.every((x) => x && typeof x === 'object' && !Array.isArray(x)) &&
        n.some((x) => /episode|eps|chapter/i.test(JSON.stringify(Object.keys(x))) || /episode/i.test(String(pick(x, ['title', 'name']))));
      if (hit && n.length > best.length) best = n;
      n.forEach((x) => walk(x, d + 1));
    } else if (typeof n === 'object') Object.values(n).forEach((x) => walk(x, d + 1));
  })(j, 0);
  return best.map((e) => ({
    title: String(pick(e, ['title', 'name', 'episodeTitle']) || 'Episode'),
    url: String(pick(e, ['url', 'link', 'href']) || ''),
    episode: String(pick(e, ['episode', 'ep', 'chapter']) || ''),
  })).filter((e) => e.url);
}

/* ---------- render umum ---------- */
const loading = () => { app.innerHTML = '<div class="state"><div class="spin"></div>Memuat…</div>'; };
const fail = (m, retry) => {
  app.innerHTML = `<div class="state">${esc(m)}<br><br><button class="btn" id="retry">Coba lagi</button></div>`;
  $('#retry').onclick = retry;
};
function cardsHtml(list) {
  return `<div class="grid">${list.map((d, i) => `
    <div class="card" data-i="${i}">
      <div class="img" style="${d.cover ? `background-image:url('${esc(img(d.cover))}')` : ''}">
        ${d.episode ? `<span class="badge">${esc(d.episode)}</span>` : ''}
        ${d.status ? `<span class="badge status">${esc(d.status)}</span>` : ''}
      </div>
      <div class="t">${esc(d.title)}</div>
    </div>`).join('')}</div>`;
}
function bindCards(root, list) {
  root.querySelectorAll('.card').forEach((c) => {
    c.onclick = () => {
      const d = list[Number(c.dataset.i)];
      if (!d || !d.url) return;
      sessionStorage.setItem('d_' + d.url, JSON.stringify(d));
      // Kalau url mengarah ke episode tertentu, langsung putar; kalau ke halaman series, buka detail.
      if (/episode/i.test(d.url) && /-\d+/.test(d.url) === false && /episode-\d+/i.test(d.url)) {
        location.hash = '#/watch/' + encodeURIComponent(d.url) + '/' + encodeURIComponent(d.title);
      } else {
        location.hash = '#/detail/' + encodeURIComponent(d.url);
      }
    };
  });
}
function setTab(t) { document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.t === t)); }

/* ---------- halaman ---------- */
async function viewHome() {
  setTab('home'); loading();
  try {
    const j = await api('donghub-home');
    const latest = (j.latestEpisodes || []).map(toItem);
    const popular = (j.popularSeries || []).map(toItem);
    app.innerHTML = `
      ${latest.length ? `<h2>Episode Terbaru</h2>${cardsHtml(latest)}` : ''}
      ${popular.length ? `<h2>Series Populer</h2>${cardsHtml(popular)}` : ''}
      ${!latest.length && !popular.length ? '<div class="state">Data beranda tidak ditemukan.</div>' : ''}`;
    const secs = app.querySelectorAll('.grid');
    if (secs[0]) bindCards(secs[0], latest);
    if (secs[1]) bindCards(secs[1], popular);
  } catch (e) { fail(e.message, viewHome); }
}
async function viewList(ep, title, tab) {
  setTab(tab); loading();
  try {
    const j = await api(ep);
    const list = allItems(j);
    if (!list.length) return app.innerHTML = '<div class="state">Tidak ada data ditemukan.</div>';
    app.innerHTML = `<h2>${esc(title)}</h2>${cardsHtml(list)}`;
    bindCards(app.querySelector('.grid'), list);
  } catch (e) { fail(e.message, () => viewList(ep, title, tab)); }
}
async function viewSchedule() {
  setTab('schedule'); loading();
  try {
    const j = await api('donghub-schedule');
    const data = j.data || {};
    const todayName = DAYS[new Date().getDay()];
    let active = DAYS.find((d) => data[d]) || Object.keys(data)[0];
    if (data[todayName]) active = todayName;
    const render = (day) => {
      const list = (data[day] || []).map(toItem);
      app.querySelector('#schedList').innerHTML = list.length ? cardsHtml(list) : '<div class="state">Tidak ada jadwal di hari ini.</div>';
      bindCards(app.querySelector('#schedList'), list);
    };
    app.innerHTML = `<h2>Jadwal Rilis</h2>
      <div class="day-tabs">${DAYS.filter((d) => data[d]).map((d) => `<button data-d="${esc(d)}" class="${d === active ? 'on' : ''}">${esc(d)}</button>`).join('')}</div>
      <div id="schedList"></div>`;
    app.querySelectorAll('.day-tabs button').forEach((b) => b.onclick = () => {
      app.querySelectorAll('.day-tabs button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); render(b.dataset.d);
    });
    render(active);
  } catch (e) { fail(e.message, viewSchedule); }
}
async function viewSearch(q) {
  setTab(''); loading();
  const blocks = [];
  let mainList = [], anibiList = [], mainErr = null, anibiErr = null;
  try {
    const j = await api('donghub-search', { target: q });
    mainList = allItems(j);
  } catch (e) { mainErr = e.message; }
  try {
    const j2 = await api('anibi-search', { target: q });
    anibiList = allItems(j2);
  } catch (e) { anibiErr = e.message; }

  if (mainList.length) blocks.push(`<h2>Hasil Pencarian <span class="tag">Donghua</span></h2>${cardsHtml(mainList)}`);
  else if (mainErr) blocks.push(`<div class="state" style="padding:20px 10px">Pencarian donghua: ${esc(mainErr)}</div>`);

  if (anibiList.length) blocks.push(`<h2>Hasil Tambahan <span class="tag">Anibiplay</span></h2>${cardsHtml(anibiList)}`);

  if (!mainList.length && !anibiList.length) {
    app.innerHTML = `<div class="state">Tidak ada hasil untuk “${esc(q)}”.</div>`;
    return;
  }
  app.innerHTML = `<h2 style="margin-top:6px">Pencarian: ${esc(q)}</h2>` + blocks.join('');
  const grids = app.querySelectorAll('.grid');
  let gi = 0;
  if (mainList.length) bindCards(grids[gi++], mainList);
  if (anibiList.length) bindCards(grids[gi++], anibiList);
}
async function viewDetail(url) {
  setTab(''); loading();
  let base = null; try { base = JSON.parse(sessionStorage.getItem('d_' + url)); } catch {}
  try {
    const j = await api('donghub-detail', { target: url });
    const found = allItems(j)[0];
    const d = {
      title: pick(j, ['title', 'name', 'bookName']) || (found && found.title) || (base && base.title) || 'Donghua',
      cover: pick(j, ['thumbnail', 'cover', 'poster', 'image']) || (found && found.cover) || (base && base.cover) || '',
      desc: pick(j, ['synopsis', 'sinopsis', 'description', 'introduction']) || 'Tidak ada sinopsis.',
      status: pick(j, ['status']) || (base && base.status) || '',
      type: pick(j, ['type']) || '',
      genres: [].concat(pick(j, ['genres', 'genre', 'tags']) || []).map((g) => (typeof g === 'object' ? pick(g, ['name', 'title']) : g)).filter(Boolean),
    };
    let eps = findEpisodeArray(j);
    if (!eps.length && base) eps = [{ title: base.title, url: base.url, episode: base.episode }];
    app.innerHTML = `
      <div class="detail">
        <div class="poster" style="${d.cover ? `background-image:url('${esc(img(d.cover))}')` : ''}"></div>
        <div>
          <h1>${esc(d.title)}</h1>
          <div class="tags">${d.status ? `<span>${esc(d.status)}</span>` : ''}${d.type ? `<span>${esc(d.type)}</span>` : ''}${d.genres.map((g) => `<span>${esc(g)}</span>`).join('')}</div>
          <p>${esc(d.desc)}</p>
          ${eps.length ? `<button class="btn" id="playFirst">▶ Tonton Sekarang</button>` : ''}
          <button class="btn ghost" onclick="history.back()">Kembali</button>
        </div>
      </div>
      <h2>Daftar Episode</h2>
      ${eps.length ? `<div class="eps">${eps.map((e, i) => `<button data-i="${i}">${esc(e.title)}${e.episode ? ` <span>${esc(e.episode)}</span>` : ''}</button>`).join('')}</div>` : '<div class="state">Daftar episode tidak tersedia dari API.</div>'}`;
    app.querySelectorAll('.eps button').forEach((b) => b.onclick = () => {
      const e = eps[Number(b.dataset.i)];
      location.hash = '#/watch/' + encodeURIComponent(e.url) + '/' + encodeURIComponent(e.title || d.title);
    });
    const pf = $('#playFirst'); if (pf) pf.onclick = () => {
      location.hash = '#/watch/' + encodeURIComponent(eps[0].url) + '/' + encodeURIComponent(eps[0].title || d.title);
    };
  } catch (e) { fail(e.message, () => viewDetail(url)); }
}

/* ---------- player ---------- */
const modal = $('#player'), stage = $('#stage'), pMsg = $('#pMsg'), serversEl = $('#servers');
let hls = null;
function stopStage() { if (hls) { hls.destroy(); hls = null; } stage.innerHTML = ''; }
function closePlayer() { stopStage(); modal.hidden = true; document.body.style.overflow = ''; }
function renderServer(s) {
  stopStage();
  if (s.video) {
    const v = document.createElement('video');
    v.controls = true; v.autoplay = true; v.playsInline = true;
    if (/\.m3u8(\?|$)/i.test(s.url) && window.Hls && Hls.isSupported()) {
      hls = new Hls(); hls.loadSource(s.url); hls.attachMedia(v);
    } else v.src = s.url;
    stage.appendChild(v);
  } else {
    const f = document.createElement('iframe');
    f.src = s.url; f.allow = 'autoplay; fullscreen; encrypted-media'; f.allowFullscreen = true; f.referrerPolicy = 'no-referrer';
    stage.appendChild(f);
  }
}
async function openWatch(url, title) {
  modal.hidden = false; document.body.style.overflow = 'hidden';
  $('#pTitle').textContent = decodeURIComponent(title || '');
  pMsg.textContent = 'Memuat player…'; serversEl.innerHTML = ''; stopStage();
  try {
    const j = await api('donghub-watch', { target: url });
    const servers = mediaServers(j);
    if (!servers.length) throw new Error('Tautan video tidak ditemukan pada respons API.');
    serversEl.innerHTML = servers.map((s, i) => `<button data-i="${i}" class="${i === 0 ? 'on' : ''}">${esc(s.label)}</button>`).join('');
    serversEl.querySelectorAll('button').forEach((b) => b.onclick = () => {
      serversEl.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); renderServer(servers[Number(b.dataset.i)]);
    });
    pMsg.textContent = '';
    renderServer(servers[0]);
  } catch (e) { pMsg.textContent = e.message; }
}
$('#closePlayer').onclick = closePlayer;
modal.addEventListener('click', (e) => { if (e.target === modal) closePlayer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closePlayer(); });

/* ---------- router ---------- */
function route() {
  if (!modal.hidden) closePlayer();
  const h = location.hash.slice(1) || '/';
  let m;
  if (h === '/') viewHome();
  else if (h === '/new') viewList('donghub-new', 'Rilis Baru', 'new');
  else if (h === '/completed') viewList('donghub-completed', 'Donghua Tamat', 'completed');
  else if (h === '/schedule') viewSchedule();
  else if ((m = h.match(/^\/search\/(.+)$/))) viewSearch(decodeURIComponent(m[1]));
  else if ((m = h.match(/^\/detail\/(.+)$/))) viewDetail(decodeURIComponent(m[1]));
  else if ((m = h.match(/^\/watch\/([^/]+)\/(.+)$/))) { viewHomeIfNeeded(); openWatch(decodeURIComponent(m[1]), m[2]); }
  else viewHome();
  window.scrollTo(0, 0);
}
function viewHomeIfNeeded() { if (!app.dataset.filled) viewHome(); app.dataset.filled = '1'; }
$('#searchForm').addEventListener('submit', (e) => {
  e.preventDefault(); const q = $('#q').value.trim();
  if (q) location.hash = '#/search/' + encodeURIComponent(q);
});
window.addEventListener('hashchange', route);
route();
