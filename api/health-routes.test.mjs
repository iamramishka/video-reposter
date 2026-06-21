import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

test("Vercel health routes forward to the expected Express paths", () => {
  const require = createRequire(import.meta.url);
  const handlerPath = path.resolve(import.meta.dirname, "_handler.js");
  const basicRoutePath = path.resolve(import.meta.dirname, "health.js");
  const catchAllRoutePath = path.resolve(import.meta.dirname, "[...path].js");
  const calls = [];

  delete require.cache[handlerPath];
  delete require.cache[basicRoutePath];
  delete require.cache[catchAllRoutePath];
  require.cache[handlerPath] = {
    id: handlerPath,
    filename: handlerPath,
    loaded: true,
    exports: (req, res, apiPath) => {
      calls.push({ req, res, apiPath });
    }
  };

  require(basicRoutePath)({ url: "/api/health" }, {});
  require(catchAllRoutePath)({ url: "/api/health/detailed", query: { path: ["health", "detailed"] } }, {});

  assert.deepEqual(calls.map((call) => call.apiPath), ["/api/health", "/api/health/detailed"]);
});
