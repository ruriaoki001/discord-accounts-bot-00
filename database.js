const fs = require("fs");
const { Octokit } = require("@octokit/rest");
const Database = require("better-sqlite3");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const dbPath = "./users.db";
let db = null;

// GitHub config
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_USERNAME;
const repo = process.env.GITHUB_REPO;
const branch = "main";

// --- Database functions ---
function initDatabase() {
  // Ensure DB file exists
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "");

  // Open DB
  db = new Database(dbPath);

  // Ensure 'users' table exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER
    )
  `).run();

  console.log("✅ SQLite DB initialized and 'users' table ensured");
  return db;
}

function getDb() {
  if (!db) initDatabase();
  return db;
}

// --- User helper functions ---
function saveUser(id, access_token, refresh_token, expires_in) {
  const db = getDb();
  const expires_at = Date.now() + expires_in * 1000;
  db.prepare(
    `INSERT OR REPLACE INTO users (id, access_token, refresh_token, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, access_token, refresh_token, expires_at);
}

function getAllUsers() {
  const db = getDb();
  return db.prepare(`SELECT * FROM users`).all();
}

function removeUser(id) {
  const db = getDb();
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

async function getUserInfo(access_token) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch user info: ${res.status}`);
  return await res.json();
}

// --- GitHub sync functions ---
async function restoreDb() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_USERNAME || !process.env.GITHUB_REPO) {
    console.log("⚠️ GitHub sync not configured, initializing local DB only");
    initDatabase();
    return;
  }

  try {
    const { data: file } = await octokit.repos.getContent({
      owner,
      repo,
      path: "users.db",
      ref: branch,
    });

    const content = Buffer.from(file.content, "base64");
    fs.writeFileSync(dbPath, content);
    console.log("✅ SQLite DB restored from GitHub");
  } catch {
    console.log("📂 No DB found on GitHub, starting fresh");
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "");
  }

  // Ensure DB table exists after restore
  initDatabase();
}

// Backup users.db
async function backupDb() {
  if (!fs.existsSync(dbPath)) {
    console.log("📂 No local DB to backup");
    return;
  }

  const dbContent = fs.readFileSync(dbPath);
  let dbSha;

  try {
    const { data: file } = await octokit.repos.getContent({
      owner,
      repo,
      path: "users.db",
      ref: branch,
    });
    dbSha = file.sha;
  } catch {
    console.log("📂 users.db not found in repo, will create new one.");
  }

  try {
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: "users.db",
      message: "Auto-backup SQLite DB",
      content: dbContent.toString("base64"),
      sha: dbSha,
      branch,
    });
  } catch (err) {
    console.error("❌ Failed to back up users.db:", err);
  }
}

async function initializeSync() {
  await restoreDb();

  // Backup every 1 minute
  setInterval(backupDb, 1000 * 60 * 1);
  console.log("🔄 GitHub backup scheduled every 1 minute");
}

module.exports = {
  initDatabase,
  getDb,
  restoreDb,
  backupDb,
  initializeSync,
  saveUser,
  getAllUsers,
  removeUser,
  getUserInfo,
};
