// Netlify Function: bot Telegram + daftar notifikasi untuk website.
// Setelah deploy tersedia di /api/notif  (=> /.netlify/functions/notif)
//
// CARA KERJA
//   * Dev mengirim pesan teks ke bot  -> pesan tampil di lonceng notifikasi website.
//   * Bot MEMBALAS pesan (/start, /help, /id, /status, dan konfirmasi saat notif terkirim).
//   * Telegram memanggil fungsi ini lewat WEBHOOK (POST). Webhook dipasang OTOMATIS
//     saat website dibuka (GET), jadi tidak perlu setup manual.
//   * Notifikasi disimpan di Netlify Blobs (paket @netlify/blobs, lihat package.json).
//   * Jika Netlify Blobs tidak tersedia, fungsi otomatis memakai mode lama
//     (membaca getUpdates). Notifikasi tetap tampil, tetapi bot tidak bisa membalas.
//
// ENVIRONMENT VARIABLE (opsional, Netlify > Site configuration > Environment variables)
//   BOT_TOKEN    = token bot dari @BotFather (disarankan; jika kosong memakai token bawaan file ini)
//   DEV_CHAT_ID  = chat id dev, pisahkan dengan koma. Jika diisi, hanya pesan dari chat id
//                  itu yang tampil di notifikasi. Kirim /id ke bot untuk mengetahui chat id.
//   SITE_URL     = alamat website utama, mis. https://namasitus.netlify.app
//                  (opsional; dipakai untuk memasang webhook jika URL tidak terdeteksi)
//
// Pesan yang diawali "/" dianggap perintah dan tidak masuk notifikasi.
// Setiap notifikasi dibatasi MAX_CHARS karakter.

"use strict";

const crypto = require("crypto");

let blobsLib = null;
try {
  blobsLib = require("@netlify/blobs");
} catch (e) {
  blobsLib = null;
}

const BOT_TOKEN = String(
  process.env.BOT_TOKEN ||
    process.env.TELEGRAM_BOT_TOKEN ||
    "8807908431:AAFWx5pQFTLcZz0h3DDQJmWgwCOOhpB03xc"
).trim();

const MAX_CHARS = 100;
const MAX_ITEMS = 50;
const MAX_SEEN = 200;
const REPLY_WINDOW_S = 600; // hanya balas pesan yang baru (<10 menit); pesan lama cuma disimpan
const MODE_TTL_MS = 5 * 60 * 1000;
const ENSURE_TTL_MS = 60 * 1000;
const SETUP_VERSION = 2; // naikkan angka ini jika teks bot / perintah diubah
const STORE_NAME = "dyy-notif";
const TG = "https://api.telegram.org/bot" + BOT_TOKEN + "/";
// Secret webhook diturunkan dari token, jadi tidak perlu disimpan / diatur manual.
const WEBHOOK_SECRET = crypto
  .createHash("sha256")
  .update("dyy-notif:" + BOT_TOKEN)
  .digest("hex")
  .slice(0, 48);

// ---------------------------------------------------------------- util umum

function json(statusCode, payload, extra) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
      extra || {}
    ),
    body: JSON.stringify(payload),
  };
}

function listHeaders() {
  return { "Netlify-CDN-Cache-Control": "public, max-age=5, stale-while-revalidate=15" };
}

function log() {
  try {
    console.error.apply(console, ["[notif]"].concat([].slice.call(arguments)));
  } catch (e) {}
}

function header(event, name) {
  var h = (event && event.headers) || {};
  var want = name.toLowerCase();
  for (var k in h) {
    if (Object.prototype.hasOwnProperty.call(h, k) && k.toLowerCase() === want) return String(h[k]);
  }
  return "";
}

function allowedChats() {
  return String(process.env.DEV_CHAT_ID || "7861218464")
    .split(",")
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function isAuthorized(m) {
  var allow = allowedChats();
  if (!allow.length) return true;
  var chat = m.chat || {};
  var ids = [];
  if (chat.id !== undefined) ids.push(String(chat.id));
  if (m.from && m.from.id !== undefined) ids.push(String(m.from.id));
  if (chat.username) ids.push("@" + chat.username);
  return ids.some(function (id) { return allow.indexOf(id) !== -1; });
}

function messageOf(update) {
  return (update && (update.message || update.channel_post)) || null;
}

function rawText(m) {
  var t = typeof m.text === "string" ? m.text : typeof m.caption === "string" ? m.caption : "";
  return t.replace(/\r\n/g, "\n").trim();
}

function hasMedia(m) {
  return !!(m.photo || m.video || m.document || m.audio || m.voice || m.sticker || m.animation);
}

function clip(text) {
  var chars = Array.from(text);
  if (chars.length > MAX_CHARS) return { text: chars.slice(0, MAX_CHARS).join("").trimEnd() + "...", cut: true };
  return { text: text, cut: false };
}

// Mengubah satu pesan Telegram menjadi item notifikasi (atau null jika harus diabaikan).
function toItem(update) {
  var m = messageOf(update);
  if (!m) return null;
  var chat = m.chat || {};
  if (chat.type === "group" || chat.type === "supergroup") return null;
  var text = rawText(m);
  if (!text && hasMedia(m)) text = "(Pesan berisi lampiran yang tidak bisa ditampilkan di sini)";
  if (!text) return null;
  if (text.charAt(0) === "/") return null;
  if (!isAuthorized(m)) return null;
  return { id: update.update_id, text: clip(text).text, date: (m.date || 0) * 1000 };
}

function sortItems(items) {
  return items
    .slice()
    .sort(function (a, b) { return b.id - a.id; })
    .slice(0, MAX_ITEMS);
}

// ----------------------------------------------------------------- Telegram

async function tg(method, payload, ms) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, ms || 8000);
  try {
    var res = await fetch(TG + method, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    return await res.json().catch(function () { return null; });
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function say(chatId, text, replyTo, site) {
  var payload = { chat_id: chatId, text: text, disable_web_page_preview: true };
  if (replyTo) payload.reply_parameters = { message_id: replyTo, allow_sending_without_reply: true };
  if (site) payload.reply_markup = { inline_keyboard: [[{ text: "Buka website", url: site }]] };
  var r = await tg("sendMessage", payload);
  // Jika tombol / reply ditolak Telegram, coba lagi dalam bentuk paling sederhana.
  if (!r || r.ok !== true) {
    r = await tg("sendMessage", { chat_id: chatId, text: text, disable_web_page_preview: true });
  }
  return r;
}

// ------------------------------------------------------------------ storage

var mem = { state: null, setup: null };
var testStore = null;

function getStoreObj(event) {
  if (testStore) return testStore;
  if (!blobsLib) return null;
  try {
    if (event && typeof blobsLib.connectLambda === "function" && event.blobs) blobsLib.connectLambda(event);
    return blobsLib.getStore({ name: STORE_NAME, consistency: "strong" });
  } catch (e) {
    log("blobs tidak siap:", e && e.message);
    return null;
  }
}

async function readKey(event, key) {
  var store = getStoreObj(event);
  if (store) {
    try {
      var v = await store.get(key, { type: "json", consistency: "strong" });
      if (v !== undefined) {
        mem[key] = v;
        return v;
      }
    } catch (e) {
      log("gagal baca blobs:", e && e.message);
    }
  }
  return mem[key] || null;
}

async function writeKey(event, key, value) {
  mem[key] = value;
  var store = getStoreObj(event);
  if (!store) return false;
  try {
    await store.setJSON(key, value);
    return true;
  } catch (e) {
    log("gagal tulis blobs:", e && e.message);
    return false;
  }
}

async function readState(event) {
  var s = await readKey(event, "state");
  if (!s || typeof s !== "object") s = {};
  return {
    items: Array.isArray(s.items) ? s.items : [],
    seen: Array.isArray(s.seen) ? s.seen : [],
  };
}

// ------------------------------------------------------------- mode & setup

var modeCache = { at: 0, webhook: false };
var ensureAt = 0;

// Webhook hanya dipakai jika penyimpanan Netlify Blobs benar-benar berfungsi.
async function webhookMode(event) {
  var now = Date.now();
  if (now - modeCache.at < MODE_TTL_MS) return modeCache.webhook;
  var ok = false;
  var store = getStoreObj(event);
  if (store) {
    try {
      await store.setJSON("probe", { t: now });
      var back = await store.get("probe", { type: "json", consistency: "strong" });
      ok = !!(back && back.t === now);
    } catch (e) {
      log("probe blobs gagal:", e && e.message);
    }
  }
  modeCache = { at: now, webhook: ok };
  return ok;
}

function siteUrl(event) {
  var u = String(process.env.SITE_URL || process.env.URL || "").trim();
  if (!u) {
    var host = (header(event, "x-forwarded-host") || header(event, "host")).split(",")[0].trim();
    // Abaikan alamat deploy preview (hash--situs.netlify.app) dan alamat lokal.
    if (host && host.indexOf("--") === -1) u = "https://" + host;
  }
  u = u.replace(/\/+$/, "");
  if (!/^https:\/\//i.test(u)) return "";
  if (/^https:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u)) return "";
  return u;
}

async function ensureWebhook(event) {
  var now = Date.now();
  if (now - ensureAt < ENSURE_TTL_MS) return;
  ensureAt = now;
  try {
    var site = siteUrl(event);
    if (!site) return;
    var want = site + "/api/notif";
    var info = await tg("getWebhookInfo");
    if (!info || info.ok !== true) return;
    var current = (info.result && info.result.url) || "";
    var setup = await readKey(event, "setup");
    var upToDate = setup && setup.ver === SETUP_VERSION && setup.url && current === setup.url;
    if (upToDate) return;

    // Jika webhook yang aktif adalah milik kita (hanya versi setup yang naik), pertahankan alamatnya
    // agar tidak bolak-balik antara domain netlify.app dan domain kustom.
    var target = current && setup && setup.url === current ? current : want;
    var res = await tg("setWebhook", {
      url: target,
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "channel_post"],
      max_connections: 10,
      drop_pending_updates: false,
    });
    if (!res || res.ok !== true) {
      log("setWebhook gagal:", res && res.description);
      ensureAt = 0; // coba lagi pada permintaan berikutnya
      return;
    }
    await setupProfile();
    await writeKey(event, "setup", { ver: SETUP_VERSION, url: target, at: now });
  } catch (e) {
    log("ensureWebhook error:", e && e.message);
    ensureAt = 0;
  }
}

// Mengatur deskripsi & daftar perintah bot (menggantikan teks lama "GACOR · OVERLAY").
async function setupProfile() {
  await tg("setMyCommands", {
    commands: [
      { command: "start", description: "Mulai & lihat cara pakai bot" },
      { command: "help", description: "Bantuan penggunaan" },
      { command: "id", description: "Lihat chat ID kamu" },
      { command: "status", description: "Cek status bot & notifikasi" },
    ],
  });
  await tg("setMyDescription", {
    description:
      "Bot notifikasi DYY MOVIE. Kirim pesan teks ke bot ini dan pesan akan tampil sebagai notifikasi (ikon lonceng) di website. Maksimal 100 karakter per pesan. Tekan START untuk melihat cara pakai.",
  });
  await tg("setMyShortDescription", {
    short_description: "Kirim pesan ke bot ini untuk tampil sebagai notifikasi di website DYY MOVIE.",
  });
}

// ------------------------------------------------------------------ webhook

function commandOf(text) {
  var first = text.split(/\s+/)[0] || "";
  return first.replace(/@.*$/, "").toLowerCase();
}

function welcomeText(m, authorized) {
  var name = (m.from && m.from.first_name) || "";
  var lines = ["Halo" + (name ? ", " + name : "") + "! 👋", "Ini bot notifikasi DYY MOVIE.", ""];
  if (authorized) {
    lines.push(
      "Cara pakai:",
      "• Kirim pesan teks ke bot ini, pesan langsung tampil di ikon lonceng 🔔 pada website.",
      "• Maksimal " + MAX_CHARS + " karakter per notifikasi (emoji dan link boleh).",
      "• Pesan yang diawali / dianggap perintah dan tidak ditampilkan.",
      "",
      "Perintah: /help  /id  /status"
    );
  } else {
    lines.push("Bot ini hanya menerima notifikasi dari dev website.", "", "Perintah: /help  /id  /status");
  }
  return lines.join("\n");
}

function helpText(authorized) {
  return [
    "Bantuan bot notifikasi DYY MOVIE",
    "",
    authorized
      ? "Kirim pesan teks biasa ke bot ini untuk membuat notifikasi di website (maks " + MAX_CHARS + " karakter)."
      : "Hanya dev website yang bisa membuat notifikasi lewat bot ini.",
    "",
    "/start  - mulai",
    "/help   - bantuan ini",
    "/id     - lihat chat ID kamu (untuk DEV_CHAT_ID)",
    "/status - cek status bot",
  ].join("\n");
}

async function handleCommand(event, m, cmd, state, site) {
  var chatId = m.chat.id;
  var authorized = isAuthorized(m);
  if (cmd === "/start") return say(chatId, welcomeText(m, authorized), m.message_id, site);
  if (cmd === "/help") return say(chatId, helpText(authorized), m.message_id, site);
  if (cmd === "/id") {
    var uid = m.from && m.from.id !== undefined ? m.from.id : "-";
    return say(chatId, "Chat ID: " + chatId + "\nUser ID: " + uid, m.message_id);
  }
  if (cmd === "/status") {
    return say(
      chatId,
      "✅ Bot aktif.\nNotifikasi tersimpan di website: " + state.items.length + " (maks " + MAX_ITEMS + ").",
      m.message_id,
      site
    );
  }
  return say(chatId, "Perintah tidak dikenal. Ketik /help untuk bantuan.", m.message_id);
}

async function processUpdate(event, update) {
  var m = messageOf(update);
  if (!m || typeof update.update_id !== "number") return;
  var chat = m.chat || {};
  if (chat.id === undefined) return;
  if (chat.type === "group" || chat.type === "supergroup") return;

  var state = await readState(event);
  if (state.seen.indexOf(update.update_id) !== -1) return; // kiriman ulang dari Telegram

  var isPrivate = chat.type === "private";
  var fresh = Date.now() / 1000 - (m.date || 0) < REPLY_WINDOW_S;
  var canReply = isPrivate && fresh;
  var site = siteUrl(event) || "";
  var text = rawText(m);

  if (text.charAt(0) === "/") {
    if (canReply) await handleCommand(event, m, commandOf(text), state, site);
  } else if (!isAuthorized(m)) {
    if (canReply) await say(chat.id, "Maaf, bot ini hanya menerima notifikasi dari dev website. Ketik /id untuk melihat chat ID kamu.", m.message_id);
  } else {
    var item = toItem(update);
    if (item) {
      state.items = sortItems(state.items.filter(function (it) { return it.id !== item.id; }).concat([item]));
      if (canReply) {
        var cut = Array.from(rawText(m)).length > MAX_CHARS;
        await say(
          chat.id,
          cut
            ? "✅ Notifikasi terkirim ke website.\n⚠️ Teks dipotong karena lebih dari " + MAX_CHARS + " karakter."
            : "✅ Notifikasi terkirim ke website.",
          m.message_id,
          site
        );
      }
    } else if (canReply) {
      await say(chat.id, "Kirim pesan teks untuk membuat notifikasi. Ketik /help untuk bantuan.", m.message_id);
    }
  }

  state.seen = state.seen.concat([update.update_id]).slice(-MAX_SEEN);
  await writeKey(event, "state", { items: state.items, seen: state.seen });
}

async function handleWebhook(event) {
  if (header(event, "x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return json(401, { ok: false, message: "Tidak diizinkan." });
  }
  var raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  var update;
  try {
    update = JSON.parse(raw);
  } catch (e) {
    return json(400, { ok: false, message: "Body tidak valid." });
  }
  try {
    await processUpdate(event, update);
  } catch (e) {
    // Selalu balas 200 agar Telegram tidak mengirim ulang update yang bermasalah terus-menerus.
    log("processUpdate error:", e && e.message);
  }
  return json(200, { ok: true });
}

// --------------------------------------------------------------- daftar (GET)

async function handleListWebhook(event) {
  await ensureWebhook(event);
  var state = await readState(event);
  return json(200, { ok: true, items: sortItems(state.items), updated: Date.now() }, listHeaders());
}

// Mode lama (tanpa Netlify Blobs): membaca pesan lewat getUpdates.
var legacyCache = { at: 0, body: null };

async function handleListLegacy() {
  var now = Date.now();
  if (legacyCache.body && now - legacyCache.at < 15000) return json(200, legacyCache.body, listHeaders());
  try {
    var q = { limit: 100, timeout: 0, allowed_updates: ["message", "channel_post"] };
    var data = await tg("getUpdates", q, 9000);
    // 409 = webhook aktif. JANGAN dihapus: webhook adalah satu-satunya jalur agar bot bisa membalas.
    if (data && data.ok === false && data.error_code === 409) {
      if (legacyCache.body) return json(200, legacyCache.body, listHeaders());
      return json(200, { ok: false, message: "Penyimpanan notifikasi (Netlify Blobs) belum aktif. Deploy lewat Git/CLI agar paket @netlify/blobs terpasang.", items: [] });
    }
    if (!data || data.ok !== true) {
      var code = data && data.error_code;
      var msg = "Notifikasi belum dapat dimuat.";
      if (code === 409) msg = "Bot sedang dipakai program lain. Matikan program/webhook bot lain yang memakai token ini.";
      else if (code === 401 || code === 404) msg = "Token bot tidak valid.";
      if (legacyCache.body) return json(200, legacyCache.body, listHeaders());
      return json(200, { ok: false, message: msg, items: [] });
    }
    var items = sortItems((data.result || []).map(toItem).filter(Boolean));
    var body = { ok: true, items: items, updated: now };
    legacyCache = { at: now, body: body };
    return json(200, body, listHeaders());
  } catch (e) {
    if (legacyCache.body) return json(200, legacyCache.body, listHeaders());
    return json(200, { ok: false, message: "Tidak dapat terhubung ke server notifikasi.", items: [] });
  }
}

// ------------------------------------------------------------ setup & status
// /api/notif?action=setup  -> pasang webhook sekarang juga (buka sekali di browser setelah deploy)
// /api/notif?action=status -> cek token, webhook, dan penyimpanan
async function handleAdmin(event, action) {
  var out = { ok: true };
  var me = await tg("getMe");
  out.bot = me && me.ok ? "@" + me.result.username : "TOKEN TIDAK VALID / tidak bisa dihubungi Telegram";
  out.blobs_lib = !!blobsLib;
  modeCache = { at: 0, webhook: false };
  out.blobs_bekerja = await webhookMode(event);
  var site = siteUrl(event);
  out.site = site || "(tidak terdeteksi, isi env SITE_URL)";
  if (action === "setup") {
    if (!site) return json(200, Object.assign(out, { ok: false, message: "URL situs tidak terdeteksi. Isi env SITE_URL lalu buka lagi." }), { "Cache-Control": "no-store" });
    var res = await tg("setWebhook", {
      url: site + "/api/notif",
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ["message", "channel_post"],
      max_connections: 10,
      drop_pending_updates: false,
    });
    out.setWebhook = res && res.ok ? "berhasil" : (res && res.description) || "gagal";
    if (res && res.ok) {
      await setupProfile();
      await writeKey(event, "setup", { ver: SETUP_VERSION, url: site + "/api/notif", at: Date.now() });
    }
  }
  var info = await tg("getWebhookInfo");
  if (info && info.result) {
    out.webhook_url = info.result.url || "(kosong)";
    out.pending_update = info.result.pending_update_count;
    out.error_terakhir = info.result.last_error_message || "-";
  }
  return json(200, out, { "Cache-Control": "no-store" });
}

// ------------------------------------------------------------------ handler

exports.handler = async function (event) {
  event = event || {};
  var method = String(event.httpMethod || "GET").toUpperCase();
  try {
    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: "",
      };
    }
    if (method === "POST") return await handleWebhook(event);
    if (method === "GET" || method === "HEAD") {
      var action = String((event.queryStringParameters || {}).action || "");
      if (action === "setup" || action === "status") return await handleAdmin(event, action);
      var useWebhook = await webhookMode(event);
      return useWebhook ? await handleListWebhook(event) : await handleListLegacy();
    }
    return json(405, { ok: false, message: "Method tidak diizinkan." });
  } catch (e) {
    log("handler error:", e && e.message);
    if (method === "POST") return json(200, { ok: true });
    return json(200, { ok: false, message: "Notifikasi belum dapat dimuat.", items: [] });
  }
};

// Dipakai deploy-succeeded.js: pasang webhook otomatis setiap selesai deploy.
exports.installWebhook = async function (site) {
  site = String(site || "").replace(/\/+$/, "");
  if (!/^https:\/\//i.test(site)) return { ok: false, message: "URL situs tidak valid" };
  var res = await tg("setWebhook", {
    url: site + "/api/notif",
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "channel_post"],
    max_connections: 10,
    drop_pending_updates: false,
  });
  if (res && res.ok) await setupProfile();
  return res || { ok: false };
};

// Hanya untuk pengujian.
exports._test = {
  setStore: function (s) { testStore = s; },
  reset: function () {
    mem = { state: null, setup: null };
    modeCache = { at: 0, webhook: false };
    ensureAt = 0;
    legacyCache = { at: 0, body: null };
  },
  secret: WEBHOOK_SECRET,
};
