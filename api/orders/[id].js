const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    const email = L.userEmail(req);
    if (!email) throw L.fail(401, "Sign in first.");
    const o = await L.orderRow(req.query.id, email);
    if (!o) throw L.fail(404, "Order not found.");
    res.json(L.view(o));
  } catch (e) { L.send(res, e); }
};
