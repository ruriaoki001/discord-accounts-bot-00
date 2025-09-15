const Database = require("better-sqlite3");
const fs = require("fs");

// SQLite file in project root
const dbPath = "./users.db";

// Ensure DB file exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, "");
  console.log("🗃️ Created new SQLite DB file: users.db");
}

const db = new Database(dbPath);

// Create 'users' table if it doesn't exist
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    access_token TEXT,
    refresh_token TEXT,
    expires_at INTEGER
  )
`).run();

console.log("✅ SQLite DB initialized and users table ensured.");

module.exports = db;
