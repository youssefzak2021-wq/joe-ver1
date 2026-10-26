const L = require("../lib/shared");
module.exports = async (req, res) => {
  try {
    const email = L.userEmail(req);
    const u = email && await L.userRow(email);
    if (!u) throw L.fail(401, "Sign in first.");
    const b = req.body || {}, coin = String(b.coin || "");
    if (!L.COINS[coin]) throw L.fail(400, "Pick a coin first.");
    const q = L.quote(b, u.used), k = await L.pickK(coin);
    const [o] = await L.db("orders", { method: "POST", body: {
      email, notes: String(b.notes || "").slice(0, 500), pkg: q.pkg, c: q.c,
      sub_cents: q.subCents, pct: q.pct, total_cents: q.totalCents,
      coin, k, units: L.unitsFor(q.totalCents, L.COINS[coin], k).toString(), status: "awaiting",
    } });
    res.json(L.view(o));
  } catch (e) { L.send(res, e); }
};
