const {SlashCommandBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,ActionRowBuilder,ButtonBuilder,ButtonStyle,PermissionFlagsBits}=require("discord.js");
const {get}=require("../utils/config");const {canApprovePartnerships}=require("../utils/permissions");const {makeEmbed}=require("../utils/embeds");const {read,write}=require("../utils/storage");
module.exports=[
 {data:new SlashCommandBuilder().setName("partnership").setDescription("Submit a partnership application"),
  async execute(i){const modal=new ModalBuilder().setCustomId("partnership:submit").setTitle("Partnership Application");
   for(const [id,label,style] of [["server","Server Name",1],["invite","Server Invite Link",1],["count","Member Count",1],["description","Server Description",2]]){const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style===2?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(true);modal.addComponents(new ActionRowBuilder().addComponents(input));}
   await i.showModal(modal);
  }}
];
async function handlePartnership(interaction){
 if(interaction.isModalSubmit()&&interaction.customId==="partnership:submit"){
  const row={id:Date.now().toString(),guildId:interaction.guildId,userId:interaction.user.id,server:interaction.fields.getTextInputValue("server"),invite:interaction.fields.getTextInputValue("invite"),count:interaction.fields.getTextInputValue("count"),description:interaction.fields.getTextInputValue("description"),status:"pending"};
  const rows=read("partnerships.json",[]);rows.push(row);write("partnerships.json",rows);
  const channelId=get(interaction.guildId).partnership_review_channel;const channel=channelId?await interaction.guild.channels.fetch(String(channelId)).catch(()=>null):null;
  if(!channel?.isTextBased())return interaction.reply({content:"Application saved, but the review channel is not configured. Ask an administrator to set it.",ephemeral:true});
  const e=makeEmbed("Partnership Application",`**Server:** ${row.server}\n**Invite:** ${row.invite}\n**Members:** ${row.count}\n**Description:** ${row.description}\n**Applicant:** <@${row.userId}>`);
  const buttons=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`partnership:approve:${row.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`partnership:deny:${row.id}`).setLabel("Deny").setStyle(ButtonStyle.Danger));
  await channel.send({embeds:[e],components:[buttons]});return interaction.reply({content:"Your partnership application has been submitted for review.",ephemeral:true});
 }
 if(interaction.isButton()&&interaction.customId.startsWith("partnership:")){
  if(!canApprovePartnerships(interaction.member))return interaction.reply({content:"You cannot review partnership applications.",ephemeral:true});
  const [,action,id]=interaction.customId.split(":");const rows=read("partnerships.json",[]),r=rows.find(x=>x.id===id);
  if(!r||r.status!=="pending")return interaction.reply({content:"This application is no longer pending.",ephemeral:true});
  r.status=action==="approve"?"approved":"denied";r.reviewedBy=interaction.user.id;write("partnerships.json",rows);
  await interaction.update({embeds:[makeEmbed(`Partnership ${r.status}`,`**${r.server}** — ${r.status} by ${interaction.user}.`)],components:[]});
  if(action==="approve"){const destId=get(interaction.guildId).partnership_announcement_channel;const dest=destId?await interaction.guild.channels.fetch(String(destId)).catch(()=>null):null;if(dest?.isTextBased())await dest.send({embeds:[makeEmbed("New Server Partnership",`**${r.server}**\n${r.description}\n${r.invite}`)]});}
  return;
 }
}
module.exports.handlePartnership=handlePartnership;