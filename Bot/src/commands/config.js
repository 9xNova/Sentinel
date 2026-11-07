const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { get, set } = require("../utils/config");

const PERMISSION_KEYS = [
  { name: "Promotion", value: "promotion_permissions" },
  { name: "Infraction", value: "infraction_permissions" },
  { name: "Void", value: "void_permissions" },
  { name: "Appeal Review", value: "appeal_accept_permissions" },
  { name: "Partnership Approval", value: "partnership_approval_permissions" },
];

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription("Configure Sentinel for this server")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((s) =>
        s.setName("set-channel").setDescription("Set a logging or review channel")
          .addStringOption((o) => o.setName("setting").setDescription("Configuration key").setRequired(true)
            .addChoices(...["promotion_log_channel","infraction_log_channel","partnership_review_channel","partnership_announcement_channel","appeal_approval_channel","security_log_channel","ticket_rules_channel"].map((x) => ({ name: x, value: x }))))
          .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true)))
      .addSubcommand((s) => s.setName("add-promotion-role").setDescription("Add a role to the promotion ladder")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("remove-promotion-role").setDescription("Remove a role from the promotion ladder")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("list-promotion-ladder").setDescription("View the configured promotion ladder"))
      .addSubcommand((s) => s.setName("set-punishment-role").setDescription("Set a punishment role")
        .addStringOption((o) => o.setName("punishment").setDescription("Punishment").setRequired(true)
          .addChoices(...["Strike 1","Strike 2","Strike 3","Suspension","Termination"].map((x) => ({ name: x, value: x }))))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("permission-add").setDescription("Allow a role to use a permission")
        .addStringOption((o) => o.setName("permission").setDescription("Permission type").setRequired(true)
          .addChoices(...PERMISSION_KEYS.map((x) => ({ name: x.name, value: x.value }))))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("permission-remove").setDescription("Remove a role's permission")
        .addStringOption((o) => o.setName("permission").setDescription("Permission type").setRequired(true)
          .addChoices(...PERMISSION_KEYS.map((x) => ({ name: x.name, value: x.value }))))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("set-weekly-quota-role").setDescription("Set the weekly quota role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("set-discord-suspended-role").setDescription("Set the Discord suspended role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("set-ticket-human-role").setDescription("Set the ticket human role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)))
      .addSubcommand((s) => s.setName("add-ticket-category").setDescription("Add a ticket category")
        .addStringOption((o) => o.setName("key").setDescription("Category key").setRequired(true))
        .addStringOption((o) => o.setName("label").setDescription("Display label").setRequired(true)))
      .addSubcommand((s) => s.setName("remove-ticket-category").setDescription("Remove a ticket category")
        .addStringOption((o) => o.setName("key").setDescription("Category key").setRequired(true))),
    async execute(i) {
      const sub = i.options.getSubcommand();
      const guild = i.guild;

      if (sub === "set-channel") {
        const key = i.options.getString("setting");
        const ch = i.options.getChannel("channel");
        set(i.guildId, key, ch.id);
        return i.reply({ content: `${key} set to ${ch}.`, ephemeral: true });
      }

      if (sub === "add-promotion-role") {
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        const list = cfg.promotion_ladder || [];
        if (!list.some((x) => String(x.id || x) === role.id)) list.push({ id: role.id, name: role.name });
        list.sort((a, b) => {
          const ra = guild.roles.cache.get(String(a.id || a));
          const rb = guild.roles.cache.get(String(b.id || b));
          return (ra?.position || 0) - (rb?.position || 0);
        });
        set(i.guildId, "promotion_ladder", list);
        return i.reply({ content: `Added ${role} to the promotion ladder.`, ephemeral: true });
      }

      if (sub === "remove-promotion-role") {
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        const list = (cfg.promotion_ladder || []).filter((x) => String(x.id || x) !== role.id);
        set(i.guildId, "promotion_ladder", list);
        return i.reply({ content: `Removed ${role} from the promotion ladder.`, ephemeral: true });
      }

      if (sub === "list-promotion-ladder") {
        const roles = (get(i.guildId).promotion_ladder || []).map((x) => { const r = guild.roles.cache.get(String(x.id || x)); return r ? r.toString() : null; }).filter(Boolean);
        if (!roles.length) return i.reply({ content: "No promotion roles configured.", ephemeral: true });
        return i.reply({ content: `**Promotion Ladder:**\n${roles.map((r, idx) => `${idx + 1}. ${r}`).join("\n")}`, ephemeral: true });
      }

      if (sub === "set-punishment-role") {
        const p = i.options.getString("punishment");
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        cfg.punishment_roles[p] = role.id;
        set(i.guildId, "punishment_roles", cfg.punishment_roles);
        return i.reply({ content: `${p} role set to ${role}.`, ephemeral: true });
      }

      if (sub === "permission-add" || sub === "permission-remove") {
        const key = i.options.getString("permission");
        const role = i.options.getRole("role");
        const cfg = get(i.guildId);
        const list = (cfg[key] || []).map(String);
        const idx = list.indexOf(role.id);
        if (sub === "permission-add") {
          if (idx === -1) list.push(role.id);
        } else {
          if (idx !== -1) list.splice(idx, 1);
        }
        set(i.guildId, key, list);
        return i.reply({ content: `Updated \`${key}\` for ${role}.`, ephemeral: true });
      }

      if (sub === "set-weekly-quota-role") {
        const role = i.options.getRole("role");
        set(i.guildId, "weekly_quota_role", role.id);
        return i.reply({ content: `Weekly quota role set to ${role}.`, ephemeral: true });
      }

      if (sub === "set-discord-suspended-role") {
        const role = i.options.getRole("role");
        set(i.guildId, "discord_suspended_role", role.id);
        return i.reply({ content: `Discord suspended role set to ${role}.`, ephemeral: true });
      }

      if (sub === "set-ticket-human-role") {
        const role = i.options.getRole("role");
        set(i.guildId, "ticket_human_role", role.id);
        return i.reply({ content: `Ticket human role set to ${role}.`, ephemeral: true });
      }

      if (sub === "add-ticket-category") {
        const key = i.options.getString("key");
        const label = i.options.getString("label");
        const cfg = get(i.guildId);
        const cats = cfg.ticket_categories || {};
        cats[key] = label;
        set(i.guildId, "ticket_categories", cats);
        return i.reply({ content: `Added ticket category \`${key}\`: ${label}.`, ephemeral: true });
      }

      if (sub === "remove-ticket-category") {
        const key = i.options.getString("key");
        const cfg = get(i.guildId);
        const cats = cfg.ticket_categories || {};
        delete cats[key];
        set(i.guildId, "ticket_categories", cats);
        return i.reply({ content: `Removed ticket category \`${key}\`.`, ephemeral: true });
      }
    },
  },
];