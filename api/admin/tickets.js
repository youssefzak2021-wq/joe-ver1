const L = require("../../lib/shared");
// Owner side.
// GET /api/admin/tickets: every ticket (no access tokens), newest first, with the last message.
// GET ?id=X: one ticket with its messages and its order.
// POST ?id=X&action=reply | status | delete
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    const id = req.query.id, action = req.query.action;
    if (!id) {
      if (req.method !== "GET") throw L.fail(405, "Use GET.");
      const rows = await L.db("tickets?select=*&order=updated_at.desc");
      const recent = await L.db("messages?select=ticket_id,sender,text,files,created_at&order=created_at.desc&limit=1000");
      const last = {};
      for (const m of recent) if (!last[m.ticket_id]) last[m.ticket_id] = { sender: m.sender, text: m.text || "", img: (m.files || []).length > 0, at: m.created_at };
      return res.json(rows.map(({ access, ...t }) => ({ ...t, last: last[t.id] || null })));
    }
    const [t] = await L.db(`tickets?id=eq.${L.enc(id)}&select=*`);
    if (!t) throw L.fail(404, "Ticket not found.");
    if (req.method === "GET" && !action) {
      const { access, ...pub } = t;
      const messages = await L.db(`messages?ticket_id=eq.${L.enc(t.id)}&select=*&order=created_at.asc`);
      let order = null;
      if (t.order_id) {
        const [o] = await L.db(`orders?id=eq.${L.enc(t.order_id)}&select=*`);
        if (o) order = { ...L.view(o), email: o.email, pkg: o.pkg, c: o.c, notes: o.notes || "", proof: o.proof || null, created_at: o.created_at };
      }
      return res.json({ ...pub, messages, order });
    }
    if (req.method === "POST" && action === "reply") {
      const b = req.body || {};
      const text = String(b.text || "").slice(0, 2000).trim();
      const files = L.cleanFiles(b.files);
      if (!text && !files.length) throw L.fail(400, "Write a message or attach an image.");
      const [m] = await L.db("messages", { method: "POST", body: { ticket_id: t.id, sender: "joe", text, files } });
      await L.db(`tickets?id=eq.${L.enc(t.id)}`, { method: "PATCH", prefer: "return=minimal", body: { updated_at: new Date().toISOString() } });
      return res.json(m);
    }
    if (req.method === "POST" && action === "status") {
      const status = (req.body || {}).status;
      if (status !== "open" && status !== "closed") throw L.fail(400, "Status must be open or closed.");
      const [u] = await L.db(`tickets?id=eq.${L.enc(t.id)}`, { method: "PATCH", body: { status, updated_at: new Date().toISOString() } });
      return res.json(u);
    }
    if (req.method === "POST" && action === "delete") {
      await L.db(`messages?ticket_id=eq.${L.enc(t.id)}`, { method: "DELETE", prefer: "return=minimal" });
      const gone = await L.db(`tickets?id=eq.${L.enc(t.id)}`, { method: "DELETE" });
      if (!gone || !gone.length) throw L.fail(409, "The ticket could not be deleted. Try again.");
      return res.json({ ok: true });
    }
    throw L.fail(405, "Not supported.");
  } catch (e) { L.send(res, e); }
};
