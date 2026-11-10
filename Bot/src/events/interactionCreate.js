const { Collection } = require("discord.js");
const { makeembed, colors } = require("../utils/embeds");
const { handleticket } = require("../commands/ticket");
const { handlepartnership } = require("../commands/partnership");
const { handleappeal } = require("../commands/appeal");
const { handleembed, handleembedbutton } = require("../commands/embed");
const { handlesetup } = require("../commands/setup");
const { handlehelp } = require("../commands/help");
const { error } = require("../utils/logger");

function generateerrorid() {
  return "ERR-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function errorembed(err, errorid) {
  return makeembed("Command Error", null, colors.danger)
    .addFields(
      { name: "Error ID", value: `\`${errorid}\``, inline: true },
      { name: "Message", value: err.message || "Unknown error", inline: false }
    );
}

module.exports = (client) =>
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("setup:")) {
        return handlesetup(interaction);
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("setup:modal:")) {
        return handlesetup(interaction);
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("help:")) {
        return handlehelp(interaction);
      }

      if (interaction.isButton() && interaction.customId.startsWith("help:")) {
        return handlehelp(interaction);
      }

      await handleticket(interaction);
      await handlepartnership(interaction);
      await handleappeal(interaction);
      await handleembed(interaction);
      await handleembedbutton(interaction);
    } catch (err) {
      const errorid = generateerrorid();
      error(`[${errorid}] Interaction error:`, err);

      const payload = {
        embeds: [errorembed(err, errorid)],
        flags: 1 << 6,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });