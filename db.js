const Database = require("better-sqlite3");
const fs = require("fs");

const dbPath = "./users.db";

let db;

// Function to initialize DB and ensure table exists
function initDatabase() {
  // Create DB file if missing
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "");

  // Open DB
  db = new Database(dbPath);

  // Always ensure 'users' table exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER
    )
  `).run();

  console.log("✅ SQLite DB initialized and users table ensured");
  return db;
}

// Getter for other modules
function getDb() {
  if (!db) initDatabase();
  return db;
}

module.exports = { initDatabase, getDb };
