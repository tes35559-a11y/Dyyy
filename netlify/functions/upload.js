// Proxy upload ke api.fazzcode.eu.cc (API key disimpan di sisi server)
const API = "https://api.fazzcode.eu.cc/api/uguu";
const KEY = process.env.FAZZ_API_KEY || "fcs_live_52edc31a072157b9d9d138dae97bf19c9c3811e0";
const FIELDS = ["file", "files[]", "files"];
const H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Gunakan metode POST." });
  try {
    const h = event.headers || {};
    let name = "upload";
    try { name = decodeURIComponent(h["x-filename"] || "upload"); } catch {}
    const mime = h["x-mime"] || "application/octet-stream";
    if (!event.body) return out(400, { error: "File kosong." });
    const buf = Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf8");

    let last = { error: "Upload gagal." };
    for (const field of FIELDS) {
      const fd = new FormData();
      fd.append(field, new Blob([buf], { type: mime }), name);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      let res;
      try {
        res = await fetch(`${API}?apikey=${encodeURIComponent(KEY)}`, {
          method: "POST",
          body: fd,
          signal: ctrl.signal,
          headers: { "x-api-key": KEY, Authorization: "Bearer " + KEY, Accept: "application/json" },
        });
      } finally { clearTimeout(timer); }
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { if (/^https?:\/\/\S+$/.test(text.trim())) data = { url: text.trim() }; }
      if (res.ok && data) return out(200, { data });
      last = { error: (data && (data.message || data.error)) || "API error " + res.status, status: res.status };
      if (![400, 415, 422].includes(res.status)) break;
    }
    return out(last.status || 502, { error: String(last.error) });
  } catch (e) {
    return out(504, { error: e.name === "AbortError" ? "Timeout, coba lagi." : "Gagal menghubungi API: " + e.message });
  }
};
