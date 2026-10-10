require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (process.env.NODE_ENV === "production" && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("In production, set SESSION_SECRET to a random value at least 32 characters long.");
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");

const db = new Database(path.join(DATA_DIR, "redzone.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('news','game','download','article')),
  title_fa TEXT NOT NULL,
  title_en TEXT NOT NULL,
  summary_fa TEXT NOT NULL DEFAULT '',
  summary_en TEXT NOT NULL DEFAULT '',
  body_fa TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  link_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
const countAdmin = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get().n;
if (countAdmin === 0) {
  console.log("\\n[SETUP] No admin account exists yet. Stop the server and run: npm run create-admin\\n");
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));
app.use(session({
  name: "redzone.sid",
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: "sessions.db", dir: DATA_DIR }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Too many login attempts. Please wait 15 minutes."
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowed.has(file.mimetype)) return cb(new Error("Only JPG, PNG, WEBP or GIF images are allowed."));
    cb(null, true);
  }
});

function isAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === "admin") return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Admin login required." });
  return res.redirect("/admin/login");
}
function safeText(v, max = 5000) {
  return String(v ?? "").trim().slice(0, max);
}
function contentPayload(body) {
  const kind = safeText(body.kind, 20);
  if (!["news", "game", "download", "article"].includes(kind)) throw new Error("Invalid content type.");
  const title_fa = safeText(body.title_fa, 180);
  const title_en = safeText(body.title_en, 180);
  if (!title_fa || !title_en) throw new Error("Persian and English titles are required.");
  const image_url = safeText(body.image_url, 1000);
  const link_url = safeText(body.link_url, 1000);
  for (const url of [image_url, link_url]) {
    if (url && !url.startsWith("/") && !/^https?:\/\//i.test(url)) throw new Error("Links must start with / or use http(s).");
  }
  return {
    kind, title_fa, title_en,
    summary_fa: safeText(body.summary_fa, 1000),
    summary_en: safeText(body.summary_en, 1000),
    body_fa: safeText(body.body_fa, 15000),
    body_en: safeText(body.body_en, 15000),
    image_url, link_url,
    category: safeText(body.category, 80),
    published: body.published === "0" || body.published === 0 ? 0 : 1
  };
}

app.use("/uploads", express.static(UPLOAD_DIR, { fallthrough: false, maxAge: "7d" }));
app.use(express.static(path.join(ROOT, "public"), { extensions: ["html"] }));

app.get("/api/content", (req, res) => {
  const kind = safeText(req.query.kind, 20);
  const allowed = ["news", "game", "download", "article"];
  let rows;
  if (allowed.includes(kind)) {
    rows = db.prepare("SELECT id, kind, title_fa, title_en, summary_fa, summary_en, body_fa, body_en, image_url, link_url, category, created_at FROM content WHERE published=1 AND kind=? ORDER BY created_at DESC, id DESC").all(kind);
  } else {
    rows = db.prepare("SELECT id, kind, title_fa, title_en, summary_fa, summary_en, body_fa, body_en, image_url, link_url, category, created_at FROM content WHERE published=1 ORDER BY created_at DESC, id DESC").all();
  }
  res.json(rows);
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/admin/login", (_req, res) => res.sendFile(path.join(ROOT, "public", "admin", "login.html")));
app.post("/admin/login", loginLimiter, async (req, res) => {
  const username = safeText(req.body.username, 80);
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT id, username, password_hash, role FROM users WHERE username=?").get(username);
  const valid = user && await bcrypt.compare(password, user.password_hash);
  if (!valid || user.role !== "admin") {
    return res.status(401).send(loginPageError("Username or password is incorrect."));
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send("Could not create session.");
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.redirect("/admin");
  });
});
function loginPageError(message) {
  const safe = message.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Admin login</title><link rel="stylesheet" href="/admin/admin.css"><body class="login-page"><form class="login-card" method="post" action="/admin/login"><div class="brand">RED<span>ZONE</span></div><h1>Admin login</h1><p class="error">${safe}</p><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="btn">Sign in</button><a href="/">← Back to website</a></form></body></html>`;
}
app.post("/admin/logout", isAdmin, (req, res) => req.session.destroy(() => res.redirect("/admin/login")));
app.get("/admin", isAdmin, (_req, res) => res.sendFile(path.join(ROOT, "public", "admin", "index.html")));

app.get("/api/admin/me", isAdmin, (req, res) => res.json({ username: req.session.user.username }));
app.get("/api/admin/content", isAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM content ORDER BY created_at DESC, id DESC").all());
});
app.post("/api/admin/content", isAdmin, (req, res) => {
  try {
    const p = contentPayload(req.body);
    const result = db.prepare(`INSERT INTO content (kind,title_fa,title_en,summary_fa,summary_en,body_fa,body_en,image_url,link_url,category,published)
      VALUES (@kind,@title_fa,@title_en,@summary_fa,@summary_en,@body_fa,@body_en,@image_url,@link_url,@category,@published)`).run(p);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message || "Invalid content." }); }
});
app.put("/api/admin/content/:id", isAdmin, (req, res) => {
  try {
    const p = contentPayload(req.body);
    const result = db.prepare(`UPDATE content SET kind=@kind,title_fa=@title_fa,title_en=@title_en,summary_fa=@summary_fa,summary_en=@summary_en,
      body_fa=@body_fa,body_en=@body_en,image_url=@image_url,link_url=@link_url,category=@category,published=@published,updated_at=CURRENT_TIMESTAMP WHERE id=@id`).run({ ...p, id: Number(req.params.id) });
    if (!result.changes) return res.status(404).json({ error: "Content not found." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message || "Invalid content." }); }
});
app.delete("/api/admin/content/:id", isAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM content WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Content not found." });
  res.json({ ok: true });
});
app.post("/api/admin/upload", isAdmin, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    if (!req.file) return res.status(400).json({ error: "Choose an image." });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

app.use((err, _req, res, _next) => {
  console.error(err.message || err);
  if (res.headersSent) return;
  res.status(500).send("Something went wrong. Check the server console.");
});

app.listen(PORT, () => {
  console.log(`\\nREDZONE Gaming is running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin\\n`);
});
