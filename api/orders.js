const L = require("../lib/shared");
// POST /api/orders: create (needs the invoice email). GET /api/orders?id=X&token=T: read.
// POST /api/orders?id=X&action=coin|proof: change coin or attach the transfer screenshot. Token goes in the body.
module.exports = async (req, res) => {
  try {
    const P = await L.pricing();
    const id = req.query.id, action = req.query.action;
    if (id) {
      const token = req.method === "GET" ? req.query.token : (req.body || {}).token;
      const o = await L.orderByToken(id, token);
      if (!o) throw L.fail(404, "Order not found.");
      if (req.method === "GET") return res.json(L.view(o));
      if (o.status === "paid") throw L.fail(400, "This order is already paid.");
      if (action === "coin") {
        const coin = String((req.body || {}).coin || "");
        if (!L.COINS[coin]) throw L.fail(400, "Pick a coin first.");
        const k = await L.pickK(coin);
        const [up] = await L.db(`orders?id=eq.${L.enc(o.id)}`, { method: "PATCH", body: { coin, k, units: L.unitsFor(o.total_cents, L.coinOf(coin, P), k).toString(), status: "awaiting" } });
        return res.json(L.view(up));
      }
      if (action === "proof") {
        const b = req.body || {};
        if (!String(b.image || "").startsWith("data:image/")) throw L.fail(400, "Send a screenshot image.");
        if (b.image.length > 3.4e6) throw L.fail(413, "The screenshot is too large. Send a smaller image.");
        const [up] = await L.db(`orders?id=eq.${L.enc(o.id)}`, { method: "PATCH", body: { proof: { name: String(b.name || "transfer").slice(0, 80), data: b.image }, status: "review" } });
        return res.json(L.view(up));
      }
      throw L.fail(405, "Not supported.");
    }
    if (req.method !== "POST") throw L.fail(405, "Use POST.");
    const b = req.body || {}, email = L.norm(b.email);
    if (!L.valid(email)) throw L.fail(400, "Enter a valid email for your invoice.");
    const coin = String(b.coin || "");
    if (!L.COINS[coin]) throw L.fail(400, "Pick a coin first.");
    const q = L.quote(b, await L.usedBefore(email), P), k = await L.pickK(coin), access = L.newToken();
    const [o] = await L.db("orders", { method: "POST", body: {
      email, access, notes: String(b.notes || "").slice(0, 500), pkg: q.pkg, c: q.c,
      sub_cents: q.subCents, pct: q.pct, total_cents: q.totalCents,
      coin, k, units: L.unitsFor(q.totalCents, L.coinOf(coin, P), k).toString(), status: "awaiting",
    } });
    res.json({ ...L.view(o), token: access });
  } catch (e) { L.send(res, e); }
};
