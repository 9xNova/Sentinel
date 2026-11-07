const { read, write } = require("../utils/storage");
const W = require("../utils/warnings");

module.exports = (client) =>
  client.on("messageCreate", (message) => {
    if (message.author.bot || !message.guild) return;

    try {
      // Bad-word filter
      const badwords = read("badwords.json", []);
      const content = (message.content || "").toLowerCase();
      if (Array.isArray(badwords) && badwords.some((w) => content.includes(String(w).toLowerCase()))) {
        message.delete().catch(() => {});
        message.channel
          .send(`${message.author}, your message contained a prohibited word and was removed.`)
          .then((m) => setTimeout(() => m.delete().catch(() => {}), 5000))
          .catch(() => {});
        W.add(message.guild.id, message.author.id, message.author.tag, "Bad word filter", client.user.id, "Sentinel");
        return;
      }

      const week = new Date();
      week.setUTCHours(0, 0, 0, 0);
      week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));

      const key = `${message.guild.id}:${message.author.id}:${week
        .toISOString()
        .slice(0, 10)}`;

      const data = read("weekly-quota.json", {});
      data[key] = (data[key] || 0) + 1;
      write("weekly-quota.json", data);
    } catch (error) {
      console.error("Failed to process message:", error);
    }
  });