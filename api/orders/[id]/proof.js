const L = require("../../../lib/shared");
module.exports = async (req, res) => {
  try {
    const email = L.userEmail(req);
    if (!email) throw L.fail(401, "Sign in first.");
    const o = await L.orderRow(req.query.id, email);
    if (!o) throw L.fail(404, "Order not found.");
    if (o.status === "paid") throw L.fail(400, "This order is already paid.");
    const b = req.body || {};
    if (!String(b.image || "").startsWith("data:image/")) throw L.fail(400, "Send a screenshot image.");
    if (b.image.length > 3.4e6) throw L.fail(413, "The screenshot is too large. Send a smaller image.");
    const [up] = await L.db(`orders?id=eq.${L.enc(o.id)}`, { method: "PATCH", body: { proof: { name: String(b.name || "transfer").slice(0, 80), data: b.image }, status: "review" } });
    res.json(L.view(up));
  } catch (e) { L.send(res, e); }
};
