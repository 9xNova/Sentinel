const { read, write } = require("../utils/storage");
const { makeEmbed, sendLog } = require("../utils/embeds");
const B = require("../utils/badwords");
const W = require("../utils/warnings");

module.exports = (client) =>
  client.on("messageCreate", (message) => {
    if (message.author.bot || !message.guild) return;

    try {
      const content = message.content || "";

      // Bad-word filter
      const matched = content ? B.check(message.guild.id, content, message.member) : null;
      if (matched) {
        message.delete().catch(() => {});
        message.channel
          .send(`${message.author}, your message contained a prohibited word and was removed.`)
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
          .catch(() => {});
        W.add(
          message.guild.id,
          message.author.id,
          message.author.tag,
          `Bad word filter: ${matched}`,
          client.user.id,
          "Sentinel"
        );
        sendLog(
          message.guild,
          "security_log_channel",
          makeEmbed(
            "Message Blocked",
            `**Member:** ${message.author.tag}\n**Word:** \`${matched}\`\n**Channel:** ${message.channel}\n**Content:** ${content.slice(0, 400)}`,
            0xE74C3C
          )
        ).catch(() => {});
        return;
      }

      const week = new Date();
      week.setUTCHours(0, 0, 0, 0);
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));

      const key = `${message.guild.id}:${message.author.id}:${week
        .toISOString()
        .slice(0, 10)}`;

      const data = read("weekly-quota.json", {});
      data[key] = (data[key] || 0) + 1;
      write("weekly-quota.json", data);
    } catch (error) {
      console.error("Failed to process message:", error);
    }
  });
