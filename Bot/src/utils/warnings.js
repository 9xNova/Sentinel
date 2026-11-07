const { read, write } = require("./storage");

function all() {
  return read("warnings.json", []);
}

function forUser(guildId, userId) {
  return all().filter(
    (x) => String(x.guildId) === String(guildId) && String(x.userId) === String(userId)
  );
}

function add(guildId, userId, userTag, reason, moderatorId, moderatorTag) {
  const rows = all();
  const id = rows.reduce((n, x) => Math.max(n, Number(x.id) || 0), 0) + 1;
  const item = {
    id,
    guildId: String(guildId),
    userId: String(userId),
    userTag,
    reason,
    moderatorId: String(moderatorId),
    moderatorTag,
    createdAt: new Date().toISOString(),
  };
  rows.push(item);
  write("warnings.json", rows);
  return item;
}

function remove(id, guildId) {
  const rows = all();
  const index = rows.findIndex(
    (x) => String(x.id) === String(id) && String(x.guildId) === String(guildId)
  );
  if (index < 0) return null;
  const removed = rows.splice(index, 1)[0];
  write("warnings.json", rows);
  return removed;
}

function removeAll(guildId, userId) {
  const rows = all();
  const kept = rows.filter(
    (x) => !(String(x.guildId) === String(guildId) && String(x.userId) === String(userId))
  );
  const removedCount = rows.length - kept.length;
  write("warnings.json", kept);
  return removedCount;
}

module.exports = { all, forUser, add, remove, removeAll };