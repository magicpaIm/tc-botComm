const { databaseService, rawInfoService, guildService, channelsService } = require("tc-dbcomm");
const mongoose = require("mongoose");
// get database address
const getDB = () => {
  const db_address = process.env.DB_ADDRESS;
  const db_user = process.env.DB_USER;
  const db_password = process.env.DB_PASSWORD;
  const database = `mongodb://${db_user}:${db_password}@${db_address}`;
  return database;
};

const connectDB = async () => {
  const database = getDB() + "/" + process.env.RnDAO;
  await mongoose.set("strictQuery", false);
  // Connect to MongoDB
  await mongoose.connect(database).then(() => {
    console.log("Connected to MongoDB!");
  });
};

// get users with id and value
const getInteractions = async (id, value) => {
  let usernames = [];
  let users = await value.users.fetch();
  users = users.forEach((user) => {
    usernames.push(`${user.username}#${user.discriminator}`);
  });
  return [usernames.toString(), id].join(",");
};

// change format of date to YYYYMMDD
const convertDateToYYYYMMDD = (date) => {
  // convert 2 digit integer
  date = new Date(date);
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// convert message to rawinfo depends on schema
const messageToRawinfo = async (m) => {
  const user_regexp = new RegExp("<@(\\d+)>", "g");
  const role_regexp = new RegExp("<@&(\\d+)>", "g");
  let reactions = [];
  m.reactions.cache.forEach((value, id) => {
    reactions.push(getInteractions(id, value));
  });

  reactions = await Promise.all(reactions);

  let users_mentions = m.content.match(user_regexp);
  let roles_mentions = m.content.match(role_regexp);
  if (users_mentions)
    users_mentions = users_mentions.map((s) => {
      const id = s.replace(/[<>@]/g, "");
      const user = m.mentions.users.get(id);
      const username = `${user.username}#${user.discriminator}`;
      m.content = m.content.replace(new RegExp(s, "g"), username);
      return username;
    });
  if (roles_mentions)
    roles_mentions = roles_mentions.map((s) => {
      const id = s.replace(/[<>@&]/g, "");
      const role = m.mentions.roles.get(id);
      const roleName = role ? `@${role.name}` : `@deleted-role`;
      m.content = m.content.replace(new RegExp(s, "g"), roleName);
      return roleName;
    });
  let reply = "";
  if (m.type === "REPLY") {
    reply = `${m.mentions?.repliedUser?.username}#${m.mentions?.repliedUser?.discriminator}`;
  }
  m.content = m.content.replace(new RegExp(",", "g"), " ");
  const isThread = m.channel.type !== "GUILD_TEXT";
  const data = {
    type: m.type,
    datetime: convertDateToYYYYMMDD(new Date(m.createdTimestamp)),
    author: `${m.author.username}#${m.author.discriminator}`,
    content: m.content,
    user_mentions: users_mentions ? users_mentions.join(",") : "",
    role_mentions: roles_mentions ? roles_mentions.join(",") : "",
    reactions: reactions,
    replied_user: reply,
    channelId: isThread ? m.channel.parentId : m.channel.id,
    messageId: m.id,
    threadId: isThread ? m.channel.id : "None",
    thread: isThread ? m.channel.name: "None",
  };
  return data;
};

// insert message data into the database and return number of messages newly added
const insertMessages = async (guildID, messages) => {
  const database = getDB();
  const connection = databaseService.connectionFactory(guildID, database);
  let countNewMessages = 0;
  const promises = messages.map(async ({ id, value: m }) => {
    const data = await messageToRawinfo(m);
    const response = await rawInfoService.createRawInfo(connection, data);
    if (response !== false) {
      countNewMessages++;
    }
  });
  await Promise.all(promises);
  await connection.close();
  return countNewMessages;
};

/**
 * fetch one or different guild settings from RnDAO server
 * @param guildId (Snowflake | null) if it is null, fetch all guild settings, otherwise fetch one guild setting by guildId
 * @return guild setting list
 */
const fetchSettings = async (guildId) => {
  const settings = await guildService.fetchGuild(guildId);
  return settings;
};

const getRange = async (guildID, channelID) => {
  const database = getDB();
  const connection = databaseService.connectionFactory(guildID, database);
  const range = await rawInfoService.getRangeId(connection, channelID);
  await connection.close();
  return range;
};

const updateChannel = async (guildId, channelId, channel) => {
  const database = getDB();
  const connection = databaseService.connectionFactory(guildId, database);
  const data = await channelsService.updateChannel(connection, channelId, channel);
  await connection.close();
  return data;
}

const updateGuild = guildService.updateGuildByGuildId;
module.exports = {
  insertMessages,
  fetchSettings,
  getRange,
  connectDB,
  updateGuild,
  updateChannel
};
