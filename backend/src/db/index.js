import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config, root } from "../config/index.js";
export function openDatabase(filename = config.database) {
  if (filename !== ":memory:")
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  if (db.pragma("foreign_keys", { simple: true }) !== 1)
    throw new Error("Foreign keys unavailable");
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)",
  );
  const directory = path.join(root, "backend/migrations");
  for (const name of fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (!db.prepare("SELECT 1 FROM schema_migrations WHERE name=?").get(name)) {
      db.transaction(() => {
        db.exec(fs.readFileSync(path.join(directory, name), "utf8"));
        db.prepare("INSERT INTO schema_migrations(name) VALUES (?)").run(name);
      })();
    }
  }
  return db;
}
