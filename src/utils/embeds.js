const {EmbedBuilder}=require("discord.js");
function makeEmbed(title,description,color=0x5865F2){
 return new EmbedBuilder().setTitle(title).setDescription(description||" ").setColor(color).setTimestamp();
}
async function sendLog(guild,configKey,embed){
 const {get}=require("./config"); const id=get(guild.id)[configKey]; if(!id)return false;
 const channel=await guild.channels.fetch(String(id)).catch(()=>null);
 if(!channel?.isTextBased())return false;
 await channel.send({embeds:[embed]}).catch(()=>null); return true;
}
module.exports={makeEmbed,sendLog};