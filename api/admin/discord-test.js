const L = require("../../lib/shared");
// Owner only. Sends one test message to the Discord webhook and says what happened.
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    if (req.method !== "POST") throw L.fail(405, "Use POST.");
    const url = process.env.DISCORD_WEBHOOK_URL || "";
    if (!url) return res.json({ urlSet: false, sent: false, note: "DISCORD_WEBHOOK_URL مش موجود في Vercel. ضيفه واعمل Redeploy." });
    const owner = process.env.OWNER_DISCORD_ID || "1266090280604536996";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "joe", content: `<@${owner}> ✅ اختبار الإشعار من لوحة الأدمن`, allowed_mentions: { users: [owner] } }),
      });
      return res.json({
        urlSet: true,
        sent: r.ok,
        status: r.status,
        note: r.ok ? "Discord استلم الرسالة. شوف الروم." : "Discord رفض الطلب (" + r.status + "). الرابط غلط أو الويب هوك اتمسح.",
      });
    } catch (e) {
      return res.json({ urlSet: true, sent: false, note: "مقدرناش نوصل لديسكورد: " + e.message });
    }
  } catch (e) { L.send(res, e); }
};
