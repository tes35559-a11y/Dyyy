// Netlify Function: proxies requests to the drama API so the browser never
// has to make a cross-origin request directly. Deploying this file under
// netlify/functions/ makes it available at /.netlify/functions/proxy.
const UPSTREAM = "https://api.saipulanuar.eu.org/api/drama";
const ALLOWED_PATHS = new Set(["trending", "foryou", "recommended", "search", "detail", "episode"]);

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  };

  try {
    const params = event.queryStringParameters || {};
    const path = params.path;
    if (!path || !ALLOWED_PATHS.has(path)) {
      return { statusCode: 400, headers, body: JSON.stringify({ status: false, message: "Invalid or missing 'path' parameter." }) };
    }

    const rest = Object.assign({}, params);
    delete rest.path;
    const search = new URLSearchParams(rest).toString();
    const url = UPSTREAM + "/" + path + (search ? "?" + search : "");

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 15000);

    let upstreamRes;
    try {
      upstreamRes = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RacuunProxy/1.0)" },
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstreamRes.text();
    // Pass the upstream body through as-is; the frontend already knows how
    // to read the API's own status/result/error shape.
    return { statusCode: 200, headers, body: text };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ status: false, message: "Proxy error", error: String((err && err.message) || err) }),
    };
  }
};
