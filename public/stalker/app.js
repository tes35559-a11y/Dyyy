/* DyyStalker — Instagram profile lookup front-end.
   Calls /.netlify/functions/stalk (which holds the API key server-side and
   forwards to api.kyzzz.xyz) and falls back to a direct call with the key
   inlined, so the page still works when opened locally without Netlify
   Functions running. */
(function () {
  "use strict";

  var DIRECT_BASE = "https://api.kyzzz.xyz/api/stalker/ig";
  var API_KEY = "kyzz508379258"; // same key requested — auto-filled on every lookup
  var PROXY_URL = "/.netlify/functions/stalker-stalk";
  var AVATAR_PROXY_URL = "/.netlify/functions/stalker-avatar";
  var TIMEOUT_MS = 15000;

  var form = document.getElementById("searchForm");
  var input = document.getElementById("usernameInput");
  var submitBtn = document.getElementById("submitBtn");
  var resultZone = document.getElementById("resultZone");

  // ---------------------------------------------------------------- utils

  function escapeHTML(str) {
    var d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function fetchWithTimeout(url, ms) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, ms || TIMEOUT_MS);
    return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .finally(function () { clearTimeout(timer); });
  }

  function cleanUsername(raw) {
    return (raw || "").trim().replace(/^@+/, "").replace(/\s+/g, "");
  }

  // Turns @mentions and bare links in a bio into clickable Instagram / web links.
  function linkifyBio(text) {
    var escaped = escapeHTML(text);
    escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, function (m) {
      return '<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + m + "</a>";
    });
    escaped = escaped.replace(/(^|[\s(])@([a-zA-Z0-9._]{1,30})/g, function (_m, pre, handle) {
      return pre + '<a href="https://instagram.com/' + handle + '" target="_blank" rel="noopener noreferrer">@' + handle + "</a>";
    });
    return escaped;
  }

  function fmtCount(n) {
    if (n === undefined || n === null || n === "") return "—";
    return String(n);
  }

  // ------------------------------------------------------------- fetching

  function lookup(username) {
    var proxyUrl = PROXY_URL + "?username=" + encodeURIComponent(username);
    var directUrl = DIRECT_BASE + "?username=" + encodeURIComponent(username) + "&apikey=" + encodeURIComponent(API_KEY);

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

  // --------------------------------------------------------------- render

  function renderSkeleton() {
    resultZone.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-top">' +
          '<div class="skel-avatar skeleton"></div>' +
          '<div style="flex:1;width:100%;">' +
            '<div class="skel-line skeleton" style="width:55%;margin-bottom:10px;"></div>' +
            '<div class="skel-line skeleton" style="width:35%;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat-cell"><div class="skel-line skeleton" style="width:40%;margin:0 auto;"></div></div>' +
          '<div class="stat-cell"><div class="skel-line skeleton" style="width:40%;margin:0 auto;"></div></div>' +
          '<div class="stat-cell"><div class="skel-line skeleton" style="width:40%;margin:0 auto;"></div></div>' +
        '</div>' +
        '<div style="padding:22px 28px 28px;">' +
          '<div class="skel-line skeleton" style="width:90%;margin-bottom:8px;"></div>' +
          '<div class="skel-line skeleton" style="width:70%;"></div>' +
        '</div>' +
      '</div>';
  }

  function renderState(kind, title, sub) {
    resultZone.innerHTML =
      '<div class="state-panel' + (kind === "error" ? " is-error" : "") + '">' +
        '<div class="state-icon">' +
          (kind === "error"
            ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            : '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>') +
        '</div>' +
        '<div class="state-title">' + escapeHTML(title) + '</div>' +
        '<div class="state-sub">' + escapeHTML(sub) + '</div>' +
      '</div>';
  }

  // Avatar loader: embed the original image first, then use the server proxy/CDN fallbacks.
  window.__avatarFallback = function (img) {
    var stage = img.getAttribute("data-stage") || "direct";
    var direct = img.getAttribute("data-direct") || "";
    if (!direct) return replaceAvatarWithFallback(img);

    if (stage === "direct") {
      img.setAttribute("data-stage", "proxy");
      img.src = AVATAR_PROXY_URL + "?url=" + encodeURIComponent(direct);
      return;
    }
    if (stage === "proxy") {
      img.setAttribute("data-stage", "wsrv");
      img.src = "https://wsrv.nl/?url=" + encodeURIComponent(direct);
      return;
    }
    if (stage === "wsrv") {
      img.setAttribute("data-stage", "weserv");
      img.src = "https://images.weserv.nl/?url=" + encodeURIComponent(direct);
      return;
    }
    replaceAvatarWithFallback(img);
  };

  function replaceAvatarWithFallback(img) {
    var span = document.createElement("span");
    span.className = "avatar-fallback";
    span.textContent = img.getAttribute("data-initial") || "?";
    img.replaceWith(span);
  }

  function normalizeImageUrl(value) {
    if (typeof value !== "string") return "";
    var v = value.trim();
    if (!/^https?:\/\//i.test(v)) return "";
    return v;
  }

  function findAvatarUrl(root) {
    var preferred = [
      "profile_pic_url_hd", "profile_pic_url", "profile_picture", "profilePicture",
      "profile_photo", "profilePhoto", "profile_image", "profileImage", "avatar_url",
      "avatarUrl", "avatar", "picture", "image", "photo", "thumbnail"
    ];
    var seen = [];
    function walk(obj, depth, score) {
      if (!obj || depth > 7 || typeof obj !== "object") return "";
      if (seen.indexOf(obj) !== -1) return "";
      seen.push(obj);

      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = obj[key];
        var lower = key.toLowerCase();
        var keyScore = score + (preferred.indexOf(key) >= 0 ? 100 : 0);
        if (/profile.*(pic|photo|image|avatar)|avatar.*(url|image)|^(picture|photo|image)$/i.test(key)) keyScore += 80;
        if (typeof value === "string") {
          var url = normalizeImageUrl(value);
          if (url && keyScore >= 0 && /(profile|avatar|picture|photo|image|thumbnail)/i.test(lower)) {
            return url;
          }
        } else if (value && typeof value === "object") {
          var nested = walk(value, depth + 1, keyScore);
          if (nested) return nested;
        }
      }

      // Some APIs return the image URL under an object without a descriptive key.
      for (var j = 0; j < keys.length; j++) {
        var v = obj[keys[j]];
        if (typeof v === "string") {
          var u = normalizeImageUrl(v);
          if (u && /(?:jpg|jpeg|png|webp|gif|avif)(?:[?#]|$)/i.test(u)) return u;
        }
      }
      return "";
    }
    return walk(root, 0, 0);
  }

  var verifiedIcon = '<span class="badge-verified" title="Terverifikasi"><svg viewBox="0 0 24 24"><path d="M12 2l2.4 1.9 3-.6 1 2.9 2.9 1-.6 3L22 12l-1.9 2.4.6 3-2.9 1-1 2.9-3-.6L12 22l-2.4-1.9-3 .6-1-2.9-2.9-1 .6-3L2 12l1.9-2.4-.6-3 2.9-1 1-2.9 3 .6L12 2z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.6" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  var privateBadge = '<span class="badge-private"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>Akun privat</span>';

  function findAvatarUrl(root) {
    var preferred = ["avatar", "avatar_url", "profile_pic_url_hd", "profile_pic_url", "profile_picture", "profile_photo", "profile_image", "picture", "image"];
    var seen = [];
    function walk(obj, depth) {
      if (!obj || depth > 4 || typeof obj !== "object") return "";
      if (seen.indexOf(obj) !== -1) return "";
      seen.push(obj);
      for (var i = 0; i < preferred.length; i++) {
        var v = obj[preferred[i]];
        if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
        if (v && typeof v === "object") { var nested = walk(v, depth + 1); if (nested) return nested; }
      }
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) {
        var value = obj[keys[j]];
        if (typeof value === "string" && /^https?:\/\//i.test(value) && /(avatar|profile|picture|photo|image)/i.test(keys[j])) return value;
        if (value && typeof value === "object") { var found = walk(value, depth + 1); if (found) return found; }
      }
      return "";
    }
    return walk(root, 0);
  }

  function renderProfile(data) {
    var meta = data.metadata || {};
    var storiesUser = (data.stories && data.stories.data && data.stories.data.user) || {};

    var fullName = storiesUser.full_name || meta.fullName || meta.username || "";
    var username = meta.username || storiesUser.username || "";
    var avatar = findAvatarUrl(meta) || findAvatarUrl(storiesUser) || findAvatarUrl(data) || "";
    var bio = meta.biography || meta.bio || storiesUser.biography || "";
    var posts = meta.posts !== undefined ? meta.posts : storiesUser.edges_count;
    var followers = meta.followers !== undefined ? meta.followers : storiesUser.edge_followed_by;
    var following = meta.following !== undefined ? meta.following : storiesUser.edge_follow;
    var isVerified = !!storiesUser.is_verified;
    var isPrivate = !!storiesUser.is_private;

    var initial = (fullName || username || "?").trim().charAt(0).toUpperCase();
    var avatarSrc = avatar ? AVATAR_PROXY_URL + "?url=" + encodeURIComponent(avatar) : "";

    resultZone.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-top">' +
          '<div class="avatar-wrap">' +
            (avatar
              ? '<img src="' + escapeHTML(avatar) + '" data-direct="' + escapeHTML(avatar) + '" data-stage="direct" referrerpolicy="no-referrer" alt="Avatar ' + escapeHTML(username) + '" data-initial="' + escapeHTML(initial) + '" onerror="window.__avatarFallback(this)">'
              : '<span class="avatar-fallback">' + escapeHTML(initial) + "</span>") +
          "</div>" +
          '<div class="profile-id">' +
            '<div class="profile-name-row">' +
              '<span class="profile-fullname">' + escapeHTML(fullName || username || "Tanpa nama") + "</span>" +
              (isVerified ? verifiedIcon : "") +
            "</div>" +
            '<div class="profile-username">@' + escapeHTML(username || "—") + "</div>" +
            (isPrivate ? privateBadge : "") +
          "</div>" +
        "</div>" +
        '<div class="stat-row">' +
          '<div class="stat-cell"><div class="stat-value">' + escapeHTML(fmtCount(posts)) + '</div><div class="stat-label">Postingan</div></div>' +
          '<div class="stat-cell"><div class="stat-value">' + escapeHTML(fmtCount(followers)) + '</div><div class="stat-label">Followers</div></div>' +
          '<div class="stat-cell"><div class="stat-value">' + escapeHTML(fmtCount(following)) + '</div><div class="stat-label">Following</div></div>' +
        "</div>" +
        '<div class="profile-bio">' + (bio ? linkifyBio(bio) : "") + "</div>" +
      "</div>";
  }

  // ----------------------------------------------------------- submission

  var activeRequestId = 0;

  function runLookup(rawUsername) {
    var username = cleanUsername(rawUsername);
    if (!username) {
      renderState("info", "Masukkan username dulu", "Ketik username Instagram yang mau kamu lihat, lalu tekan Cari.");
      return;
    }
    if (!/^[a-zA-Z0-9._]{1,40}$/.test(username)) {
      renderState("error", "Username tidak valid", "Username Instagram hanya boleh berisi huruf, angka, titik, dan underscore.");
      return;
    }

    var requestId = ++activeRequestId;
    submitBtn.classList.add("is-loading");
    submitBtn.disabled = true;
    renderSkeleton();

    lookup(username)
      .then(function (json) {
        if (requestId !== activeRequestId) return; // a newer search started
        var ok = json && json.status !== false && json.result && json.result.metadata;
        if (!ok) {
          var msg = (json && (json.message || (json.result && json.result.error))) || "";
          renderState(
            "error",
            "Profil tidak ditemukan",
            msg || 'Tidak bisa menemukan akun "@' + username + '". Pastikan username benar dan akun tersebut ada.'
          );
          return;
        }
        renderProfile(json.result);
      })
      .catch(function () {
        if (requestId !== activeRequestId) return;
        renderState("error", "Gagal memuat profil", "Periksa koneksi internetmu lalu coba lagi.");
      })
      .finally(function () {
        if (requestId !== activeRequestId) return;
        submitBtn.classList.remove("is-loading");
        submitBtn.disabled = false;
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    runLookup(input.value);
  });

  input.addEventListener("input", function () {
    input.value = input.value.replace(/^@+/, "");
  });
})();
