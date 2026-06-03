const handleExpress = require("./_handler");

module.exports = async function handler(req, res) {
  return handleExpress(req, res, "/api");
};
