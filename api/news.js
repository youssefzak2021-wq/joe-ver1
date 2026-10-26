const L = require("../lib/shared");
module.exports = async (req, res) => {
  try { res.json(await L.db("news?select=id,date,title,body&order=created_at.desc")); }
  catch (e) { L.send(res, e); }
};
