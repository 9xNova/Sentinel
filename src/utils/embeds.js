const { EmbedBuilder } = require("discord.js");

function makeEmbed(title, description, color = 0x5865f2) {
  const embed = new EmbedBuilder().setColor(color).setTimestamp();
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  else embed.setDescription(" ");
  return embed;
}

async function sendLog(guild, configKey, embed) {
  const { get } = require("./config");
  const id = get(guild.id)[configKey];
  if (!id) return false;
  const channel = await guild.channels.fetch(String(id)).catch(() => null);
  if (!channel?.isTextBased()) return false;
  await channel.send({ embeds: [embed] }).catch(() => null);
  return true;
}

module.exports = { makeEmbed, sendLog };