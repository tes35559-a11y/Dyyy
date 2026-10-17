// Proxy ke 2 API: TikTok (api-faa.my.id) dan Instagram (axlyapi.qzz.io)
const APIS = {
  tiktok: { host: /(^|\.)tiktok\.com$/, api: "https://api-faa.my.id/faa/tiktok" },
  igdl: { host: /(^|\.)instagram\.com$/, api: "https://axlyapi.qzz.io/download/igdl" },
};
const H = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  try {
    const url = ((event.queryStringParameters || {}).url || "").trim();
    let u;
    try { u = new URL(url); } catch { return out(400, { error: "Link tidak valid." }); }
    const host = u.hostname.toLowerCase();
    const key = Object.keys(APIS).find((k) => APIS[k].host.test(host));
    if (!key) return out(400, { error: "Hanya link TikTok dan Instagram yang didukung." });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch(`${APIS[key].api}?url=${encodeURIComponent(url)}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    clearTimeout(timer);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { return out(502, { error: "Respons API bukan JSON.", raw: text.slice(0, 300) }); }
    if (!res.ok) return out(res.status, { error: (data && (data.message || data.error)) || "API error " + res.status });
    return out(200, { data, platform: key === "tiktok" ? "TikTok" : "Instagram" });
  } catch (e) {
    return out(504, { error: e.name === "AbortError" ? "Timeout, coba lagi." : "Gagal menghubungi API: " + e.message });
  }
};
