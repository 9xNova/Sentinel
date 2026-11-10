const { sendlog, makeembed, colors } = require("../utils/embeds");

function footer(guild, text) {
  return `${text} | ${guild.name}`;
}

module.exports = (client) => {
  client.on("messageDelete", (message) => {
    if (!message.guild || message.author?.bot) return;
    sendlog(
      message.guild,
      "securitylogchannel",
      makeEmbed(
        "Message Deleted",
        null,
        colors.danger
      )
        .setAuthor({
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL({ dynamic: true }),
        })
        .addFields(
          { name: "Author", value: `${message.author} (\`${message.author.id}\`)`, inline: true },
          { name: "Channel", value: message.channel.toString(), inline: true },
          { name: "Content", value: message.content || "*(no content)*", inline: false }
        )
        .setFooter({ text: footer(message.guild, "Message Deleted") })
    );
  });

  client.on("guildMemberAdd", (member) => {
    sendlog(
      member.guild,
      "securitylogchannel",
      makeEmbed(
        "Member Joined",
        null,
        colors.success
      )
        .setAuthor({
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL({ dynamic: true }),
        })
        .addFields(
          { name: "User", value: `${member.user} (\`${member.user.id}\`)`, inline: true },
          { name: "Account Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
          { name: "Member Count", value: String(member.guild.memberCount), inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: footer(member.guild, "Member Joined") })
    );
  });

  client.on("guildMemberRemove", (member) => {
    sendlog(
      member.guild,
      "securitylogchannel",
      makeEmbed(
        "Member Left",
        null,
        colors.warning
      )
        .setAuthor({
          name: member.user?.tag || "Unknown",
          iconURL: member.user.displayAvatarURL({ dynamic: true }),
        })
        .addFields(
          { name: "User", value: `${member.user} (\`${member.user.id}\`)`, inline: true },
          { name: "Member Count", value: String(member.guild.memberCount), inline: true }
        )
        .setFooter({ text: footer(member.guild, "Member Left") })
    );
  });
};