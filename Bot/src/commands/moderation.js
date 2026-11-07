const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendLog } = require("../utils/embeds");

function botCanManageRole(guild, role) {
  const me = guild.members.me;
  if (!me) return false;
  if (role.position >= me.roles.highest.position) return false;
  return true;
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Timeout a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      .addIntegerOption((o) => o.setName("minutes").setDescription("Timeout length in minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const m = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.timeout(i.options.getInteger("minutes") * 60000, reason);
      await sendLog(i.guild, "security_log_channel", makeEmbed("Member Timed Out", `${m} was timed out.\nReason: ${reason}`));
      return i.reply({ content: `Timed out ${m.user.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const u = i.options.getUser("member");
      const reason = i.options.getString("reason") || "No reason provided";
      await i.guild.members.ban(u, { reason });
      await sendLog(i.guild, "security_log_channel", makeEmbed("Member Banned", `${u.tag} was banned.\nReason: ${reason}`));
      return i.reply({ content: `Banned ${u.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const m = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.kick(reason);
      await sendLog(i.guild, "security_log_channel", makeEmbed("Member Kicked", `${m.user.tag} was kicked.\nReason: ${reason}`));
      return i.reply({ content: `Kicked ${m.user.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName("user_id").setDescription("User ID").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const id = i.options.getString("user_id");
      const reason = i.options.getString("reason") || "No reason provided";
      await i.guild.members.unban(id, reason);
      return i.reply({ content: `Unbanned ${id}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("infraction")
      .setDescription("Issue a staff infraction")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Staff member").setRequired(true))
      .addStringOption((o) => o.setName("punishment").setDescription("Punishment").setRequired(true).addChoices(
        { name: "Warning", value: "Warning" },
        { name: "Strike 1", value: "Strike 1" },
        { name: "Strike 2", value: "Strike 2" },
        { name: "Strike 3", value: "Strike 3" },
        { name: "Suspension", value: "Suspension" },
        { name: "Demotion", value: "Demotion" },
        { name: "Termination", value: "Termination" }
      ))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(true))
      .addStringOption((o) => o.setName("details").setDescription("Additional details").setRequired(false))
      .addStringOption((o) => o.setName("duration").setDescription("Duration (suspension only)").setRequired(false).addChoices(
        { name: "1 Hour", value: "1h" },
        { name: "6 Hours", value: "6h" },
        { name: "12 Hours", value: "12h" },
        { name: "1 Day", value: "1d" },
        { name: "3 Days", value: "3d" },
        { name: "7 Days", value: "7d" },
        { name: "30 Days", value: "30d" }
      )),
    async execute(i) {
      const { get } = require("../utils/config");
      const { create } = require("../utils/cases");
      const punishment = i.options.getString("punishment");
      const reason = i.options.getString("reason");
      const details = i.options.getString("details") || "None";
      const duration = i.options.getString("duration");

      if (punishment === "Suspension" && !duration) {
        return i.reply({ content: "You must select a duration for a suspension.", ephemeral: true });
      }
      if (punishment !== "Suspension" && duration) {
        return i.reply({ content: "A duration is only used for suspensions.", ephemeral: true });
      }

      const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!member) return i.reply({ content: "Member not found.", ephemeral: true });

      const cfg = get(i.guildId);
      const PUNISHMENT_DURATIONS = { "1h": 3600000, "6h": 21600000, "12h": 43200000, "1d": 86400000, "3d": 259200000, "7d": 604800000, "30d": 2592000000 };

      let punishmentRoleId = cfg.punishment_roles?.[punishment] || null;
      let expiresAt = null;
      let rolesToRestore = [];

      await i.deferReply({ ephemeral: true });

      if (punishment === "Suspension") {
        if (!punishmentRoleId) {
          return i.editReply({ content: "A Suspension role has not been configured. Use `/config`." });
        }
        const suspendedRole = await i.guild.roles.fetch(String(punishmentRoleId)).catch(() => null);
        if (!suspendedRole) {
          return i.editReply({ content: "The configured Suspension role no longer exists." });
        }
        expiresAt = new Date(Date.now() + PUNISHMENT_DURATIONS[duration]).toISOString();

        rolesToRestore = member.roles.cache
          .filter((r) => !r.id === i.guild.id && r.id !== suspendedRole.id && !(cfg.bot_bypass_roles || []).includes(r.id))
          .map((r) => r.id);

        const removable = member.roles.cache.filter((r) => r.id !== i.guild.id && r.id !== suspendedRole.id && botCanManageRole(i.guild, r));
        try {
          if (removable.size) await member.roles.remove([...removable.values()], "Sentinel suspension");
          await member.roles.add(suspendedRole, "Sentinel suspension");
        } catch (e) {
          return i.editReply({ content: "I couldn't apply the suspension. Check my role permissions and hierarchy." });
        }
      } else if (["Strike 1", "Strike 2", "Strike 3"].includes(punishment)) {
        if (!punishmentRoleId) {
          return i.editReply({ content: `The ${punishment} role has not been configured.` });
        }
        const role = await i.guild.roles.fetch(String(punishmentRoleId)).catch(() => null);
        if (!role || !botCanManageRole(i.guild, role)) {
          return i.editReply({ content: "I cannot manage the configured strike role." });
        }
        try {
          await member.roles.add(role, `Sentinel ${punishment}`);
        } catch (e) {
          return i.editReply({ content: "I couldn't apply the strike role." });
        }
      } else if (punishment === "Demotion") {
        const { get: getPromotionRoles } = require("../utils/config");
        // use config ladder
        const ladder = (cfg.promotion_ladder || []).map((x) => String(x.id || x.role_id || x));
        const roles = await Promise.all(ladder.map((id) => i.guild.roles.fetch(id).catch(() => null)));
        const promotionRoles = roles.filter(Boolean);
        const memberRank = [...promotionRoles].reverse().find((r) => member.roles.cache.has(r.id));
        if (!memberRank) {
          return i.editReply({ content: "This member does not have a configured promotion role." });
        }
        const idx = promotionRoles.indexOf(memberRank);
        if (idx === 0) {
          return i.editReply({ content: "This member is already at the lowest promotion rank." });
        }
        const lowerRole = promotionRoles[idx - 1];
        if (!botCanManageRole(i.guild, lowerRole)) {
          return i.editReply({ content: "I cannot manage the lower promotion role." });
        }
        try {
          await member.roles.remove(memberRank, "Sentinel demotion");
          await member.roles.add(lowerRole, "Sentinel demotion");
        } catch (e) {
          return i.editReply({ content: "I couldn't apply the demotion." });
        }
        punishmentRoleId = lowerRole.id;
        await member.send({ embeds: [makeEmbed("Staff Demotion", `You have been demoted in **${i.guild.name}**.\n**Your updated role:** ${lowerRole.name}\n**Reason:** ${reason}`, 0xE67E22)] }).catch(() => {});
      } else if (punishment === "Termination") {
        const ladder = (cfg.promotion_ladder || []).map((x) => String(x.id || x.role_id || x));
        const roles = await Promise.all(ladder.map((id) => i.guild.roles.fetch(id).catch(() => null)));
        const promotionRoles = roles.filter(Boolean);
        const toRemove = promotionRoles.filter((r) => member.roles.cache.has(r.id) && botCanManageRole(i.guild, r));
        try {
          if (toRemove.length) await member.roles.remove(toRemove, "Sentinel termination");
        } catch (e) {
          return i.editReply({ content: "I couldn't remove the member's promotion roles." });
        }
      }

      const c = create("Infraction", member, i.user, reason, details, {
        punishment,
        expires_at: expiresAt,
        punishment_role_id: punishmentRoleId,
        roles_to_restore: rolesToRestore,
      });

      const e = makeEmbed(
        "Staff Infraction",
        `**Member:** ${member}\n**Punishment:** ${punishment}\n**Issued by:** ${i.user}\n**Reason:** ${reason}\n**Details:** ${details}\n**Duration:** ${duration || "Permanent / Not required"}\n**Case ID:** \`${c.id}\``,
        0xE74C3C
      );

      await sendLog(i.guild, "infraction_log_channel", e);

      await i.editReply({ content: `Successfully issued **${punishment}** to ${member}. Case ID: \`${c.id}\`` });

      // DM
      if (punishment !== "Demotion") {
        await member.send({ embeds: [makeEmbed("Staff Infraction", `A staff infraction was issued to you in **${i.guild.name}**.\nPunishment: ${punishment}\nReason: ${reason}`, 0xE74C3C)] }).catch(() => {});
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Delete a number of messages")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),
    async execute(i) {
      const amount = i.options.getInteger("amount");
      const deleted = await i.channel.bulkDelete(amount, true).catch(() => null);
      if (!deleted) return i.reply({ content: "Failed to delete messages.", ephemeral: true });
      return i.reply({ content: `Deleted ${deleted.size} message(s).`, ephemeral: true });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("untimeout")
      .setDescription("Remove a timeout from a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const m = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!m) return i.reply({ content: "Member not found.", ephemeral: true });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.timeout(null, reason);
      await sendLog(i.guild, "security_log_channel", makeEmbed("Timeout Removed", `${m.user.tag}'s timeout was removed.\nReason: ${reason}`));
      return i.reply({ content: `Removed timeout from ${m.user.tag}.` });
    },
  },
];