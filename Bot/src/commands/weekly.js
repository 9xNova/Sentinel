const { SlashCommandBuilder } = require("discord.js");
const { makeEmbed } = require("../utils/embeds");
const { get } = require("../utils/config");
const { read } = require("../utils/storage");

const flagsephemeral = 1 << 6;

const weeklyquota = 100;

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName("weekly")
      .setDescription("Weekly staff activity")
      .addSubcommand((s) => s.setName("quota").setDescription("View the weekly message quota leaderboard")),
    async execute(i) {
      const guild = i.guild;
      const cfg = get(guild.id);
      const quotoroleid = cfg.weeklyquotorole;
      if (!quotoroleid) {
        return i.reply({ embeds: [makeEmbed("Error", "The weekly quota role has not been configured.", 0xEF4444)], flags: flagsephemeral });
      }
      const role = await guild.roles.fetch(String(quotoroleid)).catch(() => null);
      if (!role) {
        return i.reply({ embeds: [makeEmbed("Error", "The configured weekly quota role no longer exists.", 0xEF4444)], flags: flagsephemeral });
      }

      const members = role.members.filter((m) => !m.user.bot);
      const sorted = [...members.values()].sort((a, b) => {
        const ca = getweeklycount(guild.id, a.id);
        const cb = getweeklycount(guild.id, b.id);
        return cb - ca;
      });

      const e = makeEmbed("Weekly Staff Quota", `Required messages: **${weeklyquota}**`);
      if (!sorted.length) {
        e.setDescription(`Required messages: **${weeklyquota}**\n\nNo members currently have the quota role.`);
      } else {
        const lines = sorted.slice(0, 20).map((m, idx) => {
          const count = getweeklycount(guild.id, m.id);
          const status = count >= weeklyquota ? "Complete" : "In progress";
          return `**${idx + 1}.** ${m} - \`${count}/${weeklyquota}\` - ${status}`;
        });
        e.addFields({ name: "Leaderboard", value: lines.join("\n"), inline: false });
      }

      return i.reply({ embeds: [e], flags: flagsephemeral });
    },
  },
];

function getweeklycount(guildid, memberid) {
  const data = read("weeklyquota.json", {});
  const week = getweekstart();
  const key = `${guildid}:${memberid}:${week}`;
  return data[key] || 0;
}

function getweekstart() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}