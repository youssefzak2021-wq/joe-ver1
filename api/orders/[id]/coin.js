const L = require("../../../lib/shared");
module.exports = async (req, res) => {
  try {
    const email = L.userEmail(req);
    if (!email) throw L.fail(401, "Sign in first.");
    const o = await L.orderRow(req.query.id, email);
    if (!o) throw L.fail(404, "Order not found.");
    if (o.status === "paid") throw L.fail(400, "This order is already paid.");
    const coin = String((req.body || {}).coin || "");
    if (!L.COINS[coin]) throw L.fail(400, "Pick a coin first.");
    const k = await L.pickK(coin);
    const [up] = await L.db(`orders?id=eq.${L.enc(o.id)}`, { method: "PATCH", body: { coin, k, units: L.unitsFor(o.total_cents, L.COINS[coin], k).toString(), status: "awaiting" } });
    res.json(L.view(up));
  } catch (e) { L.send(res, e); }
};
