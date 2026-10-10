require("dotenv").config();
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "redzone.db"));
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
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));
(async () => {
  try {
    const existing = db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n;
    if (existing) {
      console.log("An admin already exists. For safety, this setup tool will not create another one.");
      process.exitCode = 1;
      return;
    }
    const username = (await ask("Choose admin username (3-40 chars, letters/numbers/_/-): ")).trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(username)) throw new Error("Username must be 3-40 characters: letters, numbers, _ or -.");
    const password = await ask("Choose a strong password (at least 12 characters): ");
    if (password.length < 12) throw new Error("Password must be at least 12 characters.");
    const confirm = await ask("Confirm password: ");
    if (password !== confirm) throw new Error("Passwords do not match.");
    const hash = await bcrypt.hash(password, 12);
    db.prepare("INSERT INTO users (username,password_hash,role) VALUES (?,?, 'admin')").run(username, hash);
    console.log("\\nAdmin account created. Keep your password private and do not share the .env file.");
  } catch (e) {
    console.error("\\nSetup failed:", e.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    db.close();
  }
})();
