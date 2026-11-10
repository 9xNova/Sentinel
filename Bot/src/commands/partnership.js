const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const { get } = require("../utils/config");
const { canApprovePartnerships } = require("../utils/permissions");
const { makeEmbed } = require("../utils/embeds");
const { read, write } = require("../utils/storage");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("partnership")
      .setDescription("Submit a partnership application"),
    async execute(i) {
      const modal = new ModalBuilder()
        .setCustomId("partnership:submit")
        .setTitle("Partnership Application");

      for (const [id, label, style] of [
        ["server", "Server Name", 1],
        ["invite", "Server Invite Link", 1],
        ["count", "Member Count", 1],
        ["description", "Server Description", 2],
      ]) {
        const input = new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(
            style === 2 ? TextInputStyle.Paragraph : TextInputStyle.Short
          )
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
      }

      await i.showModal(modal);
    },
  },
];

async function handlepartnership(interaction) {
  if (
    interaction.isModalSubmit() &&
    interaction.customId === "partnership:submit"
  ) {
    const row = {
      id: Date.now().toString(),
      guildId: interaction.guildId,
      userId: interaction.user.id,
      server: interaction.fields.getTextInputValue("server"),
      invite: interaction.fields.getTextInputValue("invite"),
      count: interaction.fields.getTextInputValue("count"),
      description: interaction.fields.getTextInputValue("description"),
      status: "pending",
    };

    const rows = read("partnerships.json", []);
    rows.push(row);
    write("partnerships.json", rows);

    const channelid = get(interaction.guildId).partnershipreviewchannel;
    const channel = channelid
      ? await interaction.guild.channels.fetch(String(channelid)).catch(() => null)
      : null;

    if (!channel?.isTextBased()) {
      return interaction.reply({
        embeds: [
          makeEmbed(
            "Partnership Application Saved",
            "Application saved, but the review channel is not configured. Ask an administrator to set it.",
            0xF59E0B
          )
        ],
        flags: flagsephemeral,
      });
    }

    const e = makeEmbed(
      "Partnership Application",
      `**Server:** ${row.server}\n**Invite:** ${row.invite}\n**Members:** ${row.count}\n**Description:** ${row.description}\n**Applicant:** <@${row.userId}>`,
      0x0F172A
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`partnership:approve:${row.id}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`partnership:deny:${row.id}`)
        .setLabel("Deny")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [e], components: [buttons] });

    return interaction.reply({
      embeds: [makeEmbed("Partnership Submitted", "Your partnership application has been submitted for review.", 0x10B981)],
      flags: flagsephemeral,
    });
  }

  if (
    interaction.isButton() &&
    interaction.customId.startsWith("partnership:")
  ) {
    if (!canApprovePartnerships(interaction.member)) {
      return interaction.reply({
        embeds: [makeEmbed("Error", "You cannot review partnership applications.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    const [, action, id] = interaction.customId.split(":");
    const rows = read("partnerships.json", []);
    const r = rows.find((x) => x.id === id);

    if (!r || r.status !== "pending") {
      return interaction.reply({
        embeds: [makeEmbed("Error", "This application is no longer pending.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    r.status = action === "approve" ? "approved" : "denied";
    r.reviewedby = interaction.user.id;
    write("partnerships.json", rows);

    await interaction.update({
      embeds: [
        makeEmbed(
          `Partnership ${r.status}`,
          `**${r.server}** - ${r.status} by ${interaction.user}.`,
          action === "approve" ? 0x10B981 : 0xEF4444
        ),
      ],
      components: [],
    });

    if (action === "approve") {
      const destid = get(interaction.guildId).partnershipannouncementchannel;
      const dest = destid
        ? await interaction.guild.channels
            .fetch(String(destid))
            .catch(() => null)
        : null;
      if (dest?.isTextBased()) {
        await dest.send({
          embeds: [
            makeEmbed(
              "New Server Partnership",
              `**${r.server}**\n${r.description}\n${r.invite}`,
              0x10B981
            ),
          ],
        });
      }
    }

    return;
  }
}

module.exports.handlepartnership = handlepartnership;