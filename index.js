require("dotenv").config();
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { initializeSync } = require("./database");
const {
  exchangeCode,
  getUserInfo,
  saveUser,
  getAllUsers,
  refreshToken,
  removeUser,
} = require("./auth");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();

// --- Discord Bot ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.User, Partials.GuildMember],
});

// --- Role IDs ---
const ROLE_IDS = {
  bronze: "1417374172719349813",
  silver: "1417374180889858143",
  gold: "1417374186057240637",
  platinum: "1417374190016663623",
  diamond: "1417374196488736839",
  admin: "1417683553222918176",
  statusCodeRole: "1417374467168145469",
};

// --- Start Bot after DB & GitHub restore ---
(async () => {
  await initializeSync();
  console.log("🔄 GitHub sync initialized, DB ready");

  client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
  });

  client.login(process.env.BOT_TOKEN);
})();

// --- Presence / Status Tracking ---
client.on("presenceUpdate", async (oldPresence, newPresence) => {
  try {
    if (!newPresence || !newPresence.member) return;

    const member = newPresence.member;
    const activities = newPresence.activities || [];
    const customStatus = activities.find((a) => a.type === 4);
    const statusText = customStatus?.state || "";

    const hasCode = statusText.includes("ZeSxSwH95d");
    const role = newPresence.guild.roles.cache.get(ROLE_IDS.statusCodeRole);

    if (!role) {
      console.error("❌ Status role not found in guild!");
      return;
    }

    if (hasCode && !member.roles.cache.has(role.id)) {
      await member.roles.add(role);
      console.log(`✅ Added status role to ${member.user.tag}`);
    } else if (!hasCode && member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      console.log(`❌ Removed status role from ${member.user.tag}`);
    }
  } catch (err) {
    console.error("❌ Error in presenceUpdate handler:", err);
  }
});

// --- Commands ---
client.on("messageCreate", async (message) => {
  // --- !inv command ---
  if (message.content === "!inv") {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${
      process.env.CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
      process.env.REDIRECT_URI
    )}&response_type=code&scope=identify%20guilds.join`;

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

  // --- !dstock command ---
  if (message.content === "!dstock") {
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.roles.cache.has(ROLE_IDS.admin)) {
      return message.reply("❌ You don’t have permission to use this command.");
    }

    const allUsers = getAllUsers();
    const embed = new EmbedBuilder()
      .setTitle("📦 Stock Report")
      .setDescription(`Total available authorized users: **${allUsers.length}**`)
      .setColor(0x00ff99);

    return message.reply({ embeds: [embed] });
  }

  // --- !djoin command ---
  if (!message.content.startsWith("!djoin")) return;
  if (message.channel.id !== "1413408778044309554")
    return message.reply(
      `This command can only be used in <#1413408778044309554>`
    );

  const args = message.content.split(" ");
  const guildId = args[1];
  if (!guildId) return message.reply("❌ Provide a guild ID.");

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return message.reply("❌ Bot is not in that guild.");

  const member = await message.guild.members.fetch(message.author.id);
  const userRoles = member.roles.cache.map((r) => r.id);

  let membersToAdd = 0;
  if (userRoles.includes(ROLE_IDS.admin)) {
    membersToAdd = "ALL";
  } else if (
    userRoles.includes(ROLE_IDS.bronze) ||
    userRoles.includes(ROLE_IDS.statusCodeRole)
  ) {
    membersToAdd = 4;
  } else if (userRoles.includes(ROLE_IDS.silver)) {
    membersToAdd = 10;
  } else if (userRoles.includes(ROLE_IDS.gold)) {
    membersToAdd = 15;
  } else if (userRoles.includes(ROLE_IDS.platinum)) {
    membersToAdd = 25;
  } else if (userRoles.includes(ROLE_IDS.diamond)) {
    membersToAdd = 30;
  } else {
    return message.reply("❌ You don’t have a valid role to use this command.");
  }

  const allUsers = getAllUsers();
  let users = [];

  if (membersToAdd === "ALL") {
    users = allUsers;
  } else {
    users = allUsers.sort(() => 0.5 - Math.random()).slice(0, membersToAdd);
  }

  console.log(`⚡ Adding ${users.length} users to guild ${guildId}`);

  let successCount = 0;
  let failCount = 0;

  for (const u of users) {
    let accessToken = u.access_token;

    if (Date.now() >= u.expires_at) {
      try {
        const tokens = await refreshToken(u.refresh_token);
        accessToken = tokens.access_token;
        saveUser(
          u.id,
          tokens.access_token,
          tokens.refresh_token,
          tokens.expires_in
        );
      } catch (err) {
        console.error(`❌ Failed to refresh token for ${u.id}`, err);
        removeUser(u.id); // 🔴 remove from DB if refresh fails
        failCount++;
        continue;
      }
    }

    try {
      const res = await fetch(
        `https://discord.com/api/guilds/${guildId}/members/${u.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${process.env.BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ access_token: accessToken }),
        }
      );

      if (res.ok) {
        console.log(`✅ Added user ${u.id} to guild ${guildId}`);
        successCount++;
      } else {
        console.error(`❌ Failed to add ${u.id}: ${res.status}`);
        removeUser(u.id); // 🔴 remove invalid user
        failCount++;
      }
    } catch (err) {
      console.error(`❌ Error adding ${u.id}:`, err);
      removeUser(u.id); // 🔴 remove invalid user
      failCount++;
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  const embed = new EmbedBuilder()
    .setTitle("👥 Adding Members Report")
    .addFields(
      { name: "Total Attempted", value: `${users.length}`, inline: true },
      { name: "✅ Successful", value: `${successCount}`, inline: true },
      { name: "❌ Failed (removed)", value: `${failCount}`, inline: true },
      { name: "Server ID", value: guildId, inline: true }
    )
    .setColor(0xffcc00)
    .setFooter({ text: "Powered by Mr. Vultorex" });

  message.reply({ embeds: [embed] });
});

// --- Express Routes ---
app.get("/", (req, res) => {
  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${
    process.env.CLIENT_ID
  }&redirect_uri=${encodeURIComponent(
    process.env.REDIRECT_URI
  )}&response_type=code&scope=identify%20guilds.join`;
  res.send(
    `<h1>Authorize Bot</h1><a href="${oauthUrl}">Login with Discord</a>`
  );
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("❌ No code provided.");

  try {
    const tokens = await exchangeCode(code);
    const user = await getUserInfo(tokens.access_token);

    saveUser(user.id, tokens.access_token, tokens.refresh_token, tokens.expires_in);

    console.log(`✅ User authorized: ${user.username}#${user.discriminator} (${user.id})`);

    const channelId = "1417345946874019890";
    const channel = client.channels.cache.get(channelId);
    if (channel) {
      channel.send(`✅ **${user.username}** just authorized the bot!`);
    }

    res.send(`<h2>✅ Authorized ${user.username}#${user.discriminator}</h2>`);
  } catch (err) {
    console.error("❌ Authorization error:", err);
    res.status(500).send("❌ Error during authorization.");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🌍 Server running on http://localhost:${process.env.PORT}`);
});
