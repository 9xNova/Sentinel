const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "../../data");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read(name, fallback = {}) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed === null ? structuredClone(fallback) : parsed;
  } catch {
    return structuredClone(fallback);
  }
}

function write(name, value) {
  ensureDir();
  const file = path.join(DATA_DIR, name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

module.exports = { read, write };