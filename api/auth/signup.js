const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    const b = req.body || {};
    const to = L.norm(b.email), pw = String(b.password || ""), code = String(b.code || "");
    if (!L.valid(to)) throw L.fail(400, "Enter a valid email.");
    if (pw.length < 6) throw L.fail(400, "Password needs at least 6 characters.");
    if (await L.userRow(to)) throw L.fail(409, "An account with this email already exists.");
    const c = (await L.db(`codes?email=eq.${L.enc(to)}&select=*`))[0];
    if (!c || Number(c.exp) < Date.now() || c.code !== code) throw L.fail(400, "Wrong or expired code.");
    await L.db(`codes?email=eq.${L.enc(to)}`, { method: "DELETE", prefer: "return=minimal" });
    const salt = L.newSalt();
    await L.db("users", { method: "POST", prefer: "return=minimal", body: { email: to, salt, hash: L.hashPass(pw, salt), used: false } });
    res.json({ token: L.makeToken(to), email: to, used: false });
  } catch (e) { L.send(res, e); }
};
