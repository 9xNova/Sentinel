const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { makeEmbed, sendLog } = require("../utils/embeds");
const W = require("../utils/warnings");

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Warn a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)),
    async execute(i) {
      const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!member) return i.reply({ content: "Member not found.", ephemeral: true });
      const reason = i.options.getString("reason");
      const w = W.add(i.guildId, member.id, member.user.tag, reason, i.user.id, i.user.tag);
      const count = W.forUser(i.guildId, member.id).length;
      const e = makeEmbed(
        "Member Warned",
        `${member} was warned.\n**Reason:** ${reason}\n**Total warnings:** ${count}`
      );
      await sendLog(i.guild, "security_log_channel", e);
      await member.send(`You were warned in **${i.guild.name}**.\nReason: ${reason}`).catch(() => {});
      return i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("warnings")
      .setDescription("View a member's warnings")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)),
    async execute(i) {
      const user = i.options.getUser("member");
      const rows = W.forUser(i.guildId, user.id);
      const e = makeEmbed(
        `Warnings — ${user.tag}`,
        rows.length
          ? rows.map((x) => `**#${x.id}** — ${x.reason} (by ${x.moderatorTag}, <t:${Math.floor(new Date(x.createdAt).getTime() / 1000)}:R>)`).join("\n")
          : "No warnings found."
      );
      return i.reply({ embeds: [e], ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("unwarn")
      .setDescription("Remove a warning by ID")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName("warning_id").setDescription("Warning ID").setRequired(true)),
    async execute(i) {
      const id = i.options.getInteger("warning_id");
      const removed = W.remove(id, i.guildId);
      if (!removed) return i.reply({ content: "Warning not found.", ephemeral: true });
      return i.reply({ content: `Removed warning #${id} from ${removed.userTag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("clearwarnings")
      .setDescription("Clear all warnings for a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true)),
    async execute(i) {
      const user = i.options.getUser("member");
      const count = W.removeAll(i.guildId, user.id);
      return i.reply({ content: `Cleared ${count} warning(s) for ${user.tag}.` });
    },
  },
];