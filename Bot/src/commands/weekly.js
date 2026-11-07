const { SlashCommandBuilder } = require("discord.js");
const { makeEmbed } = require("../utils/embeds");
const { get } = require("../utils/config");
const { read } = require("../utils/storage");

const WEEKLY_QUOTA = 100;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("weekly")
      .setDescription("Weekly staff activity")
      .addSubcommand((s) => s.setName("quota").setDescription("View the weekly message quota leaderboard")),
    async execute(i) {
      const guild = i.guild;
      const cfg = get(guild.id);
      const quotaRoleId = cfg.weekly_quota_role;
      if (!quotaRoleId) {
        return i.reply({ content: "The weekly quota role has not been configured.", ephemeral: true });
      }
      const role = await guild.roles.fetch(String(quotaRoleId)).catch(() => null);
      if (!role) {
        return i.reply({ content: "The configured weekly quota role no longer exists.", ephemeral: true });
      }

      const members = role.members.filter((m) => !m.user.bot);
      const sorted = [...members.values()].sort((a, b) => {
        const ca = getWeeklyCount(guild.id, a.id);
        const cb = getWeeklyCount(guild.id, b.id);
        return cb - ca;
      });

      const e = makeEmbed("Weekly Staff Quota", `Required messages: **${WEEKLY_QUOTA}**`);
      if (!sorted.length) {
        e.setDescription(`Required messages: **${WEEKLY_QUOTA}**\n\nNo members currently have the quota role.`);
      } else {
        const lines = sorted.slice(0, 20).map((m, idx) => {
          const count = getWeeklyCount(guild.id, m.id);
          const status = count >= WEEKLY_QUOTA ? "Complete" : "In progress";
          return `**${idx + 1}.** ${m} — \`${count}/${WEEKLY_QUOTA}\` — ${status}`;
        });
        e.addFields({ name: "Leaderboard", value: lines.join("\n"), inline: false });
      }

      return i.reply({ embeds: [e], ephemeral: true });
    },
  },
];

function getWeeklyCount(guildId, memberId) {
  const data = read("weekly-quota.json", {});
  const week = getWeekStart();
  const key = `${guildId}:${memberId}:${week}`;
  return data[key] || 0;
}

function getWeekStart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}