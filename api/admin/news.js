const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    if (req.method !== "POST") throw L.fail(405, "Use POST.");
    const b = req.body || {};
    if (!b.title_en || !b.title_ar) throw L.fail(400, "Write the title in both languages.");
    await L.db("news", { method: "POST", prefer: "return=minimal", body: {
      date: new Date().toISOString().slice(0, 10),
      title: { en: String(b.title_en).slice(0, 120), ar: String(b.title_ar).slice(0, 120) },
      body: { en: String(b.body_en || "").slice(0, 600), ar: String(b.body_ar || "").slice(0, 600) },
    } });
    res.json(await L.db("news?select=id,date,title,body&order=created_at.desc"));
  } catch (e) { L.send(res, e); }
};
