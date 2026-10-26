const L = require("../../../../lib/shared");
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    if (req.method !== "POST") throw L.fail(405, "Use POST.");
    const o = await L.orderRow(req.query.id);
    if (!o) throw L.fail(404, "Order not found.");
    let inv = o.inv;
    if (o.status !== "paid") { inv = await L.markPaid(o); o.status = "paid"; }
    res.json(L.view({ ...o, inv }));
  } catch (e) { L.send(res, e); }
};
