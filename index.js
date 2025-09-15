require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { initializeSync } = require("./database");
const { exchangeCode, getUserInfo, saveUser, getAllUsers, refreshToken } = require("./auth");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();

// --- Discord Bot ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --- Start Bot after DB & GitHub restore ---
(async () => {
  await initializeSync(); // restores DB, ensures 'users' table exists, schedules backup
  console.log("🔄 GitHub sync initialized, DB ready");

  client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
  });

  client.login(process.env.BOT_TOKEN);
})();

// --- Admin command: !join <guild_id> & !inv ---
client.on("messageCreate", async (message) => {
  // --- !inv command ---
  if (message.content === "!inv") {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;

    const embed = new EmbedBuilder()
      .setTitle("🔗 Authorize Bot Access")
      .setDescription("Click the button below to authorize the application")
      .setColor(0x5865f2);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Authorize with Discord")
        .setURL(authUrl)
        .setStyle(ButtonStyle.Link)
    );

    await message.reply({ embeds: [embed], components: [row] });
  }

  // --- !join command ---
  if (!message.content.startsWith("!join")) return;
  if (message.author.id !== process.env.ADMIN_ID) return message.reply("❌ You are not authorized.");

  const args = message.content.split(" ");
  const guildId = args[1];
  if (!guildId) return message.reply("❌ Provide a guild ID.");

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return message.reply("❌ Bot is not in that guild.");

  const users = getAllUsers();
  console.log(`⚡ Adding ${users.length} users to guild ${guildId}`);

  for (const u of users) {
    let accessToken = u.access_token;

    // Refresh if expired
    if (Date.now() >= u.expires_at) {
      try {
        const tokens = await refreshToken(u.refresh_token);
        accessToken = tokens.access_token;
        saveUser(u.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);
      } catch (err) {
        console.error(`❌ Failed to refresh token for ${u.id}`, err);
        continue;
      }
    }

    try {
      await fetch(`https://discord.com/api/guilds/${guildId}/members/${u.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${process.env.BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
      console.log(`✅ Added user ${u.id} to guild ${guildId}`);
    } catch (err) {
      console.error(`❌ Failed to add ${u.id}:`, err);
    }

    await new Promise((r) => setTimeout(r, 3000)); // avoid rate limit
  }

  message.reply(`✅ Attempted to add ${users.length} users to guild ${guildId}`);
});

// --- Express Routes ---
app.get("/", (req, res) => {
  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;
  res.send(`<h1>Authorize Bot</h1><a href="${oauthUrl}">Login with Discord</a>`);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("❌ No code provided.");

  try {
    const tokens = await exchangeCode(code);
    const user = await getUserInfo(tokens.access_token);

    saveUser(user.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    console.log(`✅ User authorized: ${user.username}#${user.discriminator} (${user.id})`);
    res.send(`<h2>✅ Authorized ${user.username}#${user.discriminator}</h2>`);
  } catch (err) {
    console.error("❌ Authorization error:", err);
    res.status(500).send("❌ Error during authorization.");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🌍 Server running on http://localhost:${process.env.PORT}`);
});
