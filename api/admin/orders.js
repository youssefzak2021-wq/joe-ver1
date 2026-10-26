const L = require("../../lib/shared");
// /api/admin/orders: list every order. /api/admin/orders?id=X&action=status with {status: "cancelled" | "refunded"}.
// Confirming a payment is still /api/admin/orders/<id>/confirm.
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    const id = req.query.id;
    if (!id) {
      if (req.method !== "GET") throw L.fail(405, "Use GET.");
      const rows = await L.db("orders?select=*&order=created_at.desc");
      return res.json(rows.map(o => ({ ...L.view(o), email: o.email, createdAt: o.created_at, proof: o.proof || null })));
    }
    if (req.method !== "POST" || req.query.action !== "status") throw L.fail(405, "Not supported.");
    const status = (req.body || {}).status;
    if (status !== "cancelled" && status !== "refunded") throw L.fail(400, "Status must be cancelled or refunded.");
    const [o] = await L.db(`orders?id=eq.${L.enc(id)}&select=*`);
    if (!o) throw L.fail(404, "Order not found.");
    const [u] = await L.db(`orders?id=eq.${L.enc(o.id)}`, { method: "PATCH", body: { status } });
    res.json(L.view(u));
  } catch (e) { L.send(res, e); }
};
