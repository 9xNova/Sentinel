const { read, write } = require("./storage");

const DEFAULT_CONFIG = {
  promotion_ladder: [],
  promotion_permissions: [],
  infraction_permissions: [],
  void_permissions: [],
  appeal_accept_permissions: [],
  partnership_approval_permissions: [],
  bot_bypass_roles: [],
  role_bypass_roles: [],
  discord_suspended_role: null,
  security_log_channel: null,
  promotion_log_channel: null,
  infraction_log_channel: null,
  partnership_review_channel: null,
  partnership_announcement_channel: null,
  appeal_approval_channel: null,
  weekly_quota_role: null,
  ticket_categories: {},
  ticket_human_role: null,
  ticket_rules_channel: null,
  punishment_roles: {
    "Strike 1": null,
    "Strike 2": null,
    "Strike 3": null,
    Suspension: null,
    Termination: null,
  },
};

function all() {
  return read("server-config.json", {});
}

function get(guildId) {
  const saved = all()[guildId] || {};
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...saved,
    punishment_roles: {
      ...DEFAULT_CONFIG.punishment_roles,
      ...(saved.punishment_roles || {}),
    },
  };
}

function set(guildId, key, value) {
  const data = all();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][key] = value;
  write("server-config.json", data);
  return get(guildId);
}

module.exports = { DEFAULT_CONFIG, get, set };