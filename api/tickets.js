const L = require("../lib/shared");
// POST /api/tickets: open a purchase ticket (orderId + token) or a support ticket (email + reason).
// GET /api/tickets?id=X&token=T: read. POST ?id=X&action=message: send. POST ?id=X&action=rate: rate a closed ticket (once).
module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      if (req.method !== "POST") throw L.fail(405, "Use POST.");
      const b = req.body || {};
      const lang = b.lang === "ar" ? "ar" : "en";
      if (b.type === "purchase") {
        const o = await L.orderByToken(b.orderId, b.token);
        if (!o) throw L.fail(404, "Order not found.");
        const old = (await L.db(`tickets?order_id=eq.${L.enc(o.id)}&select=*`))[0];
        if (old) return res.json(old);
        const [t] = await L.db("tickets", { method: "POST", body: { email: o.email, type: "purchase", order_id: o.id, reason: o.pkg, access: L.newToken(), lang } });
        return res.json(t);
      }
      if (b.type === "support") {
        const email = L.norm(b.email);
        if (!L.valid(email)) throw L.fail(400, "Enter a valid email.");
        const [t] = await L.db("tickets", { method: "POST", body: { email, type: "support", reason: String(b.reason || "other").slice(0, 40), access: L.newToken(), lang } });
        return res.json(t);
      }
      throw L.fail(400, "Unknown ticket type.");
    }
    const token = req.method === "GET" ? req.query.token : (req.body || {}).token;
    const t = await L.ticketByToken(id, token);
    if (!t) throw L.fail(404, "Ticket not found.");
    if (req.method === "GET") {
      const { access, ...pub } = t;
      const messages = await L.db(`messages?ticket_id=eq.${L.enc(t.id)}&select=*&order=created_at.asc`);
      let order = null;
      if (t.order_id) {
        const [o] = await L.db(`orders?id=eq.${L.enc(t.order_id)}&select=*`);
        if (o) order = { status: o.status, setup: o.setup || null, inv: o.inv || null };
      }
      return res.json({ ...pub, messages, order });
    }
    if (req.method === "POST" && req.query.action === "message") {
      if (t.status === "closed") throw L.fail(400, "This ticket is closed.");
      const b = req.body || {};
      const text = String(b.text || "").slice(0, 2000);
      const files = L.cleanFiles(b.files);
      if (!text && !files.length) throw L.fail(400, "Write a message or attach an image.");
      const [[m]] = await Promise.all([
        L.db("messages", { method: "POST", body: { ticket_id: t.id, sender: "me", text, files } }),
        L.db(`tickets?id=${L.enc(t.id)}`, { method: "PATCH", prefer: "return=minimal", body: { updated_at: new Date().toISOString() } }),
      ]);
      return res.json(m);
    }
    if (req.method === "POST" && req.query.action === "rate") {
      if (t.status !== "closed") throw L.fail(400, "You can rate the ticket after it is closed.");
      if (t.rating) throw L.fail(400, "This ticket is already rated.");
      const b = req.body || {};
      const stars = Math.floor(Number(b.stars) || 0);
      if (stars < 1 || stars > 5) throw L.fail(400, "Pick a rating from 1 to 5 stars.");
      const note = String(b.text || "").slice(0, 500).trim();
      await L.db(`tickets?id=eq.${L.enc(t.id)}`, { method: "PATCH", prefer: "return=minimal", body: { rating: stars, rating_note: note, rated_at: new Date().toISOString() } });
      return res.json({ ok: true, rating: stars });
    }
    throw L.fail(405, "Not supported.");
  } catch (e) { L.send(res, e); }
};
