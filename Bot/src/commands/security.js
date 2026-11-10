const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendlog, colors } = require("../utils/embeds");
const s = require("../utils/security");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("security")
      .setDescription("Manage the server security system")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((s) =>
        s
          .setName("suspend")
          .setDescription("Security-suspend a member (strips roles, adds suspended role)")
          .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
          .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("unsuspend")
          .setDescription("Restore a security-suspended member's roles")
          .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      )
      .addSubcommand((s) => s.setName("view").setDescription("View active security suspensions")),
    async execute(i) {
      const sub = i.options.getSubcommand();

      if (sub === "suspend") {
        const member = await i.guild.members
          .fetch(i.options.getUser("member").id)
          .catch(() => null);
        if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
        const reason = i.options.getString("reason");
        const result = await s.applySecuritySuspension(member, i.user, reason);
        if (!result.success) return i.reply({ embeds: [makeEmbed("Error", result.message, colors.danger)], flags: flagsephemeral });
        await sendlog(
          i.guild,
          "securitylogchannel",
          makeEmbed("Security Suspension", null, colors.danger)
            .setAuthor({
              name: i.user.tag,
              iconURL: i.user.displayAvatarURL({ dynamic: true }),
            })
            .addFields(
              { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
              { name: "Reason", value: reason, inline: false },
              { name: "By", value: `${i.user} (\`${i.user.id}\`)`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        ).catch(() => {});
        return i.reply({ embeds: [makeEmbed("Security Suspended", `Security-suspended ${member.user.tag}.`, colors.success)], flags: flagsephemeral });
      }

      if (sub === "unsuspend") {
        const member = await i.guild.members
          .fetch(i.options.getUser("member").id)
          .catch(() => null);
        if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
        const result = await s.restoreSecuritySuspension(member, i.user.tag);
        if (!result.success) return i.reply({ embeds: [makeEmbed("Error", result.message, colors.danger)], flags: flagsephemeral });
        await sendlog(
          i.guild,
          "securitylogchannel",
          makeEmbed("Security Unsuspension", null, colors.success)
            .setAuthor({
              name: i.user.tag,
              iconURL: i.user.displayAvatarURL({ dynamic: true }),
            })
            .addFields(
              { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
              { name: "By", value: `${i.user} (\`${i.user.id}\`)`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        ).catch(() => {});
        return i.reply({ embeds: [makeEmbed("Security Restored", `Restored ${member.user.tag}.`, colors.success)], flags: flagsephemeral });
      }

      if (sub === "view") {
        const data = s.load();
        const entries = Object.entries(data[String(i.guildid)] || {});
        if (!entries.length) {
          return i.reply({ embeds: [makeEmbed("Security Suspensions", "No active security suspensions.", colors.primary)], flags: flagsephemeral });
        }
        const lines = entries.map(([uid, rec]) => {
          const m = i.guild.members.cache.get(uid);
          return `• ${m ? m.user.tag : uid} - \`${rec.reason}\` (\`${new Date(rec.createdat).toLocaleDateString()}\`)`;
        });
        return i.reply({
          embeds: [makeEmbed("Active Security Suspensions", lines.join("\n"), colors.primary)],
          flags: flagsephemeral,
        });
      }
    },
  },
];