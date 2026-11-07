const { read, write } = require("./storage");

function load() {
  return read("security_suspensions.json", {});
}

function save(data) {
  write("security_suspensions.json", data);
}

function get(guildId, memberId) {
  const data = load();
  return data[String(guildId)]?.[String(memberId)] || null;
}

function saveRecord(guildId, memberId, roles, reason, actorId) {
  const data = load();
  if (!data[String(guildId)]) data[String(guildId)] = {};
  data[String(guildId)][String(memberId)] = {
    roles,
    reason,
    actorId: String(actorId),
    createdAt: new Date().toISOString(),
  };
  save(data);
}

function removeRecord(guildId, memberId) {
  const data = load();
  if (data[String(guildId)]) {
    delete data[String(guildId)][String(memberId)];
    if (Object.keys(data[String(guildId)]).length === 0) delete data[String(guildId)];
  }
  save(data);
}

function botCanManageRole(guild, role) {
  const me = guild.members.me;
  if (!me) return false;
  if (role.position >= me.roles.highest.position) return false;
  return true;
}

async function applySecuritySuspension(member, actor, reason) {
  const guild = member.guild;
  const { get: getCfg } = require("./config");
  const cfg = getCfg(guild.id);
  const suspendedRoleId = cfg.discord_suspended_role;
  if (!suspendedRoleId) return { success: false, message: "The Discord Suspended role has not been configured." };
  const suspendedRole = guild.roles.cache.get(String(suspendedRoleId)) || await guild.roles.fetch(String(suspendedRoleId)).catch(() => null);
  if (!suspendedRole) return { success: false, message: "The configured Discord Suspended role no longer exists." };
  if (!botCanManageRole(guild, suspendedRole)) return { success: false, message: "I cannot manage the Discord Suspended role." };

  const originalRoles = member.roles.cache
    .filter((r) => r.id !== guild.id && r.id !== suspendedRole.id)
    .map((r) => r.id);

  saveRecord(guild.id, member.id, originalRoles, reason, actor.id);

  const removable = member.roles.cache.filter((r) => r.id !== guild.id && r.id !== suspendedRole.id && botCanManageRole(guild, r));
  try {
    if (removable.size) await member.roles.remove([...removable.values()], `Sentinel security suspension: ${reason}`);
    if (!member.roles.cache.has(suspendedRole.id)) await member.roles.add(suspendedRole, `Sentinel security suspension: ${reason}`);
  } catch (e) {
    return { success: false, message: "Discord rejected the role update. Check the bot's role hierarchy." };
  }
  return { success: true, message: "Member suspended successfully." };
}

async function restoreSecuritySuspension(member, actor) {
  const guild = member.guild;
  const record = get(guild.id, member.id);
  if (!record) return { success: false, message: "No saved suspension record was found." };

  const { get: getCfg } = require("./config");
  const cfg = getCfg(guild.id);
  const suspendedRoleId = cfg.discord_suspended_role;
  if (suspendedRoleId) {
    const suspendedRole = guild.roles.cache.get(String(suspendedRoleId));
    if (suspendedRole && member.roles.cache.has(suspendedRole.id)) {
      try { await member.roles.remove(suspendedRole, `Sentinel unsuspension by ${actor}`); }
      catch (e) { return { success: false, message: "I couldn't remove the Discord Suspended role." }; }
    }
  }

  let restored = 0;
  const skipped = [];
  for (const rid of record.roles || []) {
    const role = guild.roles.cache.get(String(rid));
    if (!role) { skipped.push(`Role \`${rid}\` no longer exists.`); continue; }
    if (member.roles.cache.has(role.id)) continue;
    if (!botCanManageRole(guild, role)) { skipped.push(`Cannot manage ${role.name}.`); continue; }
    try { await member.roles.add(role, `Sentinel unsuspension by ${actor}`); restored++; }
    catch (e) { skipped.push(`Could not restore ${role.name}.`); }
  }

  if (skipped.length) {
    record.pending_roles = (record.roles || []).filter((rid) => {
      const role = guild.roles.cache.get(String(rid));
      return !role || !member.roles.cache.has(role.id);
    });
    record.last_restore_attempt = new Date().toISOString();
    const data = load();
    if (!data[String(guild.id)]) data[String(guild.id)] = {};
    data[String(guild.id)][String(member.id)] = record;
    save(data);
    return { success: true, message: `Restored ${restored} role(s). Some roles still need attention: ${skipped.join(" ")}` };
  }

  removeRecord(guild.id, member.id);
  return { success: true, message: `Successfully restored ${restored} role(s).` };
}

module.exports = { load, save, get, saveRecord, removeRecord, botCanManageRole, applySecuritySuspension, restoreSecuritySuspension };