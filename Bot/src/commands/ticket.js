const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { get } = require("../utils/config");
const { read, write } = require("../utils/storage");
const { makeEmbed, sendlog } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("ticket-panel")
      .setDescription("Post a ticket panel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Panel channel")
          .addChannelTypes(ChannelType.GuildText)
      ),
    async execute(i) {
      const channel = i.options.getChannel("channel") || i.channel;
      const categories = Object.keys(get(i.guildId).ticketcategories || {});
      const label = categories[0] || "General Support";

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("ticket:open")
          .setLabel(`Open ${label} Ticket`)
          .setStyle(ButtonStyle.Primary)
      );

      await channel.send({
        embeds: [
          makeEmbed("Support Tickets", "Click the button below to open a private support ticket."),
        ],
        components: [row],
      });

      return i.reply({
        embeds: [makeEmbed("Ticket Panel Posted", `Ticket panel posted in ${channel}.`)],
        flags: flagsephemeral,
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName("ticket")
      .setDescription("Ticket management")
      .addSubcommand((s) =>
        s.setName("closerequest").setDescription("Request to close your ticket")
      ),
    async execute(i) {
      const sub = i.options.getSubcommand();
      if (sub !== "closerequest") return;

      const rows = read("tickets.json", []);
      const r = rows.find(
        (x) =>
          x.guildId === i.guildId &&
          x.channelId === i.channelId &&
          x.status === "open"
      );

      if (!r) {
        return i.reply({
          embeds: [makeEmbed("Error", "This is not an open ticket channel.", 0xEF4444)],
          flags: flagsephemeral,
        });
      }

      if (r.userId !== i.user.id) {
        return i.reply({
          embeds: [makeEmbed("Error", "Only the ticket owner can request a close.", 0xEF4444)],
          flags: flagsephemeral,
        });
      }

      r.status = "closerequested";
      r.closerequestedat = new Date().toISOString();
      r.closerequestedby = i.user.id;
      write("tickets.json", rows);

      const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:confirmclose:${r.channelId}`)
          .setLabel("Confirm Close")
          .setStyle(ButtonStyle.Danger)
      );

      await i.channel.send({
        content: `${i.user} has requested to close this ticket. Staff, confirm below:`,
        components: [controls],
      });

      await sendlog(
        i.guild,
        "securitylogchannel",
        makeEmbed(
          "Ticket Close Requested",
          `**Ticket:** <#${r.channelId}>\n**Requested by:** ${i.user.tag}\n**Channel:** <#${r.channelId}>`,
          0xF1C40F
        )
      ).catch(() => {});

      return i.reply({
        embeds: [makeEmbed("Close Request Submitted", "Close request submitted. A staff member must confirm it.", 0x10B981)],
        flags: flagsephemeral,
      });
    },
  },
];

async function handleticket(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("ticket:")) {
    return;
  }

  if (interaction.customId === "ticket:open") {
    const existing = read("tickets.json", []).find(
      (x) =>
        x.guildId === interaction.guildId &&
        x.userId === interaction.user.id &&
        x.status === "open"
    );

    if (existing) {
      const ch = await interaction.guild.channels
        .fetch(existing.channelId)
        .catch(() => null);
      return interaction.reply({
        embeds: [makeEmbed("Existing Ticket", ch ? `You already have a ticket: ${ch}` : "You already have an open ticket.", 0xF1C40F)],
        flags: flagsephemeral,
      });
    }

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 90),
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: ["ViewChannel"],
        },
        {
          id: interaction.user.id,
          allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
        },
        {
          id: interaction.client.user.id,
          allow: ["ViewChannel", "SendMessages", "ManageChannels"],
        },
      ],
    });

    const rows = read("tickets.json", []);
    rows.push({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: channel.id,
      status: "open",
      createdat: new Date().toISOString(),
    });
    write("tickets.json", rows);

    const controls = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:close")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `${interaction.user}`,
      embeds: [
        makeEmbed(
          "Support Ticket",
          "Please describe what you need help with. A staff member will assist you."
        ),
      ],
      components: [controls],
    });

    return interaction.reply({
      embeds: [makeEmbed("Ticket Opened", `Your ticket has been opened: ${channel}`, 0x10B981)],
      flags: flagsephemeral,
    });
  }

  if (interaction.customId === "ticket:close") {
    const rows = read("tickets.json", []);
    const r = rows.find(
      (x) => x.channelId === interaction.channelId && x.status === "open"
    );

    if (!r) {
      return interaction.reply({
        embeds: [makeEmbed("Error", "Ticket record not found.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    const isOwner = r.userId === interaction.user.id;
    const isStaff = interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels
    );

    if (!isOwner && !isStaff) {
      return interaction.reply({
        embeds: [makeEmbed("Error", "Only the ticket owner or staff can close this ticket.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    r.status = "closed";
    r.closedat = new Date().toISOString();
    write("tickets.json", rows);

    await interaction.reply({
      embeds: [makeEmbed("Ticket Closed", "This channel will be deleted in 5 seconds.", 0xEF4444)],
    });

    setTimeout(() => {
      interaction.channel.delete("Ticket closed").catch(() => {});
    }, 5000);
  }

  if (interaction.customId.startsWith("ticket:confirmclose:")) {
    const channelId = interaction.customId.split(":").slice(2).join(":");
    const rows = read("tickets.json", []);
    const r = rows.find(
      (x) => x.channelId === channelId && x.status === "closerequested"
    );

    if (!r) {
      return interaction.reply({
        embeds: [makeEmbed("Error", "No close request found for this ticket.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    const isStaff = interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels
    );
    if (!isStaff) {
      return interaction.reply({
        embeds: [makeEmbed("Error", "Only staff can confirm a ticket close request.", 0xEF4444)],
        flags: flagsephemeral,
      });
    }

    r.status = "closed";
    r.closedat = new Date().toISOString();
    r.closedby = interaction.user.id;
    write("tickets.json", rows);

    await interaction.reply({
      embeds: [makeEmbed("Close Confirmed", "Close request confirmed. This channel will be deleted in 5 seconds.", 0xEF4444)],
    });

    setTimeout(() => {
      interaction.channel.delete("Ticket closed").catch(() => {});
    }, 5000);
  }
}

module.exports.handleticket = handleticket;