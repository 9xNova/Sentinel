const { read, write } = require("./storage");

const defaultconfig = {
  promotionladder: [],
  promotionpermissions: [],
  infractionpermissions: [],
  voidpermissions: [],
  appealacceptpermissions: [],
  partnershipapprovalpermissions: [],
  botbypassroles: [],
  rolebypassroles: [],
  discordsuspendedrole: null,
  securitylogchannel: null,
  promotionlogchannel: null,
  infractionlogchannel: null,
  partnershipreviewchannel: null,
  partnershipannouncementchannel: null,
  appealapprovalchannel: null,
  weeklyquotorole: null,
  ticketcategories: {},
  tickethumanrole: null,
  ticketruleschannel: null,
  honeypotchannel: null,
  honeypotrole: null,
  punishmentroles: {
    "Strike 1": null,
    "Strike 2": null,
    "Strike 3": null,
    Suspension: null,
    Termination: null,
  },
};

function all() {
  return read("serverconfig", {});
}

function get(guildId) {
  const saved = all()[guildId] || {};
  return {
    ...structuredClone(defaultconfig),
    ...saved,
    punishmentroles: {
      ...defaultconfig.punishmentroles,
      ...(saved.punishmentroles || {}),
    },
  };
}

function set(guildId, key, value) {
  const data = all();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][key] = value;
  write("serverconfig", data);
  return get(guildId);
}

module.exports = { defaultconfig, get, set };