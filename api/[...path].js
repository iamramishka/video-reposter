const handleExpress = require("./_handler");

module.exports = (req, res) => {
  const pathParam = req.query.path;
  const segments = Array.isArray(pathParam) ? pathParam : [pathParam].filter(Boolean);
  const apiPath = segments.length ? `/api/${segments.map(String).join("/")}` : "/api";
  return handleExpress(req, res, apiPath);
};
