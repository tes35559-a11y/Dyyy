// Netlify Function: proxies the Instagram profile lookup to api.kyzzz.xyz,
// injecting the API key server-side so it's never shipped in client JS and
// so the browser never has to make a cross-origin request directly.
// Available after deploy at /.netlify/functions/stalk?username=...
const UPSTREAM = "https://api.kyzzz.xyz/api/stalker/ig";
const API_KEY = "kyzz508379258";

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };

  try {
    const params = event.queryStringParameters || {};
    const username = (params.username || "").trim().replace(/^@+/, "");
    if (!username || !/^[a-zA-Z0-9._]{1,40}$/.test(username)) {
      return { statusCode: 400, headers, body: JSON.stringify({ status: false, message: "Invalid or missing 'username' parameter." }) };
    }

    const url = UPSTREAM + "?username=" + encodeURIComponent(username) + "&apikey=" + encodeURIComponent(API_KEY);

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 15000);

    let upstreamRes;
    try {
      upstreamRes = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; ProfilkuProxy/1.0)" },
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstreamRes.text();
    // Pass the upstream body through as-is; the frontend already knows how
    // to read the API's own status/result shape.
    return { statusCode: 200, headers, body: text };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ status: false, message: "Proxy error", error: String((err && err.message) || err) }),
    };
  }
};
