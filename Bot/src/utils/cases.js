const { read, write } = require("./storage");

function all() {
  return read("cases.json", []);
}

function create(type, member, actor, reason, details = "", extra = {}) {
  const rows = all();
  const id = rows.reduce((n, x) => Math.max(n, Number(x.id) || 0), 0) + 1;
  const item = {
    id,
    type,
    guildid: member.guild.id,
    memberid: member.id,
    membertag: member.user.tag,
    actorid: actor.id,
    actortag: actor.tag || actor.user?.tag || "Unknown",
    reason,
    details,
    createdat: new Date().toISOString(),
    voided: false,
    ...extra,
  };
  rows.push(item);
  write("cases.json", rows);
  return item;
}

function find(id, guildid) {
  return all().find(
    (x) => String(x.id) === String(id) && String(x.guildid) === String(guildid)
  );
}

function update(id, guildid, patch) {
  const rows = all();
  const index = rows.findIndex(
    (x) => String(x.id) === String(id) && String(x.guildid) === String(guildid)
  );
  if (index < 0) return null;
  rows[index] = { ...rows[index], ...patch };
  write("cases.json", rows);
  return rows[index];
}

module.exports = { all, create, find, update };