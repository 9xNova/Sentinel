const { PermissionFlagsBits } = require("discord.js");
const { get } = require("./config");

function hasAnyRole(member, ids = []) {
  if (!member) return false;
  return ids.some((id) => member.roles.cache.has(String(id)));
}

function allowed(member, key) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return hasAnyRole(member, get(member.guild.id)[key] || []);
}

const canPromote = (m) => allowed(m, "promotionpermissions");
const canIssueInfractions = (m) => allowed(m, "infractionpermissions");
const canVoid = (m) => allowed(m, "voidpermissions");
const canReviewAppeals = (m) => allowed(m, "appealacceptpermissions");
const canApprovePartnerships = (m) => allowed(m, "partnershipapprovalpermissions");

module.exports = {
  hasAnyRole,
  allowed,
  canPromote,
  canIssueInfractions,
  canVoid,
  canReviewAppeals,
  canApprovePartnerships,
};