require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");

const { log, warn, error } = require("./utils/logger");

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

const { startexpirationloop } = require("./utils/expiration");
client.once("clientReady", () => startexpirationloop(client));

const { connectmongo } = require("./utils/db");

process.on("unhandledRejection", (err) => {
  error("Unhandled rejection:", err);
});

if (!process.env.DISCORD_TOKEN) {
  error("DISCORD_TOKEN is missing from .env");
  process.exit(1);
}

connectmongo()
  .catch((err) => error("Mongo connection failed:", err.message))
  .finally(() => {
    client.login(process.env.DISCORD_TOKEN).catch((err) => {
      error("Failed to log in:", err);
      process.exit(1);
    });
  });