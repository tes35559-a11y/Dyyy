// Netlify Function: fetches a public profile image and streams it to the browser.
var ALLOWED_HOSTS = ["cdn.iqsaved.com","scontent.cdninstagram.com","cdninstagram.com","fbcdn.net","instagram.com","instagram.f","fna.fbcdn.net","fb.com","lookaside.fbsbx.com","scontent.xx.fbcdn.net"];
function isAllowedHost(hostname) {
  hostname = String(hostname || "").toLowerCase();
  return ALLOWED_HOSTS.some(function (h) { return hostname === h || hostname.endsWith("." + h); });
}
function detectType(buf, header) {
  var h = String(header || "").split(";")[0].trim().toLowerCase();
  if (h.indexOf("image/") === 0) return h;
  if (buf && buf.length >= 4) {
    if (buf[0]===255 && buf[1]===216 && buf[2]===255) return "image/jpeg";
    if (buf[0]===137 && buf[1]===80 && buf[2]===78 && buf[3]===71) return "image/png";
    if (buf[0]===71 && buf[1]===73 && buf[2]===70) return "image/gif";
    if (buf[0]===82 && buf[1]===73 && buf[2]===70 && buf[3]===70) return "image/webp";
    if (buf[0]===66 && buf[1]===77) return "image/bmp";
    if (buf.length >= 12 && buf[0]===102 && buf[1]===116 && buf[2]===121 && buf[3]===112 && (buf[8]===97 || buf[8]===97)) return "image/avif";
  }
  return null;
}
async function fetchImage(url) {
  var controller = new AbortController();
  var timer = setTimeout(function(){ controller.abort(); }, 15000);
  try {
    var res = await fetch(url,{redirect:"follow",signal:controller.signal,headers:{"User-Agent":"Mozilla/5.0","Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.8","Referer":"https://www.instagram.com/"}});
    if (!res.ok) return null;
    var buf = Buffer.from(await res.arrayBuffer());
    var type = detectType(buf,res.headers.get("content-type"));
    return type ? {buf:buf,type:type} : null;
  } finally { clearTimeout(timer); }
}
exports.handler = async function(event) {
  var headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Cache-Control":"public, max-age=3600"};
  if(event.httpMethod === "OPTIONS") return {statusCode:204,headers:headers,body:""};
  try {
    var raw=String((event.queryStringParameters||{}).url||"");
    if(!raw) return {statusCode:400,headers:headers,body:"Missing url"};
    var target; try { target=new URL(raw); } catch(e) { target=null; }
    if(!target || (target.protocol!=="https:" && target.protocol!=="http:")) return {statusCode:400,headers:headers,body:"Invalid image URL"};
    var candidates=[];
    // Direct embedding is attempted only for known public image/CDN hosts.
    if(isAllowedHost(target.hostname)) candidates.push(target.toString());
    // Public image proxies handle Instagram hotlink/referrer restrictions.
    candidates.push("https://images.weserv.nl/?url="+encodeURIComponent(target.toString()));
    candidates.push("https://wsrv.nl/?url="+encodeURIComponent(target.toString()));
    for(var i=0;i<candidates.length;i++) {
      try {
        var result=await fetchImage(candidates[i]);
        if(result) return {statusCode:200,headers:Object.assign({},headers,{"Content-Type":result.type}),body:result.buf.toString("base64"),isBase64Encoded:true};
      } catch(e) {}
    }
    return {statusCode:404,headers:headers,body:"Avatar tidak dapat dimuat."};
  } catch(err) { return {statusCode:502,headers:headers,body:"Proxy error: "+String((err&&err.message)||err)}; }
};
