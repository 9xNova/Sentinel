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

const canPromote = (m) => allowed(m, "promotion_permissions");
const canIssueInfractions = (m) => allowed(m, "infraction_permissions");
const canVoid = (m) => allowed(m, "void_permissions");
const canReviewAppeals = (m) => allowed(m, "appeal_accept_permissions");
const canApprovePartnerships = (m) => allowed(m, "partnership_approval_permissions");

module.exports = {
  hasAnyRole,
  allowed,
  canPromote,
  canIssueInfractions,
  canVoid,
  canReviewAppeals,
  canApprovePartnerships,
};