const L = require("../../lib/shared");
module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") throw L.fail(405, "Use POST.");
    const to = L.norm((req.body || {}).email);
    if (!L.valid(to)) throw L.fail(400, "Enter a valid email.");
    const prev = (await L.db(`codes?email=eq.${L.enc(to)}&select=at`))[0];
    if (prev && Date.now() - Number(prev.at) < 60000) throw L.fail(429, "Wait a minute before asking for another code.");
    const code = L.randomCode();
    await L.db("codes?on_conflict=email", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: { email: to, code, exp: Date.now() + 600000, at: Date.now() } });
    try {
      await L.sendMail(to, "Your joe verification code", `<p>Your code is <b style="font-size:22px">${code}</b>. It expires in 10 minutes.</p>`);
    } catch (e) {
      await L.db(`codes?email=eq.${L.enc(to)}`, { method: "DELETE", prefer: "return=minimal" });
      throw L.fail(502, "We could not send the email. Check the address and try again.");
    }
    res.json({ sent: true });
  } catch (e) { L.send(res, e); }
};
