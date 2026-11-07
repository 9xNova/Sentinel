const { sendLog, makeEmbed } = require("../utils/embeds");

module.exports = (client) => {
  client.on("messageDelete", (message) => {
    if (!message.guild || message.author?.bot) return;
    sendLog(
      message.guild,
      "security_log_channel",
      makeEmbed("Message Deleted", `**Author:** ${message.author?.tag || "Unknown"}\n**Channel:** ${message.channel}\n**Content:** ${message.content || "(none)"}`)
    );
  });

  client.on("guildMemberAdd", (member) => {
    sendLog(
      member.guild,
      "security_log_channel",
      makeEmbed("Member Joined", `${member.user.tag} (${member.id}) joined the server.`)
    );
  });

  client.on("guildMemberRemove", (member) => {
    sendLog(
      member.guild,
      "security_log_channel",
      makeEmbed("Member Left", `${member.user?.tag || member.id} left the server.`)
    );
  });
};