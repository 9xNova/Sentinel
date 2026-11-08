const { PermissionFlagsBits } = require("discord.js");
const { read, write } = require("./storage");

const FILE = "badwords.json";

// Lowercase and fold accents. Digits and punctuation are left alone so they
// can act as decoys between and inside letters.
function normalize(text) {
  let s = String(text).toLowerCase();
  if (s.normalize) s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return s;
}

function lettersOnly(text) {
  return normalize(text).replace(/[^a-z]/g, "");
}

// Symbols people drop in place of a letter: f@ck, f*ck, b!tch, s|in...
const DECOYS = "@$!*|+";

// A word matches when its letters show up in order, with a digit or decoy
// symbol allowed where a letter should be ("f4ck") and any other non-letter
// allowed in between ("f u c k", "f.u.c.k"). Patterns are cached per word.
const patterns = new Map();
function patternFor(word) {
  let re = patterns.get(word);
  if (!re) {
    const body = word
      .split("")
      .map((ch) => `(?:${ch}|[0-9]|[${DECOYS}])[^a-z0-9]*`)
      .join("");
    re = new RegExp(body);
    patterns.set(word, re);
  }
  return re;
}

function uniqWords(list) {
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
  const data = read(FILE, {});
  const out = { shared: [], guilds: {} };

  // Old shape: a plain array of words.
  out.shared = uniqWords(Array.isArray(data) ? data : data.shared);

  const guilds =
    !Array.isArray(data) && data.guilds && typeof data.guilds === "object"
      ? data.guilds
      : {};
  for (const [id, guild] of Object.entries(guilds)) {
    if (!guild || typeof guild !== "object") continue;
    out.guilds[id] = {
      enabled: guild.enabled !== false,
      words: uniqWords(guild.words),
      exemptRoles: Array.isArray(guild.exemptRoles)
        ? guild.exemptRoles.map(String)
        : [],
    };
  }
  return out;
}

function save(data) {
  write(FILE, data);
}

function entryFor(data, guildId) {
  const key = String(guildId);
  if (!data.guilds[key]) {
    data.guilds[key] = { enabled: true, words: [], exemptRoles: [] };
  }
  return data.guilds[key];
}

// What this server sees: its own words plus the shared list.
function get(guildId) {
  const data = load();
  const entry = data.guilds[String(guildId)];
  return {
    enabled: !entry || entry.enabled !== false,
    words: entry ? [...entry.words] : [],
    shared: [...data.shared],
    exemptRoles: entry ? [...entry.exemptRoles] : [],
  };
}

function add(guildId, word) {
  const clean = String(word || "").trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Give me a word to add." };
  if (clean.length > 64) return { ok: false, error: "That is too long to filter." };
  if (lettersOnly(clean).length < 2) {
    return { ok: false, error: "It needs at least two letters to be worth filtering." };
  }

  const data = load();
  const entry = entryFor(data, guildId);
  const key = clean.toLowerCase();
  const taken =
    data.shared.some((w) => w.toLowerCase() === key) ||
    entry.words.some((w) => w.toLowerCase() === key);
  if (taken) return { ok: false, error: `\`${clean}\` is already on the filter.` };

  entry.words.push(clean);
  save(data);
  return { ok: true, word: clean };
}

function remove(guildId, word) {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return { ok: false, error: "Give me a word to remove." };

  const data = load();
  const entry = data.guilds[String(guildId)];
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

function clear(guildId) {
  const data = load();
  const entry = data.guilds[String(guildId)];
  if (!entry || !entry.words.length) return 0;
  const count = entry.words.length;
  entry.words = [];
  save(data);
  return count;
}

function setEnabled(guildId, enabled) {
  const data = load();
  const entry = entryFor(data, guildId);
  entry.enabled = Boolean(enabled);
  save(data);
  return entry.enabled;
}

function addExempt(guildId, roleId) {
  const id = String(roleId);
  const data = load();
  const entry = entryFor(data, guildId);
  if (entry.exemptRoles.includes(id)) {
    return { ok: false, error: "That role is already exempt." };
  }
  entry.exemptRoles.push(id);
  save(data);
  return { ok: true, roleId: id };
}

function removeExempt(guildId, roleId) {
  const id = String(roleId);
  const data = load();
  const entry = data.guilds[String(guildId)];
  if (!entry) return { ok: false, error: "That role is not exempt." };
  const index = entry.exemptRoles.indexOf(id);
  if (index < 0) return { ok: false, error: "That role is not exempt." };
  entry.exemptRoles.splice(index, 1);
  save(data);
  return { ok: true, roleId: id };
}

// Returns the matched word, or null when the message is fine.
function check(guildId, content, member) {
  const data = load();
  const entry = data.guilds[String(guildId)];

  if (entry && entry.enabled === false) return null;

  if (member) {
    if (member.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return null;
    if (
      entry?.exemptRoles?.length &&
      member.roles?.cache &&
      entry.exemptRoles.some((id) => member.roles.cache.has(id))
    ) {
      return null;
    }
  }

  const haystack = normalize(content || "");
  if (!haystack) return null;

  for (const word of [...data.shared, ...(entry?.words || [])]) {
    const needle = lettersOnly(word);
    if (needle.length < 2) continue;
    if (patternFor(needle).test(haystack)) return word;
  }
  return null;
}

module.exports = {
  add,
  remove,
  clear,
  setEnabled,
  addExempt,
  removeExempt,
  get,
  check,
};