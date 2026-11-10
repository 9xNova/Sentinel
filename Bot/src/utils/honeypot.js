const { read, write } = require("./storage");
const { PermissionFlagsBits } = require("discord.js");
const s = require("./security");
const { makeEmbed, sendlog, colors } = require("./embeds");
const w = require("./warnings");
const { get } = require("./config");

const file = "honeypot.json";

function load() {
  return read(file, { hits: [] });
}

function save(data) {
  write(file, data);
}

function isenabled(guildid) {
  return Boolean(get(guildid).honeypotchannel);
}

function ishoneypotchannel(guildid, channelid) {
  return String(get(guildid).honeypotchannel) === String(channelid);
}

function isstaffmember(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  return false;
}

async function trigger(guild, member, channel, content) {
  const guildid = guild.id;
  const cfg = get(guildid);
  const roleid = cfg.honeypotrole;

  const data = load();
  data.hits.push({
    guildid,
    userid: member.id,
    usertag: member.user.tag,
    channelid: channel.id,
    content: (content || "").slice(0, 400),
    at: new Date().toISOString(),
  });
  save(data);

  let rolenote = "";
  if (roleid) {
    const role =
      guild.roles.cache.get(String(roleid)) ||
      (await guild.roles.fetch(String(roleid)).catch(() => null));
    if (role) {
      try {
        if (!member.roles.cache.has(role.id)) {
          await member.roles.add(role, "Sentinel honeypot trigger");
        }
        rolenote = `\n**Honeypot role:** ${role}`;
      } catch (e) {
        rolenote = "\n**Honeypot role:** could not assign (hierarchy/permissions).";
      }
    }
  }

  let banresult = {};
  try {
    await member.ban({ reason: "Sentinel honeypot softban", deleteMessageSeconds: 86400 });
    await guild.members.unban(member.id, "Sentinel honeypot softban unban");
    banresult = { success: true };
  } catch (e) {
    banresult = { success: false, message: e.message };
  }

  w.add(guildid, member.id, member.user.tag, "Honeypot trigger", "Sentinel", "Sentinel");

  const embed = makeEmbed("Honeypot Triggered", null, colors.danger)
    .setAuthor({
      name: member.user.tag,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "Member", value: `${member.user} (\`${member.id}\`)`, inline: true },
      { name: "Channel", value: channel.toString(), inline: true },
      { name: "Content", value: `\`${(content || "").slice(0, 400)}\``, inline: false },
      { name: "Softban", value: banresult.success ? "Applied" : `Failed: ${banresult.message}`, inline: true },
      { name: "Warning", value: "Added", inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: `${guild.name} | Honeypot Triggered` });

  if (rolenote) embed.addFields({ name: "Honeypot Role", value: rolenote.replace("\n**Honeypot role:** ", ""), inline: true });

  await sendlog(guild, "securitylogchannel", embed).catch(() => {});

  return { ok: true };
}

function listhits(guildid, limit = 25) {
  const data = load();
  return data.hits
    .filter((h) => String(h.guildid) === String(guildid))
    .slice(-limit)
    .reverse();
}

module.exports = {
  load,
  save,
  isenabled,
  ishoneypotchannel,
  isstaffmember,
  trigger,
  listhits,
};