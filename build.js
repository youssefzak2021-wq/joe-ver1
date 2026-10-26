// Copies the site into public/ and switches the page to live mode (talks to /api).
const fs = require("fs");
fs.mkdirSync("public", { recursive: true });
const html = fs.readFileSync("joe.html", "utf8");
if (!html.includes("const LIVE=false;")) throw new Error("LIVE flag not found in joe.html");
fs.writeFileSync("public/index.html", html.replace("const LIVE=false;", "const LIVE=true;"));
fs.copyFileSync("admin.html", "public/admin.html");
console.log("built public/ (index.html, admin.html)");
