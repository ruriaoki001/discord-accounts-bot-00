// Fix fetch for Node.js (Replit compatible)
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const db = require("./db");
const { backupDb } = require("./githubSync");

// Exchange code for access + refresh tokens
async function exchangeCode(code) {
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDIRECT_URI,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

// Refresh an expired token
async function refreshToken(refreshToken) {
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

// Get user info
async function getUserInfo(accessToken) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Fetching user info failed: ${await res.text()}`);
  return res.json();
}

// Save user to DB
function saveUser(userId, accessToken, refreshToken, expiresIn) {
  const expiresAt = Date.now() + expiresIn * 1000;
  db.prepare(`
    INSERT OR REPLACE INTO users (user_id, access_token, refresh_token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(userId, accessToken, refreshToken, expiresAt);

  console.log(`💾 Saved user ${userId} to DB`);
  backupDb(); // auto-backup after new user
}

function getAllUsers() {
  return db.prepare("SELECT * FROM users").all();
}

module.exports = { exchangeCode, refreshToken, getUserInfo, saveUser, getAllUsers };
