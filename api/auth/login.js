const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    const b = req.body || {}, to = L.norm(b.email);
    const u = await L.userRow(to);
    if (!u || L.hashPass(String(b.password || ""), u.salt) !== u.hash) throw L.fail(401, "Wrong email or password.");
    res.json({ token: L.makeToken(to), email: to, used: u.used });
  } catch (e) { L.send(res, e); }
};
