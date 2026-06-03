let appPromise;

module.exports = async function handler(req, res) {
  appPromise ??= import("../backend/dist/src/app.js").then(({ createApp }) => createApp());
  const app = await appPromise;
  return app(req, res);
};
