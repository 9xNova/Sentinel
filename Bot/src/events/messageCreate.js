const { read, write } = require("../utils/storage");
const { makeEmbed, sendlog, colors } = require("../utils/embeds");
const b = require("../utils/badwords");
const w = require("../utils/warnings");
const h = require("../utils/honeypot");

module.exports = (client) =>
  client.on("messageCreate", (message) => {
    if (message.author.bot || !message.guild) return;

    (async () => {
      try {
        const content = message.content || "";

        if (h.ishoneypotchannel(message.guild.id, message.channel.id) && !h.isstaffmember(message.member)) {
          await message.delete().catch(() => {});
          await h.trigger(message.guild, message.member, message.channel, content);
          return;
        }

        const matched = content ? b.check(message.guild.id, content, message.member) : null;
        if (matched) {
          await message.delete().catch(() => {});
          await message.channel
            .send(`${message.author}, your message contained a prohibited word and was removed.`)
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
            .catch(() => {});
          w.add(
            message.guild.id,
            message.author.id,
            message.author.tag,
            `Bad word filter: ${matched}`,
            client.user.id,
            "Sentinel"
          );
          await sendlog(
            message.guild,
            "securitylogchannel",
            makeEmbed("Message Blocked", null, colors.danger)
              .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL({ dynamic: true }),
              })
              .addFields(
                { name: "Member", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
                { name: "Word", value: `\`${matched}\``, inline: true },
                { name: "Channel", value: message.channel.toString(), inline: true },
                { name: "Content", value: content.slice(0, 400) || "*(empty)*", inline: false }
              )
              .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
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
        error("Failed to process message:", error);
      }
    })();
  });