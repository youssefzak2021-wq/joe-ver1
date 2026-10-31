// Shared helpers for the Vercel functions: database, auth, pricing, email.
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const EVM = "0x5ec198806D6B837d5Eb43b7A3a8d6eD6FC60758B";
const COINS = {
  BTC:  { rate: 80500, dec: 8, disp: 8, net: "Bitcoin", addr: "bc1q4k0w23e5cacmrmmk28zmmfgx9je2zfr6fp8hrw" },
  ETH:  { rate: 2500, dec: 18, disp: 6, net: "Ethereum", addr: EVM },
  USDT: { rate: 1, dec: 18, disp: 2, net: "BNB Smart Chain (BEP20)", addr: EVM },
  SOL:  { rate: 100, dec: 9, disp: 4, net: "Solana", addr: "9gzKNTukGgUQLVWT8baekXjXzQ4H8d5sCRjpoH4TcHsT" },
  LTC:  { rate: 56, dec: 8, disp: 6, net: "Litecoin", addr: "ltc1q2l0q8cchdhylsrzkr2ef0qtzsk3g3mkluukhng" },
};

const fail = (status, message) => Object.assign(new Error(message), { status });
const norm = v => String(v || "").trim().toLowerCase();
const valid = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const enc = v => encodeURIComponent(v);
const clamp = v => Math.max(0, Math.min(99, Math.floor(Number(v)) || 0));
const hashPass = (pw, salt) => crypto.scryptSync(String(pw || ""), salt, 64).toString("hex");
const newSalt = () => crypto.randomBytes(16).toString("hex");
const newToken = () => crypto.randomBytes(18).toString("base64url");
const randomCode = () => String(crypto.randomInt(100000, 1000000));
const sign = d => crypto.createHmac("sha256", SECRET).update(d).digest("base64url");
const makeToken = email => { const d = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 30 * 864e5 })).toString("base64url"); return d + "." + sign(d); };

function userEmail(req) {
  const h = req.headers.authorization || "", tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [d, sig] = tok.split(".");
  if (!d || !sig || sign(d) !== sig) return null;
  const p = JSON.parse(Buffer.from(d, "base64url").toString());
  return p.x > Date.now() ? p.e : null;
}
function requireAdmin(req) {
  if (!process.env.ADMIN_KEY || req.headers["x-admin-key"] !== process.env.ADMIN_KEY) throw fail(403, "Not allowed.");
}
function send(res, e) {
  const status = e.status || 500;
  if (status === 500) console.error(e);
  res.status(status).json({ error: status === 500 ? "Something went wrong." : e.message });
}

// Supabase REST API, using the service key (server side only, never in the page)
async function db(path, o = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: o.method || "GET",
    headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Prefer: o.prefer || "return=representation" },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  const txt = await r.text();
  const j = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw fail(500, "Database error: " + (j && j.message ? j.message : r.status));
  return j;
}
const userRow = async email => (await db(`users?email=eq.${enc(email)}&select=*`))[0] || null;
// an order or ticket is read with the token the page got when it was created (no accounts)
const orderByToken = async (id, token) => (token ? (await db(`orders?id=eq.${enc(id)}&access=eq.${enc(token)}&select=*`))[0] : null) || null;
const ticketByToken = async (id, token) => (token ? (await db(`tickets?id=eq.${enc(id)}&access=eq.${enc(token)}&select=*`))[0] : null) || null;
const usedBefore = async email => (await db(`orders?email=eq.${enc(email)}&status=eq.paid&select=id`)).length > 0;
const orderRow = async (id, email) => (await db(`orders?id=eq.${enc(id)}${email ? `&email=eq.${enc(email)}` : ""}&select=*`))[0] || null;

async function sendMail(to, subject, html) {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const tr = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
    await tr.sendMail({ from: `joe <${process.env.GMAIL_USER}>`, to, subject, html });
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV !== "production") return console.log("[dev mail]", to, subject, html);
    throw new Error("RESEND_API_KEY is not set");
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "joe <onboarding@resend.dev>", to: [to], subject, html }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error("Resend " + r.status + ": " + (j.message || "unknown error"));
  }
}

// amounts as integers in the chain's smallest unit (BigInt, no float rounding)
const P10 = n => 10n ** BigInt(n);
function unitsFor(cents, c, k) {
  const step = P10(c.dec - c.disp), num = BigInt(cents) * P10(c.dec), den = BigInt(c.rate) * 100n;
  const exact = (num + den - 1n) / den;
  return ((exact + step - 1n) / step) * step + BigInt(k) * step;
}
const formatUnits = (u, c) => {
  const whole = u / P10(c.dec), frac = (u % P10(c.dec)).toString().padStart(c.dec, "0").slice(0, c.disp);
  return c.disp ? `${whole}.${frac}` : `${whole}`;
};
// Default prices. The owner can change them from /admin; the saved values live in the settings table.
const DEFAULT_PRICING = {
  base: { community: 1, shop: 1, store: 1, upgrade: 1, other: 1 }, // USD per package
  units: { rooms: 0.1, roles: 0.2, bots: 0.3 },                    // USD per room / role / bot
  rates: { BTC: 80500, ETH: 2500, USDT: 1, SOL: 100, LTC: 56 },    // USD for 1 coin
  code: { word: "joehere", percent: 10 },
  accounts: [
    { y: "2026", single: 0.25, bulk: 0.15 }, { y: "2025", single: 0.35, bulk: 0.28 },
    { y: "2024", single: 0.45, bulk: 0.35 }, { y: "2023", single: 0.55, bulk: 0.45 },
    { y: "2022", single: 0.65, bulk: 0.5 },  { y: "2021", single: 0.75, bulk: 0.6 },
    { y: "2020", single: 0.85, bulk: 0.75 }, { y: "2019", single: 1.2, bulk: 1 },
    { y: "2018", single: 1.8, bulk: 1.5 },   { y: "2017", single: 3.2, bulk: 2.8 },
    { y: "2016", single: 8, bulk: 7 },
  ],
};
const DEFAULT_LINKS = { server: "", profile: "https://discord.com/users/1266090280604536996" };
async function links() {
  let v = {};
  try { const row = (await db("settings?key=eq.links&select=value"))[0]; v = (row && row.value) || {}; } catch (e) { console.error("links settings unavailable:", e.message); }
  return { ...DEFAULT_LINKS, ...v };
}
function cleanLinks(b, cur) {
  const ok = u => /^https:\/\/\S+$/.test(u);
  const server = String((b && b.server) || "").trim(), profile = String((b && b.profile) || "").trim();
  if (server && !ok(server)) throw fail(400, "The server link must start with https://");
  if (profile && !ok(profile)) throw fail(400, "The profile link must start with https://");
  return { server: server.slice(0, 300), profile: (profile || cur.profile).slice(0, 300) };
}
async function pricing() {
  let v = {};
  try {
    const row = (await db("settings?key=eq.pricing&select=value"))[0];
    v = (row && row.value) || {};
  } catch (e) { console.error("pricing settings unavailable:", e.message); }
  return {
    base: { ...DEFAULT_PRICING.base, ...(v.base || {}) },
    units: { ...DEFAULT_PRICING.units, ...(v.units || {}) },
    rates: { ...DEFAULT_PRICING.rates, ...(v.rates || {}) },
    code: { ...DEFAULT_PRICING.code, ...(v.code || {}) },
    accounts: Array.isArray(v.accounts) ? v.accounts : DEFAULT_PRICING.accounts,
  };
}
const coinOf = (coin, P) => ({ ...COINS[coin], rate: P.rates[coin] });
function cleanPricing(b, cur) {
  const pick = (v, fb, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max && v !== "" && v !== null ? n : fb; };
  const out = { base: {}, units: {}, rates: {}, code: {} };
  for (const k of Object.keys(DEFAULT_PRICING.base)) out.base[k] = pick(b.base && b.base[k], cur.base[k], 0, 100000);
  for (const k of Object.keys(DEFAULT_PRICING.units)) out.units[k] = pick(b.units && b.units[k], cur.units[k], 0, 1000);
  for (const k of Object.keys(DEFAULT_PRICING.rates)) out.rates[k] = pick(b.rates && b.rates[k], cur.rates[k], 0.000001, 100000000);
  out.code.word = String((b.code && b.code.word) || cur.code.word).trim().slice(0, 30) || cur.code.word;
  out.code.percent = pick(b.code && b.code.percent, cur.code.percent, 0, 100);
  out.accounts = Array.isArray(b.accounts) ? b.accounts.slice(0, 60).map(r => ({
    y: String((r && r.y) || "").trim().slice(0, 4),
    single: pick(r && r.single, 0, 0, 100000),
    bulk: pick(r && r.bulk, 0, 0, 100000),
    out: !!(r && r.out),
  })).filter(r => /^\d{4}$/.test(r.y)).filter((r, i, a) => a.findIndex(x => x.y === r.y) === i) : cur.accounts;
  return out;
}
// The bars of the ticket barcode. The site draws the same bars, so both show the same barcode.
const hashCode = str => [...str].reduce((a, ch) => { a = ((a << 5) - a) + ch.charCodeAt(0); return a & a }, 0);
const pseudo = s => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };
function barBars(value) {
  const seed = hashCode(String(value));
  return Array.from({ length: 60 }, (_, i) => ({ w: pseudo(seed + i) > 0.7 ? 2.5 : 1.5 }));
}
// Form answers after the payment: what the owner needs to set the server or hand over the accounts
const SETUP = {
  server: { fields: { name: "text", decor: "yesno", colors: "text", notes: "text" }, required: ["name", "decor"] },
  account: { fields: { contact: "text", notes: "text" }, required: ["contact"] },
};
function cleanSetup(pkg, b) {
  const spec = pkg === "account" ? SETUP.account : SETUP.server;
  const out = {};
  for (const [k, kind] of Object.entries(spec.fields)) {
    const raw = b ? b[k] : undefined;
    if (kind === "yesno") { if (raw === "yes" || raw === "no") out[k] = raw; }
    else out[k] = String(raw == null ? "" : raw).replace(/[<>]/g, "").trim().slice(0, 300);
    if (spec.required.includes(k) && !out[k]) throw fail(400, "Please answer the required questions.");
  }
  return { ...out, at: new Date().toISOString() };
}
// Images attached to ticket messages: at most 3, kept small enough for the function body limit
function cleanFiles(list) {
  if (!Array.isArray(list)) return [];
  const out = list.slice(0, 3).map(f => ({ name: String((f && f.name) || "file").slice(0, 80), data: String((f && f.data) || "") }))
    .filter(f => f.data.startsWith("data:image/"));
  if (out.reduce((n, f) => n + f.data.length, 0) > 3.4e6) throw fail(413, "The images are too large. Send smaller ones.");
  return out;
}
function quote(b, used, P) {
  if (!Object.prototype.hasOwnProperty.call(P.base, b.pkg)) throw fail(400, "Pick a package first.");
  const c = { rooms: clamp(b.c && b.c.rooms), roles: clamp(b.c && b.c.roles), bots: clamp(b.c && b.c.bots) };
  let pct = 0;
  if (b.code) {
    if (String(b.code).trim().toLowerCase() !== String(P.code.word).toLowerCase()) throw fail(400, "This code is not valid.");
    if (used) throw fail(400, "This code is only for your first order.");
    pct = Number(P.code.percent) || 0;
  }
  const subCents = Math.round((P.base[b.pkg] + c.rooms * P.units.rooms + c.roles * P.units.roles + c.bots * P.units.bots) * 100);
  return { pkg: b.pkg, c, subCents, pct, totalCents: Math.round(subCents * (100 - pct) / 100) };
}
// Discord accounts: one or two cost the single price, three or more cost the bulk price for every account
function quoteAccount(b, used, P) {
  const year = String(b.year || ""), qty = Math.floor(Number(b.qty) || 0);
  const row = P.accounts.find(r => r.y === year);
  if (!row) throw fail(400, "Pick a year first.");
  if (row.out) throw fail(400, "This year is out of stock.");
  if (qty < 1 || qty > 50) throw fail(400, "Choose between 1 and 50 accounts.");
  let pct = 0;
  if (b.code) {
    if (String(b.code).trim().toLowerCase() !== String(P.code.word).toLowerCase()) throw fail(400, "This code is not valid.");
    if (used) throw fail(400, "This code is only for your first order.");
    pct = Number(P.code.percent) || 0;
  }
  const tier = b.tier === "bulk" || b.tier === "single" ? b.tier : (qty <= 2 ? "single" : "bulk");
  if (tier === "single" && qty > 2) throw fail(400, "The single price is for 1 or 2 accounts.");
  if (tier === "bulk" && qty < 3) throw fail(400, "The bulk price starts at 3 accounts.");
  const unit = tier === "bulk" ? row.bulk : row.single;
  const subCents = Math.round(unit * qty * 100);
  return { pkg: "account", c: { year, qty, tier }, subCents, pct, totalCents: Math.round(subCents * (100 - pct) / 100) };
}
async function pickK(coin) {
  const busy = new Set((await db(`orders?coin=eq.${coin}&status=in.(awaiting,review)&select=k`)).map(o => o.k));
  if (busy.size >= 99) throw fail(503, "Too many open orders for this coin right now. Try again shortly.");
  let k = 1 + Math.floor(Math.random() * 99);
  while (busy.has(k)) k = (k % 99) + 1;
  return k;
}
const view = o => ({
  id: o.id, ref: o.ref, status: o.status, usd: o.total_cents / 100, sub: o.sub_cents / 100, pct: o.pct / 100,
  pay: { coin: o.coin, amount: formatUnits(BigInt(o.units), COINS[o.coin]), addr: COINS[o.coin].addr, net: COINS[o.coin].net },
  inv: o.inv || null, setup: o.setup || null,
});
// --- the paid ticket: the same design as the site (ticket card), as table markup so mail apps show it
const esc2 = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TITLE = { community: "Community server", shop: "Shop package", store: "Store package", upgrade: "Upgrade a server", other: "Other servers", account: "Discord accounts" };
const money2 = n => "$" + Number(n).toFixed(2);
function whenText(d) {
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Cairo" });
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Cairo" });
  return `${day} • ${hm}`;
}
function barcodeRow(value) {
  return barBars(value).map(b => `<td width="${Math.round(b.w * 2)}" style="width:${Math.round(b.w * 2)}px;height:56px;background:#111111;font-size:0;line-height:0">&nbsp;</td><td width="2" style="width:2px;font-size:0;line-height:0">&nbsp;</td>`).join("");
}
const invoiceHTML = (o, inv) => {
  const when = new Date(inv.at || Date.now());
  const net = COINS[o.coin].net, isAcc = o.pkg === "account";
  const what = isAcc ? `Discord accounts, year ${esc2(o.c.year)}, quantity ${esc2(o.c.qty)}`
    : `${esc2(TITLE[o.pkg] || o.pkg)}: ${esc2(o.c.rooms)} rooms, ${esc2(o.c.roles)} roles, ${esc2(o.c.bots)} bots`;
  const seed = String(o.ref || "").replace(/\D/g, "").padStart(14, "0");
  const line = (k, v, strong) => `<tr><td style="padding:8px 0;color:#666666;font-size:14px${strong ? ";color:#111111;font-weight:bold;font-size:16px" : ""}">${k}</td><td align="right" style="padding:8px 0;font-size:14px;color:#111111;${strong ? "font-weight:bold;font-size:16px" : ""}">${v}</td></tr>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#efefef">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efefef;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:18px;font-family:Arial,Helvetica,sans-serif;color:#111111">
<tr><td style="padding:26px 28px 6px">
  <table role="presentation" width="100%"><tr>
    <td style="font-family:Georgia,serif;font-size:30px;font-weight:bold;color:#111111">joe</td>
    <td align="right" style="font-size:12px;color:#666666;letter-spacing:.12em">INVOICE<br><b style="font-size:15px;color:#111111;letter-spacing:0">${esc2(inv.no)}</b></td>
  </tr></table>
  <p style="margin:18px 0 0;font-size:12px;color:#666666;letter-spacing:.08em">BILLED TO</p>
  <p style="margin:2px 0 0;font-size:15px;color:#111111">${esc2(o.email)}</p>
  <p style="margin:10px 0 0;font-size:13px;color:#666666">${esc2(whenText(when))}</p>
</td></tr>
<tr><td style="padding:18px 28px 4px">
  <table role="presentation" width="100%" style="border-top:1px solid #e6e6e6">
    <tr><td style="padding:12px 0 4px;font-size:13px;color:#111111">${what}</td><td align="right" style="padding:12px 0 4px;font-size:13px;color:#111111">${money2(inv.sub)}</td></tr>
    ${line("Subtotal", money2(inv.sub))}
    ${o.pct ? line(`Discount (${esc2(o.pct)}%)`, "−" + money2(inv.sub - inv.total)) : ""}
    ${line("Total paid", money2(inv.total), true)}
    ${line("Paid with", esc2(o.coin) + " · " + esc2(net))}
    ${line("Status", "Paid")}
  </table>
</td></tr>
<tr><td style="padding:22px 28px 26px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e6e6e6;border-radius:20px">
  <tr><td align="center" style="padding:24px 22px 8px">
    <div style="width:58px;height:58px;line-height:58px;border-radius:50%;background:#f0f0f0;font-size:28px;color:#111111;text-align:center">&#10003;</div>
    <p style="margin:12px 0 2px;font-family:Georgia,serif;font-size:24px;font-weight:bold;color:#111111">Thank you!</p>
    <p style="margin:0;font-size:14px;color:#666666">Your ticket has been issued successfully</p>
  </td></tr>
  <tr><td style="padding:14px 22px 22px">
    <div style="border-top:2px dashed #d4d4d4;margin:6px 0 16px"></div>
    <table role="presentation" width="100%"><tr>
      <td valign="top"><p style="margin:0;font-size:11px;letter-spacing:.08em;color:#777777">TICKET ID</p><p style="margin:3px 0 0;font-family:Courier New,monospace;font-size:15px;font-weight:bold;color:#111111">${esc2(o.ref)}</p></td>
      <td valign="top" align="right"><p style="margin:0;font-size:11px;letter-spacing:.08em;color:#777777">AMOUNT</p><p style="margin:3px 0 0;font-family:Georgia,serif;font-size:22px;font-weight:bold;color:#111111">${money2(inv.total)}</p></td>
    </tr></table>
    <p style="margin:14px 0 0;font-size:11px;letter-spacing:.08em;color:#777777">DATE &amp; TIME</p>
    <p style="margin:3px 0 0;font-size:15px;font-weight:bold;color:#111111">${esc2(whenText(when))}</p>
    <table role="presentation" width="100%" style="margin-top:14px;background:#f4f4f4;border-radius:14px"><tr><td style="padding:12px 14px">
      <table role="presentation"><tr>
        <td valign="middle" style="width:38px;height:38px;border-radius:19px;background:#111111;color:#ffffff;text-align:center;font-family:Georgia,serif;font-size:18px">${esc2(({ BTC: "₿", ETH: "Ξ", USDT: "₮", SOL: "◎", LTC: "Ł" })[o.coin] || "")}</td>
        <td style="padding-left:12px"><p style="margin:0;font-size:14px;font-weight:bold;color:#111111;word-break:break-all">${esc2(o.email)}</p><p style="margin:2px 0 0;font-family:Courier New,monospace;font-size:12px;color:#555555">${esc2(o.coin)} · ${esc2(net)}</p></td>
      </tr></table>
    </td></tr></table>
    <div style="border-top:2px dashed #d4d4d4;margin:18px 0 14px"></div>
    <table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr>${barcodeRow(seed)}</tr></table>
    <p style="margin:8px 0 0;text-align:center;font-family:Courier New,monospace;font-size:12px;letter-spacing:.3em;color:#555555">${esc2(seed)}</p>
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 28px 26px;font-size:12px;color:#888888;text-align:center">Keep this email as your receipt. Questions? Open a support ticket on joe.</td></tr>
</table>
</td></tr></table></body></html>`;
};

async function markPaid(o) {
  const inv = { no: "INV-" + o.ref.split("-")[1], date: new Date().toLocaleDateString("en-GB"), email: o.email, pkg: o.pkg, c: o.c, sub: o.sub_cents / 100, pct: o.pct / 100, total: o.total_cents / 100, coin: o.coin, at: new Date().toISOString() };
  await db(`orders?id=eq.${enc(o.id)}`, { method: "PATCH", body: { status: "paid", inv }, prefer: "return=minimal" });
  try { await sendMail(o.email, `Your joe invoice ${inv.no}`, invoiceHTML(o, inv)); } catch (e) { console.error("invoice email failed:", e.message); }
  return inv;
}

module.exports = { invoiceHTML, cleanSetup, barBars, links, cleanLinks, quoteAccount, newToken, orderByToken, ticketByToken, usedBefore, pricing, coinOf, cleanPricing, cleanFiles, DEFAULT_PRICING, fail, norm, valid, enc, hashPass, newSalt, randomCode, makeToken, userEmail, requireAdmin, send, db, userRow, orderRow, sendMail, unitsFor, formatUnits, quote, pickK, view, markPaid, COINS };
