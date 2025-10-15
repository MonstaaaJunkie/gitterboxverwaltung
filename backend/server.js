import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import { signToken, verifyToken, hashPassword, comparePassword } from "./auth.js";

const SECRET = process.env.JWT_SECRET || "gitterbox-secret";
const DB_PATH = "/data/gitterboxen.db";

const app = express();
app.use(cors());
app.use(express.json());

// 🔍 Debug: prüfen ob /data existiert
if (!fs.existsSync("/data")) {
  console.error("❌ FEHLER: Verzeichnis /data existiert NICHT! Bitte Volume prüfen.");
} else {
  console.log("✅ /data-Verzeichnis gefunden.");
}

// 🔍 Debug: prüfen Schreibrechte
try {
  fs.accessSync("/data", fs.constants.W_OK);
  console.log("✅ Schreibrechte auf /data vorhanden.");
} catch {
  console.error("❌ FEHLER: Keine Schreibrechte auf /data!");
}

let db;
try {
  console.log(`📁 Öffne oder erzeuge Datenbank unter ${DB_PATH} ...`);
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  console.log("✅ Verbindung zur SQLite-Datenbank erfolgreich.");
} catch (err) {
  console.error("❌ FEHLER beim Öffnen der Datenbank:", err);
  process.exit(1);
}

try {
  await db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user'
  );
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
  `);
  console.log("✅ Tabellen geprüft/angelegt.");
} catch (err) {
  console.error("❌ FEHLER beim Erstellen der Tabellen:", err);
}

// Admin-User prüfen
try {
  const existingAdmin = await db.get("SELECT * FROM users WHERE username = ?", "admin");
  if (!existingAdmin) {
    const hash = await hashPassword("admin");
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
      "admin",
      hash
    );
    console.log("✅ Erster Admin angelegt: admin / admin");
  } else {
    console.log("ℹ️ Admin existiert bereits.");
  }
} catch (err) {
  console.error("❌ FEHLER beim Anlegen des Admin-Users:", err);
}

// Auth Middleware
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Kein Token" });
  try {
    req.user = verifyToken(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Ungültiger Token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Nur für Admins" });
  next();
}

// Auth
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = await db.get("SELECT * FROM users WHERE username = ?", username);
  if (!user) return res.status(401).json({ error: "Benutzer nicht gefunden" });
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Falsches Passwort" });
  const token = signToken(
    { id: user.id, username: user.username, role: user.role },
    SECRET
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// Users (Admin only)
app.get("/api/users", auth, adminOnly, async (req, res) => {
  const rows = await db.all("SELECT id, username, role FROM users ORDER BY id ASC");
  res.json(rows);
});

app.post("/api/users", auth, adminOnly, async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "username & password erforderlich" });
  const hash = await hashPassword(password);
  try {
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      username,
      hash,
      role || "user"
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: "Benutzername bereits vergeben?" });
  }
});

app.delete("/api/users/:id", auth, adminOnly, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id)
    return res.status(400).json({ error: "Eigenen Admin nicht löschen" });
  await db.run("DELETE FROM users WHERE id = ?", id);
  res.json({ ok: true });
});

// Gitterboxen CRUD
app.get("/api/boxes", auth, async (req, res) => {
  const items = await db.all("SELECT * FROM gitterboxen ORDER BY createdAt DESC");
  res.json(items);
});

app.post("/api/boxes", auth, async (req, res) => {
  const { id, barcode, title, createdAt, disposeAt, note } = req.body || {};
  if (!id || !barcode || !title || !createdAt || !disposeAt) {
    return res
      .status(400)
      .json({ error: "Felder id, barcode, title, createdAt, disposeAt erforderlich" });
  }
  await db.run(
    "INSERT OR REPLACE INTO gitterboxen (id, barcode, title, createdAt, disposeAt, note, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id,
    barcode,
    title,
    createdAt,
    disposeAt,
    note || "",
    req.user.id
  );
  res.json({ ok: true });
});

app.delete("/api/boxes/:id", auth, async (req, res) => {
  await db.run("DELETE FROM gitterboxen WHERE id = ?", req.params.id);
  res.json({ ok: true });
});

app.listen(5001, () =>
  console.log("🚀 Backend läuft auf Port 5001 – Überwache Logs für DB-Status.")
);
