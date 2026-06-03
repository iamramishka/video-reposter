const handleExpress = require("./_handler");

module.exports = async function handler(req, res) {
  const path = req.query?.path;
  const segments = Array.isArray(path) ? path : path ? [path] : [];
  return handleExpress(req, res, `/api/${segments.join("/")}`);
};
