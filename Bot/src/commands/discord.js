const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendLog } = require("../utils/embeds");
const S = require("../utils/security");

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("discord")
      .setDescription("Discord server security management")
      .addSubcommand((s) => s.setName("suspend").setDescription("Apply the Discord Suspended role to a member")
        .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
        .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true)))
      .addSubcommand((s) => s.setName("unsuspend").setDescription("Restore a member's saved roles")
        .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (!i.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return i.reply({ content: "You do not have permission to use Discord security commands.", ephemeral: true });
      }

      if (sub === "suspend") {
        const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
        if (!member) return i.reply({ content: "Member not found.", ephemeral: true });
        if (member.id === i.user.id) return i.reply({ content: "You cannot suspend yourself.", ephemeral: true });

        await i.deferReply({ ephemeral: true });
        const result = await S.applySecuritySuspension(member, i.user, i.options.getString("reason"));
        if (!result.success) return i.editReply({ content: result.message });

        const e = makeEmbed("Discord Security Suspension", `**Member:** ${member}\n**Issued by:** ${i.user}\n**Reason:** ${i.options.getString("reason")}`, 0xE74C3C);
        await sendLog(i.guild, "security_log_channel", e);
        return i.editReply({ content: result.message });
      }

      if (sub === "unsuspend") {
        const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
        if (!member) return i.reply({ content: "Member not found.", ephemeral: true });

        await i.deferReply({ ephemeral: true });
        const result = await S.restoreSecuritySuspension(member, i.user);
        if (!result.success) return i.editReply({ content: result.message });

        const e = makeEmbed("Discord Security Unsuspension", `**Member:** ${member}\n**Restored by:** ${i.user}\n**Result:** ${result.message}`, 0x2ECC71);
        await sendLog(i.guild, "security_log_channel", e);
        return i.editReply({ content: result.message });
      }
    },
  },
];