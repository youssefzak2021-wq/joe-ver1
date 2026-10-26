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
};
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
  return out;
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
  inv: o.inv || null,
});
const invoiceHTML = (o, inv) => `<div style="font-family:Arial,sans-serif;color:#2b2820"><h2>joe · invoice ${inv.no}</h2>
<p>Package: ${o.pkg} · rooms ${o.c.rooms}, roles ${o.c.roles}, bots ${o.c.bots}</p>
<p>Subtotal $${inv.sub.toFixed(2)} · discount ${o.pct ? o.pct + "% (code)" : "none"} · total $${inv.total.toFixed(2)}</p>
<p>Paid in ${o.coin} on ${COINS[o.coin].net}. Status: paid.</p></div>`;
async function markPaid(o) {
  const inv = { no: "INV-" + o.ref.split("-")[1], date: new Date().toLocaleDateString("en-GB"), email: o.email, pkg: o.pkg, c: o.c, sub: o.sub_cents / 100, pct: o.pct / 100, total: o.total_cents / 100, coin: o.coin };
  await db(`orders?id=eq.${enc(o.id)}`, { method: "PATCH", body: { status: "paid", inv }, prefer: "return=minimal" });
  try { await sendMail(o.email, `Your joe invoice ${inv.no}`, invoiceHTML(o, inv)); } catch (e) { console.error("invoice email failed:", e.message); }
  return inv;
}

module.exports = { newToken, orderByToken, ticketByToken, usedBefore, pricing, coinOf, cleanPricing, cleanFiles, DEFAULT_PRICING, fail, norm, valid, enc, hashPass, newSalt, randomCode, makeToken, userEmail, requireAdmin, send, db, userRow, orderRow, sendMail, unitsFor, formatUnits, quote, pickK, view, markPaid, COINS };
