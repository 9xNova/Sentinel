const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { makeEmbed, sendLog } = require("../utils/embeds");
const B = require("../utils/badwords");

function audit(i, text) {
  sendLog(i.guild, "security_log_channel", makeEmbed("Bad-word Filter", text)).catch(
    () => {}
  );
}

function cap(words, limit = 30) {
  const shown = words.slice(0, limit).join(", ");
  const extra = words.length - limit;
  return extra > 0 ? `${shown} and ${extra} more` : shown;
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("badword")
      .setDescription("Manage the bad-word filter")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) =>
        s
          .setName("add")
          .setDescription("Add a word to the filter")
          .addStringOption((o) =>
            o.setName("word").setDescription("Word or phrase to block").setRequired(true)
          )
      )
      .addSubcommand((s) =>
        s
          .setName("remove")
          .setDescription("Remove a word from the filter")
          .addStringOption((o) =>
            o.setName("word").setDescription("Word to unblock").setRequired(true)
          )
      )
      .addSubcommand((s) => s.setName("list").setDescription("Show the current filter"))
      .addSubcommand((s) => s.setName("toggle").setDescription("Turn the filter on or off"))
      .addSubcommand((s) =>
        s
          .setName("exempt-add")
          .setDescription("Stop filtering messages from a role")
          .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("exempt-remove")
          .setDescription("Start filtering a role again")
          .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
      ),
    async execute(i) {
      const sub = i.options.getSubcommand();

      if (sub === "add") {
        const result = B.add(i.guildId, i.options.getString("word"));
        if (!result.ok) return i.reply({ content: result.error, ephemeral: true });
        audit(i, `**${i.user}** added \`${result.word}\` to the filter.`);
        return i.reply({
          content: `Added \`${result.word}\` to the bad-word filter.`,
          ephemeral: true,
        });
      }

      if (sub === "remove") {
        const result = B.remove(i.guildId, i.options.getString("word"));
        if (!result.ok) return i.reply({ content: result.error, ephemeral: true });
        audit(i, `**${i.user}** removed \`${result.word}\` from the filter.`);
        return i.reply({
          content: `Removed \`${result.word}\` from the bad-word filter.`,
          ephemeral: true,
        });
      }

      if (sub === "list") {
        const list = B.get(i.guildId);
        const e = makeEmbed(
          "Bad-word Filter",
          [
            `**Filter:** ${list.enabled ? "On" : "Off"}`,
            `**This server (${list.words.length}):** ${
              list.words.length ? cap(list.words) : "none"
            }`,
            `**Shared (${list.shared.length}):** ${
              list.shared.length ? cap(list.shared) : "none"
            }`,
            `**Exempt roles:** ${
              list.exemptRoles.length
                ? list.exemptRoles.map((id) => `<@&${id}>`).join(" ")
                : "none"
            }`,
          ].join("\n")
        );
        return i.reply({ embeds: [e], ephemeral: true });
      }

      if (sub === "toggle") {
        const enabled = B.setEnabled(i.guildId, !B.get(i.guildId).enabled);
        audit(i, `**${i.user}** turned the filter ${enabled ? "on" : "off"}.`);
        return i.reply({
          content: `Bad-word filter turned ${enabled ? "on" : "off"}.`,
          ephemeral: true,
        });
      }

      if (sub === "exempt-add") {
        const role = i.options.getRole("role");
        const result = B.addExempt(i.guildId, role.id);
        if (!result.ok) return i.reply({ content: result.error, ephemeral: true });
        audit(i, `**${i.user}** exempted ${role} from the filter.`);
        return i.reply({
          content: `Messages from ${role} are no longer filtered.`,
          ephemeral: true,
        });
      }

      if (sub === "exempt-remove") {
        const role = i.options.getRole("role");
        const result = B.removeExempt(i.guildId, role.id);
        if (!result.ok) return i.reply({ content: result.error, ephemeral: true });
        audit(i, `**${i.user}** removed the filter exemption from ${role}.`);
        return i.reply({
          content: `${role} is filtered again.`,
          ephemeral: true,
        });
      }
    },
  },
];