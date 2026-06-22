const handleExpress = require("./_handler");

// Single entry point for all /api/* routes.
// vercel.json routes /api/(.*) -> /api/router?path=$1
// so req.query.path contains the path segments after /api/
module.exports = (req, res) => {
  const path = String(req.query.path ?? "");
  return handleExpress(req, res, `/api/${path}`);
};
