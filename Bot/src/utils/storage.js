const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const { log, error } = require("./logger");

const datadir = path.resolve(__dirname, "../../data");

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { minimize: false }
);
const doc = mongoose.models.KeyValue || mongoose.model("KeyValue", schema);
const cache = new Map();
const queue = new Map();
let mongoReady = false;

function ensureDir() {
  fs.mkdirSync(datadir, { recursive: true });
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function readfile(name, fallback) {
  const file = path.join(datadir, name);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed === null ? structuredClone(fallback) : parsed;
  } catch {
    return structuredClone(fallback);
  }
}

function writefile(name, value) {
  const file = path.join(datadir, name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function persist(key) {
  const next = (queue.get(key) || Promise.resolve())
    .then(() =>
      doc.updateOne(
        { key },
        { $set: { key, value: cache.get(key) } },
        { upsert: true }
      )
    )
    .catch((err) => error(`db write failed for ${key}:`, err.message));
  queue.set(key, next);
}

async function enablemongo() {
  const docs = await doc.find({}).lean();
  for (const doc of docs) cache.set(doc.key, doc.value);

  if (!docs.length) {
    let imported = 0;
    const files = fs.existsSync(datadir)
      ? fs.readdirSync(datadir).filter((f) => f.endsWith(".json"))
      : [];
    for (const name of files) {
      let value;
      try {
        value = JSON.parse(fs.readFileSync(path.join(datadir, name), "utf8"));
      } catch {
        continue;
      }
      if (value === null) continue;
      cache.set(name, value);
      imported++;
    }
    for (const key of [...cache.keys()]) persist(key);
    await Promise.all([...queue.values()]);
    if (imported) log(`Imported ${imported} local data file(s) into Mongo.`);
  }

  mongoReady = true;

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      Promise.race([flush(), delay(2000)])
        .catch(() => {})
        .finally(() => process.exit(0));
    });
  }
}

function read(name, fallback = {}) {
  if (mongoReady) {
    if (!cache.has(name)) return structuredClone(fallback);
    return clone(cache.get(name));
  }
  ensureDir();
  return readfile(name, fallback);
}

function write(name, value) {
  if (mongoReady) {
    cache.set(name, clone(value));
    persist(name);
    return;
  }
  ensureDir();
  writefile(name, value);
}

async function flush() {
  await Promise.all([...queue.values()]);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { read, write, enablemongo, flush };