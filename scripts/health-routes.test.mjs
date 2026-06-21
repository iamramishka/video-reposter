import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

test("Vercel health routes forward to the expected Express paths", () => {
  const require = createRequire(import.meta.url);
  const apiDir = path.resolve(import.meta.dirname, "../api");
  const handlerPath = path.join(apiDir, "_handler.js");
  const basicRoutePath = path.join(apiDir, "health.js");
  const detailedRoutePath = path.join(apiDir, "health-detailed.js");
  const calls = [];

  delete require.cache[handlerPath];
  delete require.cache[basicRoutePath];
  delete require.cache[detailedRoutePath];
  require.cache[handlerPath] = {
    id: handlerPath,
    filename: handlerPath,
    loaded: true,
    exports: (req, res, apiPath) => {
      calls.push({ req, res, apiPath });
    }
  };

  require(basicRoutePath)({ url: "/api/health" }, {});
  require(detailedRoutePath)({ url: "/api/health-detailed" }, {});

  assert.deepEqual(calls.map((call) => call.apiPath), ["/api/health", "/api/health-detailed"]);
});
