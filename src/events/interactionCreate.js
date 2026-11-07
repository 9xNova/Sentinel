const {Collection}=require("discord.js");
const {handleTicket}=require("../commands/ticket");
const {handlePartnership}=require("../commands/partnership");
const {handleAppeal}=require("../commands/appeal");
const {handleEmbed,handleEmbedButton}=require("../commands/embed");
module.exports=client=>client.on("interactionCreate",async interaction=>{
 try{
  if(interaction.isChatInputCommand()){const command=client.commands.get(interaction.commandName);if(command)await command.execute(interaction);return;}
  await handleTicket(interaction);await handlePartnership(interaction);await handleAppeal(interaction);await handleEmbed(interaction);await handleEmbedButton(interaction);
 }catch(error){console.error("Interaction error:",error);const payload={content:"Something went wrong while running that command. Check the bot console for details.",ephemeral:true};if(interaction.replied||interaction.deferred)await interaction.followUp(payload).catch(()=>{});else await interaction.reply(payload).catch(()=>{});}
});