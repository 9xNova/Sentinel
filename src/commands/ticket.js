const {SlashCommandBuilder,PermissionFlagsBits,ChannelType,ActionRowBuilder,ButtonBuilder,ButtonStyle}=require("discord.js");
const {get}=require("../utils/config");const {read,write}=require("../utils/storage");const {makeEmbed}=require("../utils/embeds");
module.exports=[
 {data:new SlashCommandBuilder().setName("ticket-panel").setDescription("Post a ticket panel").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption(o=>o.setName("channel").setDescription("Panel channel").addChannelTypes(ChannelType.GuildText)),
  async execute(i){const channel=i.options.getChannel("channel")||i.channel;const categories=Object.keys(get(i.guildId).ticket_categories||{});const label=categories[0]||"General Support";
   const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket:open").setLabel(`Open ${label} Ticket`).setStyle(ButtonStyle.Primary));
   await channel.send({embeds:[makeEmbed("Support Tickets","Click the button below to open a private support ticket.")],components:[row]});return i.reply({content:`Ticket panel posted in ${channel}.`,ephemeral:true});}}
];
async function handleTicket(interaction){
 if(!interaction.isButton()||!interaction.customId.startsWith("ticket:"))return;
 if(interaction.customId==="ticket:open"){
  const existing=read("tickets.json",[]).find(x=>x.guildId===interaction.guildId&&x.userId===interaction.user.id&&x.status==="open");
  if(existing){const ch=await interaction.guild.channels.fetch(existing.channelId).catch(()=>null);return interaction.reply({content:ch?`You already have a ticket: ${ch}`:"You already have an open ticket.",ephemeral:true});}
  const channel=await interaction.guild.channels.create({name:`ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,90),type:ChannelType.GuildText,permissionOverwrites:[{id:interaction.guild.roles.everyone.id,deny:["ViewChannel"]},{id:interaction.user.id,allow:["ViewChannel","SendMessages","ReadMessageHistory"]},{id:interaction.client.user.id,allow:["ViewChannel","SendMessages","ManageChannels"]}]});
  const rows=read("tickets.json",[]);rows.push({guildId:interaction.guildId,userId:interaction.user.id,channelId:channel.id,status:"open",createdAt:new Date().toISOString()});write("tickets.json",rows);
  const controls=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger));
  await channel.send({content:`${interaction.user}`,embeds:[makeEmbed("Support Ticket","Please describe what you need help with. A staff member will assist you.")],components:[controls]});
  return interaction.reply({content:`Your ticket has been opened: ${channel}`,ephemeral:true});
 }
 if(interaction.customId==="ticket:close"){
  const rows=read("tickets.json",[]),r=rows.find(x=>x.channelId===interaction.channelId&&x.status==="open");
  if(!r)return interaction.reply({content:"Ticket record not found.",ephemeral:true});
  if(r.userId!==interaction.user.id&&!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels))return interaction.reply({content:"Only the ticket owner or staff can close this ticket.",ephemeral:true});
  r.status="closed";r.closedAt=new Date().toISOString();write("tickets.json",rows);
  await interaction.reply({content:"Ticket closed. This channel will be deleted in 5 seconds."});
  setTimeout(()=>interaction.channel.delete("Ticket closed").catch(()=>{}),5000);
 }
}
module.exports.handleTicket=handleTicket;