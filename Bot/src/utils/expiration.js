const { read, write } = require("./storage");

const DURATIONS = {};

async function expirePunishments(client) {
  const cases = read("cases.json", []);
  if (!Array.isArray(cases)) return;
  const now = new Date();
  let changed = false;

  for (const c of cases) {
    if (c.type !== "Infraction") continue;
    if (c.expired || c.voided || c.void) continue;
    if (!c.expires_at) continue;
    const exp = new Date(c.expires_at);
    if (isNaN(exp.getTime()) || exp > now) continue;

    try {
      const guild = client.guilds.cache.get(String(c.guildId));
      if (!guild) continue;
      const member = await guild.members.fetch(String(c.memberId)).catch(() => null);
      if (!member) continue;

      if (c.punishment_role_id) {
        const role = guild.roles.cache.get(String(c.punishment_role_id));
        if (role && member.roles.cache.has(role.id)) {
          await member.roles.remove(role, "Sentinel punishment expired").catch(() => {});
        }
      }

      const toRestore = [];
      const me = guild.members.me;
      for (const rid of c.roles_to_restore || []) {
        const role = guild.roles.cache.get(String(rid));
        if (role && me && role.position < me.roles.highest.position && !role.id === guild.id && !member.roles.cache.has(role.id)) {
          toRestore.push(role);
        }
      }
      if (toRestore.length) {
        await member.roles.add(toRestore, "Sentinel punishment expired").catch(() => {});
      }

      c.expired = true;
      c.expired_at = now.toISOString();
      c.status = "Expired";
      changed = true;
      console.log(`[Sentinel] Expired case #${c.id}`);
    } catch (e) {
      console.error(`[Sentinel] Expiration error for case #${c.id}:`, e.message);
    }
  }

  if (changed) write("cases.json", cases);
}

function startExpirationLoop(client) {
  setInterval(() => {
    expirePunishments(client).catch((e) => console.error(e));
  }, 60000);
}

module.exports = { expirePunishments, startExpirationLoop };