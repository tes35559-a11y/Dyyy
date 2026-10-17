// Proxy ke API Moviezone: validasi parameter, timeout, retry, dan cache CDN.
const UPSTREAM = "https://api.zyvor.my.id/api/movie/moviezone";
const ACTIONS = new Set(["trending", "search", "detail", "popular", "latest", "upcoming", "toprated", "top-rated"]);
const TYPES = new Set(["all", "movie", "tv"]);

const json = (status, data, cache = "no-store") =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cache,
      "netlify-cdn-cache-control": cache === "no-store" ? "no-store" : "public, s-maxage=600, stale-while-revalidate=3600",
    },
  });

async function fetchUpstream(url, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Netlify Function)" },
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      if (res.ok) return data;
      lastErr = new Error(data?.message || `Upstream ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export default async (req) => {
  const params = new URL(req.url).searchParams;
  const requestedAction = params.get("action") || "trending";
  // Samakan alias yang dipakai frontend dengan nama action API upstream.
  const action = requestedAction === "toprated" ? "top-rated" : requestedAction;
  const type = TYPES.has(params.get("type")) ? params.get("type") : "all";
  const query = (params.get("query") || "").trim().slice(0, 100);
  const slug = (params.get("slug") || "").trim();

  if (!ACTIONS.has(action)) return json(400, { status: false, message: "Action tidak valid" });
  if (action === "search" && !query) return json(400, { status: false, message: "Kata kunci kosong" });
  if (action === "detail" && !/^(movie|tv)-\d+$/.test(slug)) return json(400, { status: false, message: "Slug tidak valid" });

  // Nilai default sesuai contoh endpoint yang diberikan.
  const upstream = new URL(UPSTREAM);
  upstream.searchParams.set("action", action);
  upstream.searchParams.set("query", query || "avengers");
  upstream.searchParams.set("slug", slug || "movie-1248832");
  upstream.searchParams.set("type", type);

  try {
    const data = await fetchUpstream(upstream);
    if (!data?.status) return json(502, { status: false, message: data?.message || "Data tidak tersedia" });

    // Frontend DyyMovie2 lama menggunakan data.result. API sumber dapat
    // mengirim result, results, data, atau array langsung; normalkan tanpa
    // mengubah bentuk field lain yang sudah dipakai halaman.
    let result = data.result;
    if (result === undefined) result = data.results;
    if (result === undefined) result = data.data;
    if (result === undefined && Array.isArray(data)) result = data;
    if (action === "detail" && Array.isArray(result)) result = result[0] || null;

    const payload = result === undefined ? data : { ...data, result };
    return json(200, payload, "public, max-age=120");
  } catch (err) {
    return json(502, { status: false, message: "Server film sedang sibuk, coba lagi." });
  }
};

