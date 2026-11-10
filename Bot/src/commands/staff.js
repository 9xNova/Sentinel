const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const { get } = require("../utils/config");
const {
  canPromote,
  canIssueInfractions,
  canVoid,
} = require("../utils/permissions");
const { create, all, find, update } = require("../utils/cases");
const { sendlog, makeembed, colors } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("promo")
      .setDescription("Promote a staff member")
      .addUserOption((o) =>
        o.setName("member").setDescription("Staff member").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason for promotion").setRequired(true)
      ),
    async execute(i) {
      if (!canPromote(i.member)) {
        return i.reply({ embeds: [makeembed("Error", "You do not have permission to promote staff.", colors.danger)], flags: flagsephemeral });
      }

      const member = await i.guild.members
        .fetch(i.options.getUser("member").id)
        .catch(() => null);
      if (!member) {
        return i.reply({ embeds: [makeembed("Error", "Member not found.", colors.danger)], flags: flagsephemeral });
      }

      const cfg = get(i.guildId);
      const promotionladder = cfg.promotionladder || [];
      const current = member.roles.cache.find((r) =>
        promotionladder.some((x) => String(x.id || x.roleid || x) === r.id)
      );
      const index = current
        ? promotionladder.findIndex((x) => String(x.id || x.roleid || x) === current.id)
        : -1;
      const next = promotionladder[index + 1];

      if (!next) {
        return i.reply({ embeds: [makeembed("Error", "No next promotion role is configured for this member.", colors.danger)], flags: flagsephemeral });
      }

      const roleid = String(next.id || next.roleid || next);
      const role = await i.guild.roles.fetch(roleid).catch(() => null);
      if (!role) {
        return i.reply({ embeds: [makeembed("Error", "The next promotion role is invalid. Check /setup.", colors.danger)], flags: flagsephemeral });
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, `Promotion by ${i.user.tag}: ${i.options.getString("reason")}`);
      }

      const c = create(
        "Promotion",
        member,
        i.user,
        i.options.getString("reason"),
        "",
        { newroleid: role.id }
      );

      await sendlog(
        i.guild,
        "promotionlogchannel",
        makeembed("Staff Promotion", null, colors.success)
          .setAuthor({ name: i.user.tag, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
          .addFields(
            { name: "Member", value: `${member} (\`${member.id}\`)`, inline: true },
            { name: "New Role", value: `${role.name}`, inline: true },
            { name: "Reason", value: c.reason, inline: false },
            { name: "Case", value: `#${c.id}`, inline: true }
          )
      );
      await member
        .send(
          `You have been promoted to **${role.name}** in **${i.guild.name}**.\nReason: ${c.reason}`
        )
        .catch(() => {});

      return i.reply({ embeds: [makeembed("Staff Promotion", `${member} was promoted to **${role.name}**.\n**Reason:** ${c.reason}`, colors.success)] });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("history")
      .setDescription("View a member's staff case history")
      .addUserOption((o) =>
        o.setName("member").setDescription("Member").setRequired(true)
      ),
    async execute(i) {
      const user = i.options.getUser("member");
      const rows = all()
        .filter(
          (x) =>
            String(x.guildId) === String(i.guildId) &&
            String(x.memberId) === String(user.id)
        )
        .slice(-10);

      const e = makeembed(
        `Staff History - ${user.tag}`,
        rows.length
          ? rows
              .map(
                (x) =>
                  `**#${x.id} ${x.type}** - ${x.reason} ${
                    x.voided ? "(VOIDED)" : ""
                  }`
              )
              .join("\n")
          : "No cases found.",
        colors.primary
      );

      return i.reply({ embeds: [e], flags: flagsephemeral });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("void")
      .setDescription("Void a staff case")
      .addIntegerOption((o) =>
        o.setName("caseid").setDescription("Case number").setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("reason").setDescription("Reason for voiding").setRequired(true)
      ),
    async execute(i) {
      if (!canVoid(i.member)) {
        return i.reply({ embeds: [makeembed("Error", "You do not have permission to void cases.", colors.danger)], flags: flagsephemeral });
      }

      const caseid = i.options.getInteger("caseid");
      const c = find(caseid, i.guildId);
      if (!c) {
        return i.reply({ embeds: [makeembed("Error", "Case not found.", colors.danger)], flags: flagsephemeral });
      }
      if (c.voided) {
        return i.reply({ embeds: [makeembed("Error", "That case is already voided.", colors.danger)], flags: flagsephemeral });
      }

      update(caseid, i.guildId, {
        voided: true,
        voidedby: i.user.id,
        voidreason: i.options.getString("reason"),
        voidedat: new Date().toISOString(),
      });

      const e = makeembed(
        "Staff Case Voided",
        `Case **#${caseid}** was voided.\nReason: ${i.options.getString("reason")}`,
        colors.primary
      );

      return i.reply({ embeds: [e] });
    },
  },
];