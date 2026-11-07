require("dotenv").config();
const {Client,GatewayIntentBits,Partials,Collection}=require("discord.js");
const commands=require("./commands");
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent],partials:[Partials.Channel,Partials.Message,Partials.User]});
client.commands=new Collection(commands.map(c=>[c.data.name,c]));
require("./events/ready")(client);
require("./events/messageCreate")(client);
require("./events/interactionCreate")(client);
if(!process.env.DISCORD_TOKEN){console.error("DISCORD_TOKEN is missing from .env");process.exit(1);}
client.login(process.env.DISCORD_TOKEN);