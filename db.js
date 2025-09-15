const Database = require("better-sqlite3");

// Store DB in root
const db = new Database("./users.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )
`).run();

module.exports = db;
