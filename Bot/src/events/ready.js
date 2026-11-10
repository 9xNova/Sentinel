const { log } = require("../utils/logger");

module.exports = (client) =>
  client.once("clientReady", () => {
    log(`Sentinel online as ${client.user.tag}`);
    client.user.setActivity("Staff Applications", { type: 5 });
  });