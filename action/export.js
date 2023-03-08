const { getRange, updateChannel, connectDB } = require("../database/dbservice.js");

/**
 * @dev fetch messages by filter
 * @param guild discord guild
 * @param channel current channel
 * @param type message type. can be an element of ["channels", "date"]
 * @param limit limit fetching messages
 * @param since filtering param by date
 * @param channels filtering param by channel
 * @return messages
 */
const fetchMessages = async (
  guild,
  channel,
  type,
  { since = null, channels = null } = {}
) => {
  let sum_messages = []; // for collecting messages
  if (type === "channels") {
    const channelList = channels;
    // iterate all channels
    const promises = guild.channels.cache.map(async (channel) => {
      const channelId = channel.id;
      if (
        channel.type === "GUILD_TEXT" &&
        (channels == null || channelList.includes(channelId))
      ) {
        try {
          //fetch all messages from the channel
          const messages = await fetchMessages(guild, channel, "date", {
            since: since,
          });
          sum_messages.push(...messages);
          const threads = channel.threads.cache;
          // iterate all threads
          const threadPromises = threads.map(async (thread) => {
            // fetch messages from thread
            const messages = await fetchMessages(guild, thread, "date", {
              since: since,
            });
            sum_messages.push(...messages);
          });
          await Promise.all(threadPromises);
        } catch (e) {
          console.log(e);
        }
      }
    });
    await Promise.all(promises);
    return sum_messages;
  }
  const channelId = channel.id;
  const storedIdRange = await getRange(guild, channelId);
  const [before, after] = [
    storedIdRange[0]?.messageId,
    storedIdRange[1]?.messageId,
  ];
  // extract recent messages from one channel
  let last_id = after;
  while (true && after != null) {
    const options = { limit: 100 };
    if (last_id) {
      options.after = last_id;
    }
    let messages = [];
    try {
      const messagesMap = await channel.messages.fetch(options);
      messages = Array.from(messagesMap, ([id, value]) => ({ id, value }));
    } catch (e) {}
    if (messages.length === 0) break;
    sum_messages.push(...messages);
    last_id = messages[0].id;
  }
  last_id = before;
  // extract old messages from one channel
  while (true) {
    // split for number of messages to fetch with limit
    const options = { limit: 100 };
    if (last_id) {
      options.before = last_id;
    }
    let messages = [];
    try {
      const messagesMap = await channel.messages.fetch(options);
      messages = Array.from(messagesMap, ([id, value]) => ({ id, value }));
    } catch (e) {}
    if (messages.length === 0) return sum_messages;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].value.createdTimestamp < since) {
        sum_messages.push(...messages.slice(0, i));
        return sum_messages;
      }
    }
    sum_messages.push(...messages);
    last_id = messages[messages.length - 1].id;
  }
};

/**
 * @dev send dm to user
 * @param client discord client
 * @param userId id of target user
 * @param message message to be sent
 */
const sendDMtoUser = async (client, userId, message) => {
  try {
    const targetUser = await client.users.fetch(userId);
    console.log(targetUser);
    targetUser
      .send(message)
      .then(() => {
        console.log(
          `Message Sent to ${targetUser.username}#${targetUser.discriminator}`
        );
      })
      .catch((e) => {
        throw e;
      });
  } catch (e) {
    console.log("Can't DM to user", e);
  }
};


/**
 * @dev send dm to user
 * @param client discord client
 * @param guildId id of guild
 */
const updateChannelInfo = async (client, guildId) => {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const channels = guild.channels.cache.filter((channel) => channel.type === "GUILD_TEXT");

      channels.map(async (channel) => {
        const {id, name} = channel;
        await updateChannel(guildId, id, name);
      });
    }
  } catch (e) {
    console.log("Error in updating channel info", e);
  }
};

module.exports = {
  fetchMessages,
  sendDMtoUser,
  updateChannelInfo
};
