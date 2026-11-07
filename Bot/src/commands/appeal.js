const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { get } = require("../utils/config");
const { canReviewAppeals } = require("../utils/permissions");
const { read, write } = require("../utils/storage");
const { makeEmbed } = require("../utils/embeds");

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("appeal")
      .setDescription("Submit an appeal for a staff case")
      .addIntegerOption((o) =>
        o.setName("case_id").setDescription("Case number").setRequired(true)
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
        caseId: i.options.getInteger("case_id"),
        message: i.options.getString("message"),
        status: "pending",
      };
      rows.push(a);
      write("appeals.json", rows);

      const id = get(i.guildId).appeal_approval_channel;
      const channel = id
        ? await i.guild.channels.fetch(String(id)).catch(() => null)
        : null;

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
              `**Case:** #${a.caseId}\n**User:** <@${a.userId}>\n**Appeal:** ${a.message}`
            ),
          ],
          components: [buttons],
        });
      }

      return i.reply({
        content: "Your appeal has been submitted.",
        ephemeral: true,
      });
    },
  },
];

async function handleAppeal(i) {
  if (!i.isButton() || !i.customId.startsWith("appeal:")) return;

  if (!canReviewAppeals(i.member)) {
    return i.reply({
      content: "You cannot review appeals.",
      ephemeral: true,
    });
  }

  const [, action, id] = i.customId.split(":");
  const rows = read("appeals.json", []);
  const a = rows.find((x) => x.id === id);

  if (!a || a.status !== "pending") {
    return i.reply({
      content: "Appeal is no longer pending.",
      ephemeral: true,
    });
  }

  a.status = action === "accept" ? "accepted" : "denied";
  a.reviewedBy = i.user.id;
  write("appeals.json", rows);

  return i.update({
    embeds: [
      makeEmbed(
        `Appeal ${a.status}`,
        `Appeal for case #${a.caseId} was ${a.status} by ${i.user}.`
      ),
    ],
    components: [],
  });
}

module.exports.handleAppeal = handleAppeal;