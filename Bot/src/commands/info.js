const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { makeEmbed, colors } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
    async execute(i) {
      const sent = await i.reply({ embeds: [makeEmbed("Pinging...", null, colors.accent)], fetchReply: true });
      const latency = sent.createdTimestamp - i.createdTimestamp;
      return i.editReply({ embeds: [makeEmbed("Pong!", `Round-trip: ${latency}ms | API: ${Math.round(i.client.ws.ping)}ms`, colors.success)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName("serverinfo").setDescription("Show server information"),
    async execute(i) {
      const g = i.guild;
      const e = new EmbedBuilder()
        .setColor(colors.primary)
        .setTitle(g.name)
        .setThumbnail(g.iconURL({ dynamic: true }))
        .addFields(
          { name: "Members", value: String(g.memberCount), inline: true },
          { name: "Channels", value: String(g.channels.cache.size), inline: true },
          { name: "Roles", value: String(g.roles.cache.size), inline: true },
          { name: "Owner", value: `<@${g.ownerId}>`, inline: true },
          { name: "Created", value: `<t:${Math.floor(g.createdTimestamp / 1000)}:F>`, inline: true }
        )
        .setTimestamp();
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("userinfo")
      .setDescription("Show user information")
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(false)),
    async execute(i) {
      const user = i.options.getUser("member") || i.user;
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const e = new EmbedBuilder()
        .setColor(colors.primary)
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "ID", value: user.id, inline: true },
          { name: "Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true }
        );
      if (member) {
        e.addFields(
          { name: "Joined", value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: true },
          { name: "Roles", value: member.roles.cache.map((r) => r.name).filter((n) => n !== "@everyone").join(", ") || "None", inline: false }
        );
      }
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("avatar")
      .setDescription("Show a user's avatar")
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(false)),
    async execute(i) {
      const user = i.options.getUser("member") || i.user;
      return i.reply({ embeds: [new EmbedBuilder().setColor(colors.primary).setTitle("Avatar").setImage(user.displayAvatarURL({ dynamic: true, size: 1024 })).setTimestamp()] });
    },
  },
  {
    data: new SlashCommandBuilder().setName("membercount").setDescription("Show member count"),
    async execute(i) {
      return i.reply({ embeds: [makeEmbed("Member Count", `This server has ${i.guild.memberCount} members.`, colors.primary)], flags: flagsephemeral });
    },
  },
];