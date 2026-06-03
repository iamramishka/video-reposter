let appPromise;

module.exports = async function handleExpress(req, res, apiPath) {
  appPromise ??= import("../backend/dist/src/app.js").then(({ createApp }) => createApp());
  const app = await appPromise;
  if (req.url && !req.url.startsWith("/api")) {
    const queryIndex = req.url.indexOf("?");
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
    req.url = `${apiPath}${query}`;
  }
  return app(req, res);
};
