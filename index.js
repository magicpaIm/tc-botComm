const fs = require("node:fs");
const path = require("node:path");
const {
  fetchSettings,
  insertMessages,
  connectDB,
  updateGuild,
} = require("./database/dbservice.js");
const { fetchMessages, updateChannelInfo } = require("./action/export.js");

const { Client, Intents } = require("discord.js");
require("dotenv").config();
const intents = new Intents(32767);
const client = new Client({ intents });

// login to discord
const discordLogin = async () => {
  const eventsPath = path.join(__dirname, "events");
  const eventFiles = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
  await client.login(process.env.TOKEN);
};

// get required messages from discord
const fetch = async (setting) => {
  const { guildId, selectedChannels, period } = setting;
  try {
    const channels = selectedChannels.map((item) => item.channelId);
    const guild = await client.guilds.fetch(guildId);
    const date = new Date(period);
    const timeStamp = date.getTime();
    const messages = await fetchMessages(guild, null, "channels", {
      channels: channels,
      since: timeStamp,
    });
    return messages;
  } catch (e) {
    return [];
  }
};

// check the bot is connected to the guilds and update status
const checkBotStatus = async (settings) => {
  const promises = settings.map(async (setting) => {
    const { guildId } = setting;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      setting.isDisconnected = true;
      await updateGuild(guildId, setting);
    }
  });
  return await Promise.all(promises);
};

// toggle bot status when extracting and after that
const toggleExtraction = async (setting, status) => {
  const { guildId } = setting;
  setting.isInProgress = status;
  await updateGuild(guildId, setting);
};

// get guildid from command
const getGuildFromCmd = () => {
  const args = process.argv.slice(2);

  const portArg = args.find((arg) => arg.startsWith("--guild="));
  const guild = portArg ? portArg.split("=")[1] : null;
  return guild;
};

/**
 * extract messages from guild setting
 * input: npm start -- --guild=853132782821703751       -> extract messages from only one guild(853132782821703751)
 *        npm start                                     -> extract messages from all guilds
 */
const app = async () => {
  const customGuildId = getGuildFromCmd();

  // fetch all guild settings
  await discordLogin();
  await connectDB();
  // only fetch connected guilds
  const settings = await fetchSettings(customGuildId);
  await checkBotStatus(settings);
  promises = settings.map(async (setting) => {
    const { guildId, name } = setting;
    await updateChannelInfo(client, guildId);
    await toggleExtraction(setting, true);
    // fetch missed messages from discord
    const messages = await fetch(setting);
    // insert messages to the database
    const numberOfNewMessage = await insertMessages(guildId, messages);
    await toggleExtraction(setting, false);
    if (numberOfNewMessage === 0) {
      console.log("No new messages are fetched from ", name);
    } else {
      console.log(
        `Successfully stored ${numberOfNewMessage} messages from`,
        name
      );
    }
  });
  await Promise.all(promises);
  process.exit(0);
};

app();

module.exports = {
  app
}