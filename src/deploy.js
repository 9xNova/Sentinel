require("dotenv").config();
const {REST,Routes}=require("discord.js");
const commands=require("./commands");
(async()=>{if(!process.env.DISCORD_TOKEN||!process.env.CLIENT_ID)throw new Error("Set DISCORD_TOKEN and CLIENT_ID in .env");const rest=new REST({version:"10"}).setToken(process.env.DISCORD_TOKEN);await rest.put(Routes.applicationCommands(process.env.CLIENT_ID),{body:commands.map(c=>c.data.toJSON())});console.log(`Registered ${commands.length} Sentinel slash commands.`);})().catch(e=>{console.error(e);process.exit(1);});