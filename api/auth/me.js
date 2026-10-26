const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    const email = L.userEmail(req);
    const u = email && await L.userRow(email);
    if (!u) throw L.fail(401, "Sign in first.");
    res.json({ email, used: u.used });
  } catch (e) { L.send(res, e); }
};
