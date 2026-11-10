const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { get } = require("../utils/config");
const { canReviewAppeals } = require("../utils/permissions");
const { read, write } = require("../utils/storage");
const { makeEmbed } = require("../utils/embeds");

const flagsephemeral = 1 << 6;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("appeal")
      .setDescription("Submit an appeal for a staff case")
      .addIntegerOption((o) =>
        o.setName("caseid").setDescription("Case number").setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("message")
          .setDescription("Why should this case be reviewed?")
          .setRequired(true)
      ),
    async execute(i) {
      const rows = read("appeals.json", []);
      const a = {
        id: Date.now().toString(),
        guildId: i.guildId,
        userId: i.user.id,
        caseid: i.options.getInteger("caseid"),
        message: i.options.getString("message"),
        status: "pending",
      };
      rows.push(a);
      write("appeals.json", rows);

      const id = get(i.guildId).appealapprovalchannel;
      const channel = id ? await i.guild.channels.fetch(String(id)).catch(() => null) : null;

      if (channel?.isTextBased()) {
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal:accept:${a.id}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`appeal:deny:${a.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
        );

        await channel.send({
          embeds: [
            makeEmbed(
              "Staff Appeal",
              `**Case:** #${a.caseid}\n**User:** <@${a.userId}>\n**Appeal:** ${a.message}`,
              0x0F172A
            ),
          ],
          components: [buttons],
        });
      }

      return i.reply({ embeds: [makeEmbed("Appeal Submitted", "Your appeal has been submitted.", 0x10B981)], flags: flagsephemeral });
    },
  },
];

async function handleappeal(i) {
  if (!i.isButton() || !i.customId.startsWith("appeal:")) return;

  if (!canReviewAppeals(i.member)) {
    return i.reply({ embeds: [makeEmbed("Error", "You cannot review appeals.", 0xEF4444)], flags: flagsephemeral });
  }

  const [, action, id] = i.customId.split(":");
  const rows = read("appeals.json", []);
  const a = rows.find((x) => x.id === id);

  if (!a || a.status !== "pending") {
    return i.reply({ embeds: [makeEmbed("Error", "Appeal is no longer pending.", 0xEF4444)], flags: flagsephemeral });
  }

  a.status = action === "accept" ? "accepted" : "denied";
  a.reviewedBy = i.user.id;
  write("appeals.json", rows);

  return i.update({
    embeds: [
      makeEmbed(
        `Appeal ${a.status}`,
        `Appeal for case #${a.caseid} was ${a.status} by ${i.user}.`,
        action === "accept" ? 0x10B981 : 0xEF4444
      ),
    ],
    components: [],
  });
}

module.exports.handleappeal = handleappeal;