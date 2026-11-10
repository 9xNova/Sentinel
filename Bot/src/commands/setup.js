const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { get, set } = require("../utils/config");
const { makeEmbed } = require("../utils/embeds");
const b = require("../utils/badwords");

const colors = {
  primary: 0x0F172A,
  accent: 0x3B82F6,
  success: 0x10B981,
  warning: 0xF59E0B,
  danger: 0xEF4444,
  muted: 0x64748B,
};

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Open the server setup panel")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(i) {
      const cfg = get(i.guildid);
      cfg.guildid = i.guildid;
      await i.reply({
        embeds: [panelembed(i.guild, cfg)],
        components: [mainrow(), mainrowclose()],
        flags: 1 << 6,
      });
    },
  },
];

const channelkeys = [
  { label: "Promotion Logs", key: "promotionlogchannel" },
  { label: "Infraction Logs", key: "infractionlogchannel" },
  { label: "Partnership Review", key: "partnershipreviewchannel" },
  { label: "Partnership Announcements", key: "partnershipannouncementchannel" },
  { label: "Appeal Approval", key: "appealapprovalchannel" },
  { label: "Security Logs", key: "securitylogchannel" },
  { label: "Ticket Rules", key: "ticketruleschannel" },
  { label: "Honeypot Channel", key: "honeypotchannel" },
];

const rolekeys = [
  { label: "Promotion Permissions", key: "promotionpermissions" },
  { label: "Infraction Permissions", key: "infractionpermissions" },
  { label: "Void Permissions", key: "voidpermissions" },
  { label: "Appeal Accept Permissions", key: "appealacceptpermissions" },
  { label: "Partnership Approval Permissions", key: "partnershipapprovalpermissions" },
  { label: "Discord Suspended Role", key: "discordsuspendedrole" },
  { label: "Weekly Quota Role", key: "weeklyquotorole" },
  { label: "Ticket Human Role", key: "tickethumanrole" },
  { label: "Honeypot Role", key: "honeypotrole" },
];

function valueof(cfg, key) {
  const v = cfg[key];
  if (key === "promotionladder") return Array.isArray(v) && v.length ? `${v.length} roles` : "none";
  if (Array.isArray(v)) return v.length ? `${v.length} roles` : "none";
  return v ? `<#${v}>` : "none";
}

function panelembed(guild, cfg) {
  const embed = new EmbedBuilder()
    .setColor(colors.primary)
    .setTitle("Sentinel Server Setup")
    .setDescription("Configure your server below. Pick a category to begin.")
    .setTimestamp();

  embed.addFields(
    {
      name: "Channels",
      value: channelkeys.map((c) => `${c.label}: ${valueof(cfg, c.key)}`).join("\n"),
      inline: true,
    },
    {
      name: "Roles & Permissions",
      value: rolekeys.map((r) => `${r.label}: ${valueof(cfg, r.key)}`).join("\n"),
      inline: true,
    },
    {
      name: "Security",
      value: [
        `Badword Filter: ${cfg.badwordenabled === false ? "off" : "on"}`,
        `Honeypot: ${cfg.honeypotchannel ? "active" : "off"}`,
      ].join("\n"),
      inline: false,
    }
  );

  return embed;
}

function mainrow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup:channels").setLabel("Channels").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("setup:roles").setLabel("Roles").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("setup:security").setLabel("Security").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("setup:badwords").setLabel("Badwords").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("setup:tickets").setLabel("Tickets").setStyle(ButtonStyle.Secondary)
  );
}

function mainrowclose() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup:close").setLabel("Close").setStyle(ButtonStyle.Danger)
  );
}

function channelsmodal(cfg) {
  const modal = new ModalBuilder().setCustomId("setup:modal:channels").setTitle("Channel Setup");
  for (const c of channelkeys) {
    const cur = cfg[c.key] || "";
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`setup:in:${c.key}`)
          .setLabel(c.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Mention a channel or leave blank to clear")
          .setValue(cur ? `<#${cur}>` : "")
          .setRequired(false)
      )
    );
  }
  return modal;
}

function rolesmodal(cfg) {
  const modal = new ModalBuilder().setCustomId("setup:modal:roles").setTitle("Roles & Permissions");
  for (const r of rolekeys) {
    const cur = cfg[r.key];
    let val = "";
    if (Array.isArray(cur)) val = cur.join(", ");
    else if (cur) val = String(cur);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`setup:in:${r.key}`)
          .setLabel(r.label)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Mention roles separated by commas, or leave blank")
          .setValue(val)
          .setRequired(false)
      )
    );
  }
  return modal;
}

function securitymodal(cfg) {
  const modal = new ModalBuilder().setCustomId("setup:modal:security").setTitle("Security Setup");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:honeypotchannel")
        .setLabel("Honeypot Channel")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Channel to trap unknown messages")
        .setValue(cfg.honeypotchannel ? `<#${cfg.honeypotchannel}>` : "")
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:honeypotrole")
        .setLabel("Honeypot Role")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Role assigned to honeypot triggers")
        .setValue(cfg.honeypotrole || "")
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:discordsuspendedrole")
        .setLabel("Suspended Role")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Role applied on security suspension")
        .setValue(cfg.discordsuspendedrole || "")
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:badwordenabled")
        .setLabel("Badword Filter (on/off)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("on or off")
        .setValue(cfg.badwordenabled === false ? "off" : "on")
        .setRequired(false)
    )
  );
  return modal;
}

function badwordsmodal(cfg) {
  const bw = b.get(cfg.guildid || "0");
  const modal = new ModalBuilder().setCustomId("setup:modal:badwords").setTitle("Badword Filter");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:badwordenabled")
        .setLabel("Filter (on/off)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("on or off")
        .setValue(bw.enabled === false ? "off" : "on")
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("setup:in:badwordexempt")
        .setLabel("Exempt Roles")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Role mentions separated by commas")
        .setValue(bw.exemptroles.map((id) => `<@&${id}>`).join(", "))
        .setRequired(false)
    )
  );
  return modal;
}

function extractid(raw) {
  if (!raw) return null;
  const m = raw.match(/<[#@&]?(\d+)>/);
  return m ? m[1] : raw.trim() || null;
}

function extractroles(raw) {
  if (!raw) return [];
  return raw.split(",").map((part) => {
    const id = extractid(part);
    return id;
  }).filter(Boolean);
}

async function handlesetup(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith("setup:")) {
    const cid = interaction.customId;
    const cfg = get(interaction.guildid);
    cfg.guildid = interaction.guildid;

    if (cid === "setup:channels") {
      return interaction.showModal(channelsmodal(cfg));
    }
    if (cid === "setup:roles") {
      return interaction.showModal(rolesmodal(cfg));
    }
    if (cid === "setup:security") {
      return interaction.showModal(securitymodal(cfg));
    }
    if (cid === "setup:badwords") {
      return interaction.showModal(badwordsmodal(cfg));
    }
    if (cid === "setup:tickets") {
      const modal = new ModalBuilder().setCustomId("setup:modal:tickets").setTitle("Ticket Setup");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("setup:in:tickethumanrole")
            .setLabel("Ticket Human Role")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Role that can claim tickets")
            .setValue(cfg.tickethumanrole || "")
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("setup:in:ticketcategorykey")
            .setLabel("Category Key")
            .setPlaceholder("e.g. support")
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("setup:in:ticketcategorylabel")
            .setLabel("Category Label")
            .setPlaceholder("e.g. Support")
            .setRequired(false)
        )
      );
      return interaction.showModal(modal);
    }
    if (cid === "setup:close") {
      await interaction.message.delete().catch(() => {});
      const msg = await interaction.reply({ embeds: [makeEmbed("Setup Closed", "Setup panel closed.", colors.primary)], flags: 1 << 6 });
      setTimeout(() => msg.delete().catch(() => {}), 3000);
      return;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("setup:modal:")) {
    const type = interaction.customId.split(":")[2];
    const guildid = interaction.guildid;
    const cfg = get(guildid);

    if (type === "channels") {
      for (const c of channelkeys) {
        const id = extractid(interaction.fields.getTextInputValue(`setup:in:${c.key}`));
        set(guildid, c.key, id || null);
      }
    } else if (type === "roles") {
      for (const r of rolekeys) {
        const raw = interaction.fields.getTextInputValue(`setup:in:${r.key}`);
        if (r.key === "promotionladder") continue;
        const ids = extractroles(raw);
        set(guildid, r.key, ids.length ? ids : null);
      }
    } else if (type === "security") {
      set(guildid, "honeypotchannel", extractid(interaction.fields.getTextInputValue("setup:in:honeypotchannel")) || null);
      set(guildid, "honeypotrole", extractid(interaction.fields.getTextInputValue("setup:in:honeypotrole")) || null);
      set(guildid, "discordsuspendedrole", extractid(interaction.fields.getTextInputValue("setup:in:discordsuspendedrole")) || null);
      const bw = interaction.fields.getTextInputValue("setup:in:badwordenabled");
      b.setenabled(guildid, bw !== "off");
    } else if (type === "badwords") {
      const enabled = interaction.fields.getTextInputValue("setup:in:badwordenabled");
      b.setenabled(guildid, enabled !== "off");
      const exemptraw = interaction.fields.getTextInputValue("setup:in:badwordexempt");
      const exemptids = extractroles(exemptraw);
      const entry = b.load().guilds[String(guildid)] || { enabled: true, words: [], exemptroles: [] };
      entry.exemptroles = exemptids;
      const data = b.load();
      data.guilds[String(guildid)] = entry;
      b.save(data);
    } else if (type === "tickets") {
      const human = extractid(interaction.fields.getTextInputValue("setup:in:tickethumanrole"));
      set(guildid, "tickethumanrole", human || null);
      const key = interaction.fields.getTextInputValue("setup:in:ticketcategorykey");
      const label = interaction.fields.getTextInputValue("setup:in:ticketcategorylabel");
      if (key && label) {
        const cats = (cfg.ticketcategories || {});
        cats[key] = label;
        set(guildid, "ticketcategories", cats);
      }
    }

    const updated = get(guildid);
    await interaction.update({
      embeds: [panelembed(interaction.guild, updated)],
      components: [mainrow()],
    });
  }
}

module.exports.handlesetup = handlesetup;
module.exports.panelembed = panelembed;
module.exports.mainrow = mainrow;
module.exports.channelsmodal = channelsmodal;
module.exports.rolesmodal = rolesmodal;
module.exports.securitymodal = securitymodal;
module.exports.badwordsmodal = badwordsmodal;
module.exports.channelkeys = channelkeys;
module.exports.rolekeys = rolekeys;
module.exports.valueof = valueof;