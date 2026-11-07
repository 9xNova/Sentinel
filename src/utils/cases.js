const {read,write}=require("./storage");
function all(){return read("cases.json",[]);}
function create(type,member,actor,reason,details="",extra={}){
 const rows=all(); const id=rows.reduce((n,x)=>Math.max(n,Number(x.id)||0),0)+1;
 const item={id,type,guildId:member.guild.id,memberId:member.id,memberTag:member.user.tag,
  actorId:actor.id,actorTag:actor.tag||actor.user?.tag||"Unknown",reason,details,
  createdAt:new Date().toISOString(),voided:false,...extra};
 rows.push(item);write("cases.json",rows);return item;
}
function find(id,guildId){return all().find(x=>String(x.id)===String(id)&&x.guildId===String(guildId));}
function update(id,guildId,patch){const rows=all(),i=rows.findIndex(x=>String(x.id)===String(id)&&x.guildId===String(guildId));if(i<0)return null;rows[i]={...rows[i],...patch};write("cases.json",rows);return rows[i];}
module.exports={all,create,find,update};