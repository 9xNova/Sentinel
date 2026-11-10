const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendlog, colors } = require("../utils/embeds");
const s = require("../utils/security");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("discord")
      .setDescription("Discord server security management")
      .addSubcommand((s) =>
        s
          .setName("suspend")
          .setDescription("Apply the Discord Suspended role to a member")
          .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
          .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("unsuspend")
          .setDescription("Restore a member's saved roles")
          .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      ),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return i.reply({ embeds: [makeEmbed("Error", "You do not have permission to use Discord security commands.", colors.danger)], flags: flagsephemeral });
      }

      if (sub === "suspend") {
        const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
        if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
        if (member.id === i.user.id) return i.reply({ embeds: [makeEmbed("Error", "You cannot suspend yourself.", colors.danger)], flags: flagsephemeral });

        await i.deferReply({ flags: flagsephemeral });
        const result = await s.applySecuritySuspension(member, i.user, i.options.getString("reason"));
        if (!result.success) return i.editReply({ embeds: [makeEmbed("Error", result.message, colors.danger)] });

        const e = makeEmbed("Discord Security Suspension", null, colors.danger)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
            { name: "Issued by", value: `${i.user} (\`${i.user.id}\`)`, inline: true },
            { name: "Reason", value: i.options.getString("reason"), inline: false }
          );
        await sendlog(i.guild, "securitylogchannel", e);
        return i.editReply({ embeds: [makeEmbed("Suspended", result.message, colors.success)] });
      }

      if (sub === "unsuspend") {
        const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
        if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });

        await i.deferReply({ flags: flagsephemeral });
        const result = await s.restoreSecuritySuspension(member, i.user);
        if (!result.success) return i.editReply({ embeds: [makeEmbed("Error", result.message, colors.danger)] });

        const e = makeEmbed("Discord Security Unsuspension", null, colors.success)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
            { name: "Restored by", value: `${i.user} (\`${i.user.id}\`)`, inline: true },
            { name: "Result", value: result.message, inline: false }
          );
        await sendlog(i.guild, "securitylogchannel", e);
        return i.editReply({ embeds: [makeEmbed("Unsuspended", result.message, colors.success)] });
      }
    },
  },
];