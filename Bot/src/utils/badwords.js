const { PermissionFlagsBits } = require("discord.js");
const { read, write } = require("./storage");

const file = "badwords.json";

function normalize(text) {
  let s = String(text).toLowerCase();
  if (s.normalize) s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return s;
}

function lettersOnly(text) {
  return normalize(text).replace(/[^a-z]/g, "");
}

const decoys = "@$!*|+";

const patterns = new Map();
function patternfor(word) {
  let re = patterns.get(word);
  if (!re) {
    const body = word
      .split("")
      .map((ch) => `(?:${ch}|[0-9]|[${decoys}])[^a-z0-9]*`)
      .join("");
    re = new RegExp(`\\b${body}\\b`);
    patterns.set(word, re);
  }
  return re;
}

function uniqwords(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const word = String(item).trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

function load() {
  const data = read(file, {});
  const out = { shared: [], guilds: {} };

  out.shared = uniqwords(Array.isArray(data) ? data : data.shared);

  const guilds =
    !Array.isArray(data) && data.guilds && typeof data.guilds === "object"
      ? data.guilds
      : {};
  for (const [id, guild] of Object.entries(guilds)) {
    if (!guild || typeof guild !== "object") continue;
    out.guilds[id] = {
      enabled: guild.enabled !== false,
      words: uniqwords(guild.words),
      exemptroles: Array.isArray(guild.exemptroles)
        ? guild.exemptroles.map(String)
        : [],
    };
  }
  return out;
}

function save(data) {
  write(file, data);
}

function entryfor(data, guildid) {
  const key = String(guildid);
  if (!data.guilds[key]) {
    data.guilds[key] = { enabled: true, words: [], exemptroles: [] };
  }
  return data.guilds[key];
}

function get(guildid) {
  const data = load();
  const entry = data.guilds[String(guildid)];
  return {
    enabled: !entry || entry.enabled !== false,
    words: entry ? [...entry.words] : [],
    shared: [...data.shared],
    exemptroles: entry ? [...entry.exemptroles] : [],
  };
}

function add(guildid, word) {
  const clean = String(word || "").trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Give me a word to add." };
  if (clean.length > 64) return { ok: false, error: "That is too long to filter." };
  if (lettersOnly(clean).length < 2) {
    return { ok: false, error: "It needs at least two letters to be worth filtering." };
  }

  const data = load();
  const entry = entryfor(data, guildid);
  const key = clean.toLowerCase();
  const taken =
    data.shared.some((w) => w.toLowerCase() === key) ||
    entry.words.some((w) => w.toLowerCase() === key);
  if (taken) return { ok: false, error: `\`${clean}\` is already on the filter.` };

  entry.words.push(clean);
  save(data);
  return { ok: true, word: clean };
}

function remove(guildid, word) {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return { ok: false, error: "Give me a word to remove." };

  const data = load();
  const entry = data.guilds[String(guildid)];
  if (entry) {
    const index = entry.words.findIndex((w) => w.toLowerCase() === key);
    if (index >= 0) {
      const [removed] = entry.words.splice(index, 1);
      save(data);
      return { ok: true, word: removed, scope: "server" };
    }
  }

  const sharedIndex = data.shared.findIndex((w) => w.toLowerCase() === key);
  if (sharedIndex >= 0) {
    const [removed] = data.shared.splice(sharedIndex, 1);
    save(data);
    return { ok: true, word: removed, scope: "shared" };
  }

  return { ok: false, error: `\`${word}\` is not on the filter.` };
}

function clear(guildid) {
  const data = load();
  const entry = data.guilds[String(guildid)];
  if (!entry || !entry.words.length) return 0;
  const count = entry.words.length;
  entry.words = [];
  save(data);
  return count;
}

function setenabled(guildid, enabled) {
  const data = load();
  const entry = entryfor(data, guildid);
  entry.enabled = Boolean(enabled);
  save(data);
  return entry.enabled;
}

function addexempt(guildid, roleid) {
  const id = String(roleid);
  const data = load();
  const entry = entryfor(data, guildid);
  if (entry.exemptroles.includes(id)) {
    return { ok: false, error: "That role is already exempt." };
  }
  entry.exemptroles.push(id);
  save(data);
  return { ok: true, roleid: id };
}

function removeexempt(guildid, roleid) {
  const id = String(roleid);
  const data = load();
  const entry = entryfor(data, guildid);
  if (!entry) return { ok: false, error: "That role is not exempt." };
  const index = entry.exemptroles.indexOf(id);
  if (index < 0) return { ok: false, error: "That role is not exempt." };
  entry.exemptroles.splice(index, 1);
  save(data);
  return { ok: true, roleid: id };
}

function check(guildid, content, member) {
  const data = load();
  const entry = data.guilds[String(guildid)];

  if (entry && entry.enabled === false) return null;

  if (member) {
    if (member.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return null;
    if (
      entry?.exemptroles?.length &&
      member.roles?.cache &&
      entry.exemptroles.some((id) => member.roles.cache.has(id))
    ) {
      return null;
    }
  }

  const haystack = normalize(content || "");
  if (!haystack) return null;

  for (const word of [...data.shared, ...(entry?.words || [])]) {
    const needle = lettersOnly(word);
    if (needle.length < 2) continue;
    if (patternfor(needle).test(haystack)) return word;
  }
  return null;
}

module.exports = {
  add,
  remove,
  clear,
  setenabled,
  addexempt,
  removeexempt,
  get,
  check,
};