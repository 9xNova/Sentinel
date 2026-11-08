const mongoose = require("mongoose");
const { enableMongo } = require("./storage");

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("MONGO_URI not set, skipping Mongo connection.");
    return false;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  try {
    await enableMongo();
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    throw error;
  }

  console.log("Connected to MongoDB.");
  return true;
}

module.exports = { connectMongo, mongoose };