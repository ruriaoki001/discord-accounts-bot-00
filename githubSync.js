const fs = require("fs");
const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_USERNAME || "YOUR_GITHUB_USERNAME";
const repo = process.env.GITHUB_REPO || "YOUR_REPO_NAME";
const branch = "main";

// SQLite database file in root
const localDbPath = "./users.db";
const remoteDbPath = "users.db";

async function restoreDb() {
  try {
    const { data: file } = await octokit.repos.getContent({
      owner,
      repo,
      path: remoteDbPath,
      ref: branch,
    });

    const content = Buffer.from(file.content, "base64");
    fs.writeFileSync(localDbPath, content);

    console.log("✅ SQLite DB restored from GitHub");
  } catch {
    console.log("📂 No DB found on GitHub, starting fresh");
    fs.writeFileSync(localDbPath, "");
  }
}

async function backupDb() {
  try {
    if (!fs.existsSync(localDbPath)) {
      console.log("📂 No local DB to backup");
      return;
    }

    const content = fs.readFileSync(localDbPath);
    let sha;

    try {
      const { data: file } = await octokit.repos.getContent({
        owner,
        repo,
        path: remoteDbPath,
        ref: branch,
      });
      sha = file.sha;
    } catch {
      console.log("📂 File not found in repo, will create new one.");
    }

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: remoteDbPath,
      message: "Auto-backup SQLite DB",
      content: content.toString("base64"),
      sha,
      branch,
    });

    console.log("✅ SQLite DB pushed to GitHub!");
  } catch (err) {
    console.error("❌ Backup failed:", err);
  }
}

async function initializeSync() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME && process.env.GITHUB_REPO) {
    await restoreDb();
    setInterval(backupDb, 1000 * 60 * 5);
  } else {
    console.log("⚠️ GitHub sync not configured (missing env vars)");
  }
}

module.exports = { initializeSync, backupDb, restoreDb };
