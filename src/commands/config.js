const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { get, set } = require("../utils/config");

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription("Configure Sentinel for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((s) =>
        s
          .setName("set-channel")
          .setDescription("Set a logging or review channel")
          .addStringOption((o) =>
            o
              .setName("setting")
              .setDescription("Configuration key")
              .setRequired(true)
              .addChoices(
                ...[
                  "promotion_log_channel",
                  "infraction_log_channel",
                  "partnership_review_channel",
                  "partnership_announcement_channel",
                  "appeal_approval_channel",
                  "security_log_channel",
                ].map((x) => ({ name: x, value: x }))
              )
          )
          .addChannelOption((o) =>
            o.setName("channel").setDescription("Channel").setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName("add-promotion-role")
          .setDescription("Add a role to the promotion ladder")
          .addRoleOption((o) =>
            o.setName("role").setDescription("Role").setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName("set-punishment-role")
          .setDescription("Set a punishment role")
          .addStringOption((o) =>
            o
              .setName("punishment")
              .setDescription("Punishment")
              .setRequired(true)
              .addChoices(
                ...[
                  "Strike 1",
                  "Strike 2",
                  "Strike 3",
                  "Suspension",
                  "Termination",
                ].map((x) => ({ name: x, value: x }))
              )
          )
          .addRoleOption((o) =>
            o.setName("role").setDescription("Role").setRequired(true)
          )
      ),
    async execute(i) {
      const sub = i.options.getSubcommand();

      if (sub === "set-channel") {
        const key = i.options.getString("setting");
        const ch = i.options.getChannel("channel");
        set(i.guildId, key, ch.id);
        return i.reply({
          content: `${key} set to ${ch}.`,
          ephemeral: true,
        });
      }

      if (sub === "add-promotion-role") {
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        const list = cfg.promotion_ladder || [];
        if (!list.some((x) => String(x.id || x) === role.id)) {
          list.push({ id: role.id, name: role.name });
        }
        set(i.guildId, "promotion_ladder", list);
        return i.reply({
          content: `Added ${role} to the end of the promotion ladder.`,
          ephemeral: true,
        });
      }

      if (sub === "set-punishment-role") {
        const p = i.options.getString("punishment");
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        cfg.punishment_roles[p] = role.id;
        set(i.guildId, "punishment_roles", cfg.punishment_roles);
        return i.reply({
          content: `${p} role set to ${role}.`,
          ephemeral: true,
        });
      }
    },
  },
];