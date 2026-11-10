const mongoose = require("mongoose");
const { enablemongo } = require("./storage");
const { warn, log } = require("./logger");

async function connectmongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    warn("MONGO_URI not set, skipping Mongo connection.");
    return false;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    await enablemongo();
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    throw error;
  }

  log("Connected to MongoDB.");
  return true;
}

module.exports = { connectmongo, mongoose };