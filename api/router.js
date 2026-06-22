const handleExpress = require("./_handler");

module.exports = (req, res) => {
  const url = new URL(req.url, "http://x");
  const pathVal = url.searchParams.get("path") ?? "";
  url.searchParams.delete("path");
  // Rebuild req.url so _handler picks up the correct query string (minus the routing param)
  req.url = `/api/${pathVal}${url.search}`;
  return handleExpress(req, res, `/api/${pathVal}`);
};
