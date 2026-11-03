// The paid invoice as an animated GIF, drawn with the ticket design of the site.
// sharp draws each frame (SVG -> pixels) and the small encoder below writes the GIF.
// sharp is loaded only when this runs, so a problem with it never affects the rest of the site.

const W = 520, H = 900, FRAMES = 14;
const clamp = v => Math.max(0, Math.min(1, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const eo = t => 1 - Math.pow(1 - t, 3);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SERIF = "'Liberation Serif', serif", SANS = "'Liberation Sans', sans-serif", MONO = "'Liberation Mono', monospace";

// one frame of the animation, p goes from 0 (start) to 1 (done)
function frameSvg(d, p) {
  const paper = eo(seg(p, 0, 0.45));
  const dy = (1 - paper) * 36;
  const check = eo(seg(p, 0.28, 0.55));
  const draw = eo(seg(p, 0.4, 0.72));
  const txt = seg(p, 0.5, 0.78);
  const grow = eo(seg(p, 0.6, 1));
  const money = n => "$" + Number(n).toFixed(2);
  const row = (y, label, value, bold) =>
    `<text x="60" y="${y}" font-family="${SANS}" font-size="${bold ? 17 : 14}" font-weight="${bold ? "bold" : "normal"}" fill="${bold ? "#111" : "#666"}">${esc(label)}</text>` +
    `<text x="460" y="${y}" text-anchor="end" font-family="${SANS}" font-size="${bold ? 17 : 14}" font-weight="${bold ? "bold" : "normal"}" fill="#111">${esc(value)}</text>`;

  let y = 270;
  let totals = row(y, "Subtotal", money(d.sub), false);
  if (d.discount) { y += 26; totals += row(y, d.discount.label, "-" + money(d.discount.amount), false); }
  y += 30; totals += row(y, "Total paid", money(d.total), true);
  y += 32; totals += row(y, "Paid with", d.coin + " · " + d.net, false);
  y += 26; totals += row(y, "Status", "Paid", false);

  const bars = d.bars, sp = 1.5;
  const total = bars.reduce((a, w) => a + w * 1.6 + sp, 0) - sp;
  let bx = 260 - total / 2;
  const rects = bars.map(w => {
    const bw = w * 1.6, bh = 34 * grow;
    const r = `<rect x="${bx.toFixed(2)}" y="${(812 - bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="#111"/>`;
    bx += bw + sp; return r;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#ececea"/>
<g opacity="${paper.toFixed(3)}" transform="translate(0 ${dy.toFixed(2)})">
  <rect x="30" y="30" width="460" height="840" rx="18" fill="#ffffff" stroke="#e4e4e4"/>
  <text x="60" y="92" font-family="${SERIF}" font-size="34" font-weight="bold" fill="#111">joe</text>
  <text x="460" y="72" text-anchor="end" font-family="${SANS}" font-size="12" letter-spacing="2" fill="#777">INVOICE</text>
  <text x="460" y="96" text-anchor="end" font-family="${SANS}" font-size="15" font-weight="bold" fill="#111">${esc(d.no)}</text>
  <text x="60" y="140" font-family="${SANS}" font-size="11" letter-spacing="1.5" fill="#777">BILLED TO</text>
  <text x="60" y="162" font-family="${SANS}" font-size="15" fill="#111">${esc(d.email)}</text>
  <text x="60" y="184" font-family="${SANS}" font-size="13" fill="#666">${esc(d.when)}</text>
  <line x1="60" y1="206" x2="460" y2="206" stroke="#e6e6e6"/>
  <text x="60" y="236" font-family="${SANS}" font-size="14" fill="#111">${esc(d.itemLabel)}</text>
  <text x="460" y="236" text-anchor="end" font-family="${SANS}" font-size="14" fill="#111">${money(d.sub)}</text>
  ${totals}
  <g opacity="${check.toFixed(3)}">
    <circle cx="260" cy="462" r="26" fill="#f0f0f0"/>
  </g>
  <path d="M249 463 L257 471 L272 455" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="50 50" stroke-dashoffset="${(50 * (1 - draw)).toFixed(2)}"/>
  <rect x="60" y="420" width="400" height="420" rx="20" fill="#ffffff" stroke="#e6e6e6"/>
  <g opacity="${check.toFixed(3)}"><circle cx="260" cy="462" r="26" fill="#f0f0f0"/></g>
  <path d="M249 463 L257 471 L272 455" fill="none" stroke="#111" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="50 50" stroke-dashoffset="${(50 * (1 - draw)).toFixed(2)}"/>
  <text x="260" y="522" text-anchor="middle" font-family="${SERIF}" font-size="22" font-weight="bold" fill="#111" opacity="${txt.toFixed(3)}">Thank you!</text>
  <text x="260" y="544" text-anchor="middle" font-family="${SANS}" font-size="13" fill="#666" opacity="${txt.toFixed(3)}">Your ticket has been issued successfully</text>
  <line x1="90" y1="566" x2="430" y2="566" stroke="#d4d4d4" stroke-width="2" stroke-dasharray="6 5"/>
  <text x="90" y="594" font-family="${SANS}" font-size="10" letter-spacing="1.5" fill="#777">TICKET ID</text>
  <text x="90" y="616" font-family="${MONO}" font-size="15" font-weight="bold" fill="#111">${esc(d.ref)}</text>
  <text x="430" y="594" text-anchor="end" font-family="${SANS}" font-size="10" letter-spacing="1.5" fill="#777">AMOUNT</text>
  <text x="430" y="620" text-anchor="end" font-family="${SERIF}" font-size="22" font-weight="bold" fill="#111">${money(d.total)}</text>
  <text x="90" y="648" font-family="${SANS}" font-size="10" letter-spacing="1.5" fill="#777">DATE &amp; TIME</text>
  <text x="90" y="668" font-family="${SANS}" font-size="14" font-weight="bold" fill="#111">${esc(d.when)}</text>
  <rect x="90" y="682" width="340" height="54" rx="14" fill="#f4f4f4"/>
  <circle cx="116" cy="709" r="17" fill="#111"/>
  <text x="116" y="715" text-anchor="middle" font-family="${SERIF}" font-size="16" font-weight="bold" fill="#ffffff">${esc(d.coinLetter)}</text>
  <text x="144" y="704" font-family="${SANS}" font-size="13" font-weight="bold" fill="#111">${esc(d.email)}</text>
  <text x="144" y="724" font-family="${MONO}" font-size="11" fill="#555">${esc(d.coin)} · ${esc(d.net)}</text>
  <line x1="90" y1="754" x2="430" y2="754" stroke="#d4d4d4" stroke-width="2" stroke-dasharray="6 5"/>
  <g opacity="${txt.toFixed(3)}">${rects}</g>
  <text x="260" y="834" text-anchor="middle" font-family="${MONO}" font-size="12" letter-spacing="4" fill="#555" opacity="${txt.toFixed(3)}">${esc(d.barText)}</text>
  <text x="260" y="858" text-anchor="middle" font-family="${SANS}" font-size="11" fill="#888">Keep this as your receipt · joe</text>
</g>
</svg>`;
}

// ---- GIF encoder (LZW + one global grey palette of 256 levels; the design is black and white)
function lzwEncode(idx, minCode = 8) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1, dict = new Map();
  const out = [];
  let buf = 0, nbits = 0;
  const put = code => {
    buf |= code << nbits; nbits += size;
    while (nbits >= 8) { out.push(buf & 0xff); buf >>>= 8; nbits -= 8; }
  };
  put(clear);
  let prefix = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    put(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      put(clear); dict = new Map(); next = eoi + 1; size = minCode + 1;
    }
    prefix = k;
  }
  put(prefix); put(eoi);
  if (nbits > 0) out.push(buf & 0xff);
  return out;
}
function encodeGif(frames, w, h, delays) {
  const bytes = [];
  const u16 = v => [v & 0xff, (v >> 8) & 0xff];
  const push = arr => { for (const b of arr) bytes.push(b); };
  push([...Buffer.from("GIF89a")]);
  push(u16(w)); push(u16(h));
  bytes.push(0xf7, 0, 0);                       // global palette, 256 entries
  for (let i = 0; i < 256; i++) bytes.push(i, i, i);
  push([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00]); // loop forever
  frames.forEach((idx, f) => {
    push([0x21, 0xf9, 0x04, 0x00]); push(u16(delays[f])); push([0x00, 0x00]);
    push([0x2c]); push(u16(0)); push(u16(0)); push(u16(w)); push(u16(h)); bytes.push(0x00);
    bytes.push(8);
    const data = lzwEncode(idx, 8);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      bytes.push(n);
      for (let j = 0; j < n; j++) bytes.push(data[i + j]);
    }
    bytes.push(0x00);
  });
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

// d: { no, ref, email, when, itemLabel, sub, discount:{label,amount}|null, total, coin, coinLetter, net, bars:[widths], barText }
// The server has no fonts of its own, so the fonts shipped in ./fonts are the only ones used.
// fontconfig reads this file the first time text is drawn, so it is written before sharp runs.
function ensureFonts() {
  if (process.env.FONTCONFIG_FILE) return;
  const fs = require("fs"), path = require("path");
  const dir = path.join(__dirname, "..", "fonts");
  fs.mkdirSync("/tmp/fontcache", { recursive: true });
  const file = "/tmp/joe-fonts.conf";
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <dir>${dir}</dir>\n  <cachedir>/tmp/fontcache</cachedir>\n</fontconfig>\n`);
  process.env.FONTCONFIG_FILE = file;
}

async function renderInvoiceGif(d) {
  ensureFonts();
  const sharp = require("sharp");
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const svg = frameSvg(d, f / (FRAMES - 1));
    const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: "#ececea" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== W || info.height !== H) throw new Error("unexpected frame size " + info.width + "x" + info.height);
    const idx = new Uint8Array(W * H);
    for (let i = 0, j = 0; i < idx.length; i++, j += 3) idx[i] = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
    frames.push(idx);
  }
  const delays = frames.map((_, i) => (i === FRAMES - 1 ? 300 : 7)); // in 1/100 s
  return Buffer.from(encodeGif(frames, W, H, delays));
}

module.exports = { renderInvoiceGif, frameSvg, encodeGif, W, H, FRAMES };
