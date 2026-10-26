const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    const rows = await L.db("orders?select=*&order=created_at.desc");
    res.json(rows.map(o => ({ ...L.view(o), email: o.email, createdAt: o.created_at, proof: o.proof || null })));
  } catch (e) { L.send(res, e); }
};
