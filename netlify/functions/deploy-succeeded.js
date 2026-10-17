// Dijalankan Netlify otomatis setiap deploy sukses: memasang webhook Telegram
// supaya bot langsung bisa membalas tanpa perlu membuka website dulu.
const notif = require("./notif.js");

exports.handler = async function () {
  try {
    const r = await notif.installWebhook(process.env.SITE_URL || process.env.URL);
    console.log("[deploy-succeeded] setWebhook:", JSON.stringify(r));
  } catch (e) {
    console.log("[deploy-succeeded] gagal:", e && e.message);
  }
  return { statusCode: 200, body: "ok" };
};
