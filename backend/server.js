import express from "express";
import cors from "cors";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

const SECRET = process.env.JWT_SECRET || "gitterbox-secret";
const app = express();
app.use(cors());
app.use(express.json());

let db = null;
let dbType = "sqlite";

async function initDatabase() {
  if (process.env.DATABASE_URL || process.env.PGHOST) {
    // PostgreSQL-Setup (Railway)
    console.log("🔄 Starte PostgreSQL-Modus...");
    const pkg = await import("pg");
    const { Client } = pkg;
    dbType = "postgres";
    db = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://postgres:HEjOFRDnldjqVJIhOrFiyWqNlQPQhFwk@postgres.railway.internal:5432/railway",
      ssl: { rejectUnauthorized: false },
    });
    await db.connect();
    console.log("✅ Verbunden mit PostgreSQL");

    // Tabellen prüfen
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS gitterboxen (
        id UUID PRIMARY KEY,
        barcode TEXT,
        title TEXT,
        createdAt TEXT,
        disposeAt TEXT,
        note TEXT,
        user_id INTEGER REFERENCES users(id)
      );
    `);

    // Admin prüfen
    const res = await db.query("SELECT * FROM users WHERE username = 'admin'");
    if (res.rows.length === 0) {
      const hash = await bcrypt.hash("admin", 10);
      await db.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
        ["admin", hash]
      );
      console.log("👑 Admin erstellt: admin / admin");
    }
  } else {
    // SQLite-Setup (lokal)
    console.log("🔄 Starte SQLite-Modus...");
    const Database = (await import("better-sqlite3")).default;

    if (!fs.existsSync("/data")) fs.mkdirSync("/data", { recursive: true });
    db = new Database("/data/gitterboxen.db");
    db.pragma("journal_mode = WAL");
    dbType = "sqlite";

    db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user'
      );
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS gitterboxen (
        id TEXT PRIMARY KEY,
        barcode TEXT,
        title TEXT,
        createdAt TEXT,
        disposeAt TEXT,
        note TEXT,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `).run();

    const existing = db.prepare("SELECT * FROM users WHERE username=?").get("admin");
    if (!existing) {
      const hash = await bcrypt.hash("admin", 10);
      db.prepare(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')"
      ).run("admin", hash);
      console.log("👑 Admin erstellt: admin / admin");
    }
  }
}

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Kein Token" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Ungültiger Token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Nur für Admins" });
  next();
}

// 🔐 Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  try {
    let user;
    if (dbType === "postgres") {
      const result = await db.query("SELECT * FROM users WHERE username=$1", [username]);
      user = result.rows[0];
    } else {
      user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
    }

    if (!user) return res.status(401).json({ error: "Benutzer nicht gefunden" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Falsches Passwort" });

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    console.error("Login-Fehler:", e);
    res.status(500).json({ error: "Login fehlgeschlagen" });
  }
});

// 👥 Benutzerverwaltung (Admin)
app.get("/api/users", verifyToken, adminOnly, async (req, res) => {
  try {
    if (dbType === "postgres") {
      const result = await db.query("SELECT id, username, role FROM users ORDER BY id ASC");
      res.json(result.rows);
    } else {
      const rows = db.prepare("SELECT id, username, role FROM users ORDER BY id ASC").all();
      res.json(rows);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/users", verifyToken, adminOnly, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username & password erforderlich" });
  const hash = await bcrypt.hash(password, 10);

  try {
    if (dbType === "postgres") {
      await db.query(
        "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
        [username, hash, role || "user"]
      );
    } else {
      db.prepare(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)"
      ).run(username, hash, role || "user");
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Benutzername bereits vergeben?" });
  }
});

app.delete("/api/users/:id", verifyToken, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id)
    return res.status(400).json({ error: "Eigenen Admin nicht löschen" });
  try {
    if (dbType === "postgres") {
      await db.query("DELETE FROM users WHERE id=$1", [id]);
    } else {
      db.prepare("DELETE FROM users WHERE id=?").run(id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 📦 Gitterboxen CRUD
app.get("/api/boxes", verifyToken, async (req, res) => {
  try {
    if (dbType === "postgres") {
      const r = await db.query("SELECT * FROM gitterboxen ORDER BY createdAt DESC");
      res.json(r.rows);
    } else {
      const items = db
        .prepare("SELECT * FROM gitterboxen ORDER BY createdAt DESC")
        .all();
      res.json(items);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/boxes", verifyToken, async (req, res) => {
  const { id, barcode, title, createdAt, disposeAt, note } = req.body || {};
  if (!id || !barcode || !title || !createdAt || !disposeAt)
    return res.status(400).json({ error: "Felder id, barcode, title, createdAt, disposeAt erforderlich" });

  try {
    if (dbType === "postgres") {
      await db.query(
        `INSERT INTO gitterboxen (id, barcode, title, createdAt, disposeAt, note, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           barcode=$2, title=$3, createdAt=$4, disposeAt=$5, note=$6, user_id=$7`,
        [id, barcode, title, createdAt, disposeAt, note || "", req.user.id]
      );
    } else {
      db.prepare(
        `INSERT OR REPLACE INTO gitterboxen
         (id, barcode, title, createdAt, disposeAt, note, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, barcode, title, createdAt, disposeAt, note || "", req.user.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/boxes/:id", verifyToken, async (req, res) => {
  try {
    if (dbType === "postgres") {
      await db.query("DELETE FROM gitterboxen WHERE id=$1", [req.params.id]);
    } else {
      db.prepare("DELETE FROM gitterboxen WHERE id=?").run(req.params.id);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 Init + Start
await initDatabase();
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT} (${dbType})`));
