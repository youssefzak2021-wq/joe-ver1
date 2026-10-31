const L = require("../lib/shared");
// Public: prices, and the Discord links the site shows (owner profile and server invite).
module.exports = async (req, res) => {
  try { res.json({ ...(await L.pricing()), links: await L.links() }); } catch (e) { L.send(res, e); }
};
