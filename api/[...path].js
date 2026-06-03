let appPromise;

module.exports = async function handler(req, res) {
  appPromise ??= import("../backend/dist/src/app.js").then(({ createApp }) => createApp());
  const app = await appPromise;
  if (req.url && !req.url.startsWith("/api")) {
    req.url = `/api${req.url}`;
  }
  return app(req, res);
};
