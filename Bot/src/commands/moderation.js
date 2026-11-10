const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendlog, colors } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

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
      if (!m) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.timeout(i.options.getInteger("minutes") * 60000, reason);
      await sendlog(
        i.guild,
        "securitylogchannel",
        makeEmbed("Member Timed Out", null, colors.warning)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${m} (\`${m.id}\`)`, inline: true },
            { name: "Duration", value: `${i.options.getInteger("minutes")} minutes`, inline: true },
            { name: "Reason", value: reason, inline: false }
          )
      );
      return i.reply({ embeds: [makeEmbed("Member Timed Out", `Timed out ${m.user.tag}.`, colors.success)], flags: flagsephemeral });
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
      await sendlog(
        i.guild,
        "securitylogchannel",
        makeEmbed("Member Banned", null, colors.danger)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "User", value: `${u.tag} (\`${u.id}\`)`, inline: true },
            { name: "Reason", value: reason, inline: false }
          )
      );
      return i.reply({ embeds: [makeEmbed("Member Banned", `Banned ${u.tag}.`, colors.success)], flags: flagsephemeral });
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
      if (!m) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.kick(reason);
      await sendlog(
        i.guild,
        "securitylogchannel",
        makeEmbed("Member Kicked", null, colors.warning)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${m.user.tag} (\`${m.id}\`)`, inline: true },
            { name: "Reason", value: reason, inline: false }
          )
      );
      return i.reply({ embeds: [makeEmbed("Member Kicked", `Kicked ${m.user.tag}.`, colors.success)], flags: flagsephemeral });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName("userid").setDescription("User ID").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false)),
    async execute(i) {
      const id = i.options.getString("userid");
      const reason = i.options.getString("reason") || "No reason provided";
      await i.guild.members.unban(id, reason);
      return i.reply({ embeds: [makeEmbed("Member Unbanned", `Unbanned ${id}.`, colors.success)], flags: flagsephemeral });
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
        return i.reply({ embeds: [makeEmbed("Error", "You must select a duration for a suspension.", colors.danger)], flags: flagsephemeral });
      }
      if (punishment !== "Suspension" && duration) {
        return i.reply({ embeds: [makeEmbed("Error", "A duration is only used for suspensions.", colors.danger)], flags: flagsephemeral });
      }

      const member = await i.guild.members.fetch(i.options.getUser("member").id).catch(() => null);
      if (!member) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });

      const cfg = get(i.guildId);
      const punishmentdurations = { "1h": 3600000, "6h": 21600000, "12h": 43200000, "1d": 86400000, "3d": 259200000, "7d": 604800000, "30d": 2592000000 };

      let punishmentroleid = cfg.punishmentroles?.[punishment] || null;
      let expiresat = null;
      let rolestorerestore = [];

      await i.deferReply({ flags: flagsephemeral });

      if (punishment === "Suspension") {
        if (!punishmentroleid) {
          return i.editReply({ embeds: [makeEmbed("Error", "A Suspension role has not been configured. Use `/setup`.", colors.danger)] });
        }
        const suspendedRole = await i.guild.roles.fetch(String(punishmentroleid)).catch(() => null);
        if (!suspendedRole) {
          return i.editReply({ embeds: [makeEmbed("Error", "The configured Suspension role no longer exists.", colors.danger)] });
        }
        expiresat = new Date(Date.now() + punishmentdurations[duration]).toISOString();

        rolestorerestore = member.roles.cache
          .filter((r) => r.id !== i.guild.id && r.id !== suspendedRole.id && !(cfg.botbypassroles || []).includes(r.id))
          .map((r) => r.id);

        const removable = member.roles.cache.filter((r) => r.id !== i.guild.id && r.id !== suspendedRole.id && botCanManageRole(i.guild, r));
        try {
          if (removable.size) await member.roles.remove([...removable.values()], "Sentinel suspension");
          await member.roles.add(suspendedRole, "Sentinel suspension");
        } catch (e) {
          return i.editReply({ embeds: [makeEmbed("Error", "I couldn't apply the suspension. Check my role permissions and hierarchy.", colors.danger)] });
        }
      } else if (["Strike 1", "Strike 2", "Strike 3"].includes(punishment)) {
        if (!punishmentroleid) {
          return i.editReply({ embeds: [makeEmbed("Error", `The ${punishment} role has not been configured.`, colors.danger)] });
        }
        const role = await i.guild.roles.fetch(String(punishmentroleid)).catch(() => null);
        if (!role || !botCanManageRole(i.guild, role)) {
          return i.editReply({ embeds: [makeEmbed("Error", "I cannot manage the configured strike role.", colors.danger)] });
        }
        try {
          await member.roles.add(role, `Sentinel ${punishment}`);
        } catch (e) {
          return i.editReply({ embeds: [makeEmbed("Error", "I couldn't apply the strike role.", colors.danger)] });
        }
      } else if (punishment === "Demotion") {
        const ladder = (cfg.promotionladder || []).map((x) => String(x.id || x.roleid || x));
        const roles = await Promise.all(ladder.map((id) => i.guild.roles.fetch(id).catch(() => null)));
        const promotionroles = roles.filter(Boolean);
        const memberrank = [...promotionroles].reverse().find((r) => member.roles.cache.has(r.id));
        if (!memberrank) {
          return i.editReply({ embeds: [makeEmbed("Error", "This member does not have a configured promotion role.", colors.danger)] });
        }
        const idx = promotionroles.indexOf(memberrank);
        if (idx === 0) {
          return i.editReply({ embeds: [makeEmbed("Error", "This member is already at the lowest promotion rank.", colors.danger)] });
        }
        const lowerrole = promotionroles[idx - 1];
        if (!botCanManageRole(i.guild, lowerrole)) {
          return i.editReply({ embeds: [makeEmbed("Error", "I cannot manage the lower promotion role.", colors.danger)] });
        }
        try {
          await member.roles.remove(memberrank, "Sentinel demotion");
          await member.roles.add(lowerrole, "Sentinel demotion");
        } catch (e) {
          return i.editReply({ embeds: [makeEmbed("Error", "I couldn't apply the demotion.", colors.danger)] });
        }
        punishmentroleid = lowerrole.id;
        await member.send({ embeds: [makeEmbed("Staff Demotion", `You have been demoted in **${i.guild.name}**.\n**Your updated role:** ${lowerrole.name}\n**Reason:** ${reason}`, 0xE67E22)] }).catch(() => {});
      } else if (punishment === "Termination") {
        const ladder = (cfg.promotionladder || []).map((x) => String(x.id || x.roleid || x));
        const roles = await Promise.all(ladder.map((id) => i.guild.roles.fetch(id).catch(() => null)));
        const promotionroles = roles.filter(Boolean);
        const toremove = promotionroles.filter((r) => member.roles.cache.has(r.id) && botCanManageRole(i.guild, r));
        try {
          if (toremove.length) await member.roles.remove(toremove, "Sentinel termination");
        } catch (e) {
          return i.editReply({ embeds: [makeEmbed("Error", "I couldn't remove the member's promotion roles.", colors.danger)] });
        }
      }

      const c = create("Infraction", member, i.user, reason, details, {
        punishment,
        expiresat: expiresat,
        punishmentroleid: punishmentroleid,
        rolestorerestore: rolestorerestore,
      });

      const e = makeEmbed(
        "Staff Infraction",
        null,
        0xE74C3C
      )
        .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
        .addFields(
          { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
          { name: "Punishment", value: punishment, inline: true },
          { name: "Reason", value: reason, inline: false },
          { name: "Details", value: details, inline: false },
          { name: "Duration", value: duration || "Permanent / Not required", inline: true },
          { name: "Case ID", value: `\`${c.id}\``, inline: true }
        );

      await sendlog(i.guild, "infractionlogchannel", e);

      await i.editReply({ embeds: [makeEmbed("Infraction Issued", `Successfully issued **${punishment}** to ${member}. Case ID: \`${c.id}\``, colors.success)] });

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
      if (!deleted) return i.reply({ embeds: [makeEmbed("Error", "Failed to delete messages.", colors.danger)], flags: flagsephemeral });
      return i.reply({ embeds: [makeEmbed("Purged", `Deleted ${deleted.size} message(s).`, colors.success)], flags: flagsephemeral });
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
      if (!m) return i.reply({ embeds: [makeEmbed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
      const reason = i.options.getString("reason") || "No reason provided";
      await m.timeout(null, reason);
      await sendlog(
        i.guild,
        "securitylogchannel",
        makeEmbed("Timeout Removed", null, colors.success)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${m.user.tag} (\`${m.id}\`)`, inline: true },
            { name: "Reason", value: reason, inline: false }
          )
      );
      return i.reply({ embeds: [makeEmbed("Timeout Removed", `Removed timeout from ${m.user.tag}.`, colors.success)], flags: flagsephemeral });
    },
  },
];