const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");

const DATA_DIR = path.resolve(__dirname, "../../data");

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed },
  },
  { minimize: false }
);
const Doc = mongoose.models.KeyValue || mongoose.model("KeyValue", schema);

// Everything lives in here while the database is up, so callers can keep
// using read()/write() synchronously.
const cache = new Map();
const queue = new Map();
let mongoReady = false;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function readFile(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed === null ? structuredClone(fallback) : parsed;
  } catch {
    return structuredClone(fallback);
  }
}

function writeFile(name, value) {
  const file = path.join(DATA_DIR, name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function persist(key) {
  const next = (queue.get(key) || Promise.resolve())
    .then(() =>
      Doc.updateOne(
        { key },
        { $set: { key, value: cache.get(key) } },
        { upsert: true }
      )
    )
    .catch((err) => console.error(`db write failed for ${key}:`, err.message));
  queue.set(key, next);
}

// Pull every stored document into memory. On the first run the local JSON
// files are moved over so existing data is not left behind.
async function enableMongo() {
  const docs = await Doc.find({}).lean();
  for (const doc of docs) cache.set(doc.key, doc.value);

  if (!docs.length) {
    let imported = 0;
    const files = fs.existsSync(DATA_DIR)
      ? fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"))
      : [];
    for (const name of files) {
      let value;
      try {
        value = JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
      } catch {
        continue;
      }
      if (value === null) continue;
      cache.set(name, value);
      imported++;
    }
    for (const key of [...cache.keys()]) persist(key);
    await Promise.all([...queue.values()]);
    if (imported) console.log(`Imported ${imported} local data file(s) into Mongo.`);
  }

  mongoReady = true;

  // Writes are queued in memory, so give them a moment to land on shutdown.
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
  return readFile(name, fallback);
}

function write(name, value) {
  if (mongoReady) {
    cache.set(name, clone(value));
    persist(name);
    return;
  }
  ensureDir();
  writeFile(name, value);
}

// Wait for any queued writes before the process goes away.
async function flush() {
  await Promise.all([...queue.values()]);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { read, write, enableMongo, flush };