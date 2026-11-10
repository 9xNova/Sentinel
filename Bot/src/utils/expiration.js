const { read, write } = require("./storage");
const { log, error } = require("./logger");

const durations = {};

async function expirerpunishments(client) {
  const cases = read("cases.json", []);
  if (!Array.isArray(cases)) return;
  const now = new Date();
  let changed = false;

  for (const c of cases) {
    if (c.type !== "Infraction") continue;
    if (c.expired || c.voided || c.void) continue;
    if (!c.expiresat) continue;
    const exp = new Date(c.expiresat);
    if (isNaN(exp.getTime()) || exp > now) continue;

    try {
      const guild = client.guilds.cache.get(String(c.guildid));
      if (!guild) continue;
      const member = await guild.members.fetch(String(c.memberid)).catch(() => null);
      if (!member) continue;

      if (c.punishmentroleid) {
        const role = guild.roles.cache.get(String(c.punishmentroleid));
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role, "Sentinel punishment expired").catch(() => {});
        }
      }

      const torestore = [];
      const me = guild.members.me;
      for (const rid of c.rolestorerestore || []) {
        const role = guild.roles.cache.get(String(rid));
        if (role && me && role.position < me.roles.highest.position && role.id !== guild.id && !member.roles.cache.has(role.id)) {
          torestore.push(role);
        }
      }
      if (torestore.length) {
        await member.roles.add(torestore, "Sentinel punishment expired").catch(() => {});
      }

      c.expired = true;
      c.expiredat = now.toISOString();
      c.status = "Expired";
      changed = true;
      log(`Expired case #${c.id}`);
    } catch (e) {
      error(`Expiration error for case #${c.id}:`, e.message);
    }
  }

  if (changed) write("cases.json", cases);
}

function startexpirationloop(client) {
  setInterval(() => {
    expirerpunishments(client).catch((e) => error(e));
  }, 60000);
}

module.exports = { expirerpunishments, startexpirationloop };