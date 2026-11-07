const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendLog } = require("../utils/embeds");

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Timeout a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) =>
        o.setName("member").setDescription("Member").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("minutes")
          .setDescription("Timeout length in minutes")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(40320)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason").setRequired(false)
      ),
    async execute(i) {
      const m = await i.guild.members
        .fetch(i.options.getUser("member").id)
        .catch(() => null);
      if (!m) {
        return i.reply({ content: "Member not found.", ephemeral: true });
      }

      const reason = i.options.getString("reason") || "No reason provided";
      await m.timeout(i.options.getInteger("minutes") * 60000, reason);
      await sendLog(
        i.guild,
        "security_log_channel",
        makeEmbed("Member Timed Out", `${m} was timed out.\nReason: ${reason}`)
      );
      return i.reply({ content: `Timed out ${m.user.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption((o) =>
        o.setName("member").setDescription("Member").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason").setRequired(false)
      ),
    async execute(i) {
      const u = i.options.getUser("member");
      const reason = i.options.getString("reason") || "No reason provided";
      await i.guild.members.ban(u, { reason });
      await sendLog(
        i.guild,
        "security_log_channel",
        makeEmbed("Member Banned", `${u.tag} was banned.\nReason: ${reason}`)
      );
      return i.reply({ content: `Banned ${u.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a member")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption((o) =>
        o.setName("member").setDescription("Member").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason").setRequired(false)
      ),
    async execute(i) {
      const m = await i.guild.members
        .fetch(i.options.getUser("member").id)
        .catch(() => null);
      if (!m) {
        return i.reply({ content: "Member not found.", ephemeral: true });
      }

      const reason = i.options.getString("reason") || "No reason provided";
      await m.kick(reason);
      await sendLog(
        i.guild,
        "security_log_channel",
        makeEmbed("Member Kicked", `${m.user.tag} was kicked.\nReason: ${reason}`)
      );
      return i.reply({ content: `Kicked ${m.user.tag}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) =>
        o.setName("user_id").setDescription("User ID").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason").setRequired(false)
      ),
    async execute(i) {
      const id = i.options.getString("user_id");
      const reason = i.options.getString("reason") || "No reason provided";
      await i.guild.members.unban(id, reason);
      return i.reply({ content: `Unbanned ${id}.` });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("purge")
      .setDescription("Delete a number of messages")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) =>
        o.setName("amount").setDescription("Number of messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)
      ),
    async execute(i) {
      const amount = i.options.getInteger("amount");
      const channel = i.channel;
      const deleted = await channel.bulkDelete(amount, true).catch(() => null);
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