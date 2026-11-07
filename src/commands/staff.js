const {SlashCommandBuilder,PermissionFlagsBits,EmbedBuilder}=require("discord.js");
const {get}=require("../utils/config");
const {canPromote,canIssueInfractions,canVoid}=require("../utils/permissions");
const {create,all,find,update}=require("../utils/cases");
const {sendLog,makeEmbed}=require("../utils/embeds");
const COLORS={blue:0x3498DB,red:0xE74C3C,green:0x2ECC71};
module.exports=[
 {data:new SlashCommandBuilder().setName("promo").setDescription("Promote a staff member")
  .addUserOption(o=>o.setName("member").setDescription("Staff member").setRequired(true))
  .addStringOption(o=>o.setName("reason").setDescription("Reason for promotion").setRequired(true)),
  async execute(i){
   if(!canPromote(i.member))return i.reply({content:"You do not have permission to promote staff.",ephemeral:true});
   const member=await i.guild.members.fetch(i.options.getUser("member").id).catch(()=>null);
   if(!member)return i.reply({content:"Member not found.",ephemeral:true});
   const cfg=get(i.guildId), ladder=cfg.promotion_ladder||[];
   const current=member.roles.cache.find(r=>ladder.some(x=>String(x.id||x.role_id||x)===r.id));
   const index=current?ladder.findIndex(x=>String(x.id||x.role_id||x)===current.id):-1;
   const next=ladder[index+1];
   if(!next)return i.reply({content:"No next promotion role is configured for this member.",ephemeral:true});
   const roleId=String(next.id||next.role_id||next),role=await i.guild.roles.fetch(roleId).catch(()=>null);
   if(!role)return i.reply({content:"The next promotion role is invalid. Check /config.",ephemeral:true});
   await member.roles.add(role,`Promotion by ${i.user.tag}: ${i.options.getString("reason")}`);
   const c=create("Promotion",member,i.user,i.options.getString("reason"),"",{newRoleId:role.id});
   const e=makeEmbed("Staff Promotion",`${member} was promoted to **${role.name}**.\n**Reason:** ${c.reason}`,COLORS.green).addFields({name:"Case",value:String(c.id),inline:true},{name:"Promoted by",value:String(i.user),inline:true});
   await sendLog(i.guild,"promotion_log_channel",e);
   await member.send(`You have been promoted to **${role.name}** in **${i.guild.name}**.\nReason: ${c.reason}`).catch(()=>{});
   return i.reply({embeds:[e]});
  }},
 {data:new SlashCommandBuilder().setName("infraction").setDescription("Issue a staff infraction")
  .addUserOption(o=>o.setName("member").setDescription("Staff member").setRequired(true))
  .addStringOption(o=>o.setName("punishment").setDescription("Punishment").setRequired(true).addChoices(...["Strike 1","Strike 2","Strike 3","Suspension","Termination"].map(x=>({name:x,value:x}))))
  .addStringOption(o=>o.setName("reason").setDescription("Reason").setRequired(true)),
  async execute(i){
   if(!canIssueInfractions(i.member))return i.reply({content:"You do not have permission to issue infractions.",ephemeral:true});
   const member=await i.guild.members.fetch(i.options.getUser("member").id).catch(()=>null);if(!member)return i.reply({content:"Member not found.",ephemeral:true});
   const punishment=i.options.getString("punishment"),reason=i.options.getString("reason");
   const c=create("Infraction",member,i.user,reason,"",{punishment});
   const e=makeEmbed("Staff Infraction",`${member} received **${punishment}**.\n**Reason:** ${reason}`,COLORS.red).addFields({name:"Case",value:String(c.id),inline:true},{name:"Issued by",value:String(i.user),inline:true});
   const roleId=get(i.guildId).punishment_roles?.[punishment];
   if(roleId){const role=await i.guild.roles.fetch(String(roleId)).catch(()=>null);if(role)await member.roles.add(role).catch(()=>{});}
   await sendLog(i.guild,"infraction_log_channel",e);
   await member.send(`A staff infraction was issued to you in **${i.guild.name}**.\nPunishment: ${punishment}\nReason: ${reason}`).catch(()=>{});
   return i.reply({embeds:[e]});
  }},
 {data:new SlashCommandBuilder().setName("history").setDescription("View a member's staff case history")
  .addUserOption(o=>o.setName("member").setDescription("Member").setRequired(true)),
  async execute(i){
   const user=i.options.getUser("member"),rows=all().filter(x=>x.guildId===i.guildId&&x.memberId===user.id).slice(-10);
   const e=makeEmbed(`Staff History — ${user.tag}`,rows.length?rows.map(x=>`**#${x.id} ${x.type}** — ${x.reason} ${x.voided?"(VOIDED)":""}`).join("\n"):"No cases found.");
   return i.reply({embeds:[e],ephemeral:true});
  }},
 {data:new SlashCommandBuilder().setName("void").setDescription("Void a staff case")
  .addIntegerOption(o=>o.setName("case_id").setDescription("Case number").setRequired(true))
  .addStringOption(o=>o.setName("reason").setDescription("Reason for voiding").setRequired(true)),
  async execute(i){
   if(!canVoid(i.member))return i.reply({content:"You do not have permission to void cases.",ephemeral:true});
   const id=i.options.getInteger("case_id"),c=find(id,i.guildId);
   if(!c)return i.reply({content:"Case not found.",ephemeral:true});
   if(c.voided)return i.reply({content:"That case is already voided.",ephemeral:true});
   update(id,i.guildId,{voided:true,voidedBy:i.user.id,voidReason:i.options.getString("reason"),voidedAt:new Date().toISOString()});
   const e=makeEmbed("Staff Case Voided",`Case **#${id}** was voided.\nReason: ${i.options.getString("reason")}`,COLORS.blue);
   return i.reply({embeds:[e]});
  }}
];