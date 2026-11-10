const { EmbedBuilder } = require("discord.js");

const colors = {
  info: 0x3B82F6,
  success: 0x10B981,
  warning: 0xF59E0B,
  danger: 0xEF4444,
  muted: 0x64748B,
  primary: 0x0F172A,
};

function makeEmbed(title, description, color = colors.primary) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "Sentinel Security Logs" });

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  else embed.setDescription(" ");

  return embed;
}

async function sendlog(guild, configkey, embed) {
  const { get } = require("./config");
  const id = get(guild.id)[configkey];
  if (!id) return false;
  const channel = await guild.channels.fetch(String(id)).catch(() => null);
  if (!channel?.isTextBased()) return false;
  await channel.send({ embeds: [embed] }).catch(() => null);
  return true;
}

module.exports = { makeEmbed, makeembed: makeEmbed, sendlog, colors };