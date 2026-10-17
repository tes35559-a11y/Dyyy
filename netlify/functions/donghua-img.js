// Proxy gambar thumbnail — beberapa CDN memblokir hotlink kalau Referer bukan
// dari domain asalnya, jadi kita ambil gambarnya di server lalu teruskan ke browser.
exports.handler = async (event) => {
  const src = (event.queryStringParameters || {}).src;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' };
  if (!src || !/^https?:\/\//i.test(src)) {
    return { statusCode: 400, headers, body: 'src tidak valid' };
  }
  try {
    let origin = '';
    try { origin = new URL(src).origin + '/'; } catch {}
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(src, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: origin,
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    });
    clearTimeout(t);
    if (!res.ok) return { statusCode: res.status, headers, body: 'gagal mengambil gambar' };
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': res.headers.get('content-type') || 'image/jpeg' },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 502, headers, body: 'gagal mengambil gambar: ' + e.message };
  }
};
