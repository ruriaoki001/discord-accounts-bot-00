const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dbPath = "./data/users.db";

// Ensure data folder exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Create users table
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )
`).run();

module.exports = db;
