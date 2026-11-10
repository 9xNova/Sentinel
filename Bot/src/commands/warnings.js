const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendlog, colors } = require("../utils/embeds");
const w = require("../utils/warnings");

const flagsephemeral = 1 << 6;

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
      if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
      const reason = i.options.getString("reason");
      const wwarn = w.add(i.guildid, member.id, member.user.tag, reason, i.user.id, i.user.tag);
      const count = w.forUser(i.guildid, member.id).length;
      const e = makeEmbed(
        "Member Warned",
        null,
        colors.warning
      )
        .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
        .addFields(
          { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
          { name: "Reason", value: reason, inline: false },
          { name: "Total Warnings", value: String(count), inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
      await sendlog(i.guild, "securitylogchannel", e);
      await member.send({ embeds: [makeEmbed("Warning", `You were warned in **${i.guild.name}**.\nReason: ${reason}`, colors.warning)] }).catch(() => {});
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
      const rows = w.forUser(i.guildid, user.id);
      const e = makeEmbed(
        `Warnings - ${user.tag}`,
        rows.length
          ? rows.map((x) => `**#${x.id}** - ${x.reason} (by ${x.moderatortag}, <t:${Math.floor(new Date(x.createdat).getTime() / 1000)}:R>)`).join("\n")
          : "No warnings found.",
        colors.primary
      );
      return i.reply({ embeds: [e], flags: flagsephemeral });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("unwarn")
      .setDescription("Remove a warning by ID")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName("warningid").setDescription("Warning ID").setRequired(true)),
    async execute(i) {
      const id = i.options.getInteger("warningid");
      const removed = w.remove(id, i.guildid);
      if (!removed) return i.reply({ embeds: [makeEmbed("Error", "Warning not found.", colors.danger)], flags: flagsephemeral });
      return i.reply({ embeds: [makeEmbed("Warning Removed", `Removed warning #${id} from ${removed.usertag}.`, colors.success)], flags: flagsephemeral });
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
      const count = w.removeAll(i.guildid, user.id);
      return i.reply({ embeds: [makeEmbed("Warnings Cleared", `Cleared ${count} warning(s) for ${user.tag}.`, colors.success)], flags: flagsephemeral });
    },
  },
];