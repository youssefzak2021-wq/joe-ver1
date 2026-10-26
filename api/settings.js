const L = require("../lib/shared");
module.exports = async (req, res) => {
  try { res.json(await L.pricing()); } catch (e) { L.send(res, e); }
};
