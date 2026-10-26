const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    if (req.method === "POST") {
      const value = L.cleanPricing(req.body || {}, await L.pricing());
      await L.db("settings?on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { key: "pricing", value, updated_at: new Date().toISOString() } });
    }
    res.json(await L.pricing());
  } catch (e) { L.send(res, e); }
};
