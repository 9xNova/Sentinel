const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const colors = {
  primary: 0x0F172A,
  accent: 0x3B82F6,
  success: 0x10B981,
  warning: 0xF59E0B,
  danger: 0xEF4444,
};

const categories = [
  { id: "moderation", label: "Moderation" },
  { id: "staff", label: "Staff & Infractions" },
  { id: "ticket", label: "Tickets" },
  { id: "security", label: "Security" },
  { id: "setup", label: "Setup" },
  { id: "badwords", label: "Badwords" },
  { id: "appeal", label: "Appeals" },
  { id: "partnership", label: "Partnerships" },
  { id: "info", label: "Information" },
  { id: "weekly", label: "Weekly" },
  { id: "embed", label: "Embeds" },
];

const commandmap = {
  moderation: [
    { name: "/mute", desc: "Timeout a member", perm: "ModerateMembers" },
    { name: "/ban", desc: "Ban a member", perm: "BanMembers" },
    { name: "/kick", desc: "Kick a member", perm: "KickMembers" },
    { name: "/unban", desc: "Unban a user", perm: "BanMembers" },
    { name: "/purge", desc: "Delete messages", perm: "ManageMessages" },
    { name: "/untimeout", desc: "Remove a timeout", perm: "ModerateMembers" },
    { name: "/warn", desc: "Warn a member", perm: "ModerateMembers" },
    { name: "/warnings", desc: "View member warnings", perm: "ModerateMembers" },
    { name: "/unwarn", desc: "Remove a warning", perm: "ModerateMembers" },
    { name: "/clearwarnings", desc: "Clear all warnings", perm: "ModerateMembers" },
  ],
  staff: [
    { name: "/infraction", desc: "Issue a staff infraction", perm: "ModerateMembers" },
    { name: "/promo", desc: "Promote a staff member", perm: "Administrator" },
    { name: "/history", desc: "View staff case history", perm: "Administrator" },
    { name: "/void", desc: "Void a staff case", perm: "Administrator" },
  ],
  ticket: [
    { name: "/ticket-panel", desc: "Post a ticket panel", perm: "ManageGuild" },
    { name: "/ticket closerequest", desc: "Request to close your ticket", perm: "none" },
  ],
  security: [
    { name: "/security suspend", desc: "Security-suspend a member", perm: "Administrator" },
    { name: "/security unsuspend", desc: "Restore a suspended member", perm: "Administrator" },
    { name: "/security view", desc: "View active suspensions", perm: "Administrator" },
    { name: "/discord suspend", desc: "Apply Discord Suspended role", perm: "Administrator" },
    { name: "/discord unsuspend", desc: "Restore Discord Suspended member", perm: "Administrator" },
  ],
  setup: [
    { name: "/setup", desc: "Open the server setup panel", perm: "Administrator" },
  ],
  badwords: [
    { name: "/badword add", desc: "Add a word to the filter", perm: "ManageGuild" },
    { name: "/badword remove", desc: "Remove a word from the filter", perm: "ManageGuild" },
    { name: "/badword list", desc: "Show the current filter", perm: "ManageGuild" },
    { name: "/badword toggle", desc: "Turn the filter on or off", perm: "ManageGuild" },
    { name: "/badword exempt-add", desc: "Exempt a role from filtering", perm: "ManageGuild" },
    { name: "/badword exempt-remove", desc: "Remove a filter exemption", perm: "ManageGuild" },
  ],
  appeal: [
    { name: "/appeal", desc: "Submit an appeal for a staff case", perm: "none" },
  ],
  partnership: [
    { name: "/partnership", desc: "Submit a partnership application", perm: "none" },
  ],
  info: [
    { name: "/ping", desc: "Check bot latency", perm: "none" },
    { name: "/serverinfo", desc: "Show server information", perm: "none" },
    { name: "/userinfo", desc: "Show user information", perm: "none" },
    { name: "/avatar", desc: "Show a user's avatar", perm: "none" },
    { name: "/membercount", desc: "Show member count", perm: "none" },
  ],
  weekly: [
    { name: "/weekly quota", desc: "View weekly staff quota leaderboard", perm: "none" },
  ],
  embed: [
    { name: "/embed", desc: "Create and send a custom embed", perm: "ManageMessages" },
  ],
};

const flagsephemeral = 1 << 6;

function hasperm(member, perm) {
  if (!member || perm === "none") return true;
  return member.permissions.has(PermissionFlagsBits[perm]);
}

function buildembed(guild, member, categoryid) {
  const cat = categories.find((c) => c.id === categoryid) || categories[0];
  const cmds = (commandmap[categoryid] || []).filter((c) => hasperm(member, c.perm));

  const embed = new EmbedBuilder()
    .setColor(colors.primary)
    .setTitle(`Sentinel Help - ${cat.label}`)
    .setDescription("All available commands for this server.")
    .setTimestamp();

  if (cmds.length) {
    for (const c of cmds) {
      embed.addFields({ name: c.name, value: c.desc, inline: true });
    }
  } else {
    embed.setDescription("No commands available in this category for your permissions.");
  }

  return embed;
}

function selectmenu(categoryid) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help:category")
      .setPlaceholder("Select a category")
      .setOptions(
        categories.map((c) => ({
          label: c.label,
          value: c.id,
          default: c.id === categoryid,
        }))
      )
  );
}

function controlsrow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("help:refresh").setLabel("Refresh").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("help:close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show the help menu")
      .addStringOption((o) =>
        o.setName("command").setDescription("Get details for a specific command").setRequired(false)
      ),
    async execute(i) {
      const specific = i.options.getString("command");
      const member = i.member;

      if (specific) {
        const found = Object.values(commandmap).flat().find((c) => c.name.toLowerCase() === specific.toLowerCase());
        if (!found || !hasperm(member, found.perm)) {
          return i.reply({
            embeds: [makeerrorembed("Command not found or you do not have permission to use it.")],
            flags: flagsephemeral,
          });
        }
        const embed = new EmbedBuilder()
          .setColor(colors.accent)
          .setTitle(`Command: ${found.name}`)
          .setDescription(found.desc)
          .addFields({ name: "Required Permission", value: found.perm === "none" ? "Anyone" : found.perm, inline: true })
          .setTimestamp();
        return i.reply({ embeds: [embed], flags: flagsephemeral });
      }

      const embed = buildembed(i.guild, member, "moderation");
      await i.reply({
        embeds: [embed],
        components: [selectmenu("moderation"), controlsrow()],
        flags: flagsephemeral,
      });
    },
  },
];

async function handlehelp(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === "help:category") {
    const catid = interaction.values[0];
    const embed = buildembed(interaction.guild, interaction.member, catid);
    await interaction.update({ embeds: [embed], components: [selectmenu(catid), controlsrow()] });
    return;
  }

  if (interaction.isButton() && interaction.customId === "help:close") {
    await interaction.message.delete().catch(() => {});
    const msg = await interaction.reply({
      embeds: [makeinfoembed("Help closed.")],
      flags: flagsephemeral,
    });
    setTimeout(() => msg.delete().catch(() => {}), 3000);
    return;
  }

  if (interaction.isButton() && interaction.customId === "help:refresh") {
    const embed = buildembed(interaction.guild, interaction.member, "moderation");
    await interaction.update({ embeds: [embed], components: [selectmenu("moderation"), controlsrow()] });
    return;
  }
}

function makeerrorembed(text) {
  return new EmbedBuilder().setColor(colors.danger).setDescription(text).setTimestamp();
}

function makeinfoembed(text) {
  return new EmbedBuilder().setColor(colors.primary).setDescription(text).setTimestamp();
}

module.exports.handlehelp = handlehelp;