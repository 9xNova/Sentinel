require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");

const commands = require("./commands");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

client.commands = new Collection(commands.map((c) => [c.data.name, c]));

require("./events/ready")(client);
require("./events/messageCreate")(client);
require("./events/interactionCreate")(client);
require("./events/logging")(client);

const { startExpirationLoop } = require("./utils/expiration");
client.once("ready", () => startExpirationLoop(client));

const { connectMongo } = require("./utils/db");

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN is missing from .env");
  process.exit(1);
}

// Connect to the database first so no command runs against empty storage.
connectMongo()
  .catch((error) => console.error("Mongo connection failed:", error.message))
  .finally(() => {
    client.login(process.env.DISCORD_TOKEN).catch((error) => {
      console.error("Failed to log in:", error);
      process.exit(1);
    });
  });