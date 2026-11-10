const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const { makeEmbed, colors } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("embed")
      .setDescription("Create and send a custom embed")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(i) {
      const modal = new ModalBuilder()
        .setCustomId("embed:edit")
        .setTitle("Embed Editor");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("title")
            .setLabel("Embed title")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Embed message")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("color")
            .setLabel("Color hex (example: #5865F2)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

      return i.showModal(modal);
    },
  },
];

async function handleembed(i) {
  if (!i.isModalSubmit() || i.customId !== "embed:edit") return;

  const title = i.fields.getTextInputValue("title").trim();
  const description = i.fields.getTextInputValue("description");
  let color = i.fields.getTextInputValue("color").trim() || "#5865F2";

  if (!/^#?[0-9a-fA-F]{6}$/.test(color)) color = "#5865F2";
  color = parseInt(color.replace("#", ""), 16);

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);

  return i.reply({
    embeds: [makeEmbed("Embed Preview", "", color).setDescription(description)],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("embed:send")
          .setLabel("Send Embed")
          .setStyle(ButtonStyle.Success)
      ),
    ],
    flags: flagsephemeral,
  });
}

async function handleembedbutton(i) {
  if (!i.isButton() || i.customId !== "embed:send") return;

  const e = i.message.embeds[0];
  if (!e) {
    return i.reply({ embeds: [makeEmbed("Error", "Embed preview missing.", colors.danger)], flags: flagsephemeral });
  }

  await i.channel.send({ embeds: [EmbedBuilder.from(e)] });
  return i.update({ embeds: [makeEmbed("Embed Sent", "Embed sent to this channel.", colors.success)], components: [] });
}

module.exports.handleembed = handleembed;
module.exports.handleembedbutton = handleembedbutton;