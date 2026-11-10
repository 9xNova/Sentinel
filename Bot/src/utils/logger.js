const timestamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function log(...args) {
  console.log(`[${timestamp()}] [INFO]`, ...args);
}

function warn(...args) {
  console.warn(`[${timestamp()}] [WARN]`, ...args);
}

function error(...args) {
  console.error(`[${timestamp()}] [ERROR]`, ...args);
}

function debug(...args) {
  if (process.env.DEBUG === "true") {
    console.log(`[${timestamp()}] [DEBUG]`, ...args);
  }
}

module.exports = { log, warn, error, debug, timestamp };