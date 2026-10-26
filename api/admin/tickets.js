const L = require("../../lib/shared");
// owner side. /api/admin/tickets: list. ?id=X: one ticket with messages. ?id=X&action=reply | status: change it
module.exports = async (req, res) => {
  try {
    L.requireAdmin(req);
    const id = req.query.id, action = req.query.action;
    if (!id) {
      if (req.method !== "GET") throw L.fail(405, "Use GET.");
      return res.json(await L.db("tickets?select=*&order=updated_at.desc"));
    }
    const [t] = await L.db(`tickets?id=eq.${L.enc(id)}&select=*`);
    if (!t) throw L.fail(404, "Ticket not found.");
    if (req.method === "GET" && !action) {
      const { access, ...pub } = t;
      const messages = await L.db(`messages?ticket_id=eq.${L.enc(t.id)}&select=*&order=created_at.asc`);
      return res.json({ ...pub, messages });
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
    throw L.fail(405, "Not supported.");
  } catch (e) { L.send(res, e); }
};
