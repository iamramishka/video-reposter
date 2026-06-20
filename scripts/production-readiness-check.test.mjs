import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const checkerPath = path.join(repoRoot, "scripts", "production-readiness-check.mjs");

test("production readiness check rejects template placeholders", async () => {
  const result = await runChecker(["--env", ".env.production.example"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL VITE_API_URL: Replace the template placeholder/);
  assert.match(result.stdout, /FAIL PRODUCTION_BASE_URL: Replace the template placeholder/);
  assert.match(result.stdout, /Summary: 7 failed, 6 warnings, 0 passed\./);
});

test("production readiness check passes configured env and healthy probes", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "video-reposter-readiness-"));
  const envPath = path.join(tempDir, ".env.production");
  const server = await startHealthServer();

  try {
    await writeFile(envPath, [
      'DATABASE_URL="postgresql://prod_user:prod_password@db.internal:5432/video_reposter?schema=public"',
      'JWT_SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"',
      'CORS_ORIGIN="https://admin.videoreposter.app"',
      'VITE_API_URL="https://api.videoreposter.app"',
      'PRODUCTION_BASE_URL="https://api.videoreposter.app"',
      'ADMIN_EMAIL="admin@videoreposter.app"',
      'ADMIN_PASSWORD="strong-production-password-123"'
    ].join("\n"));

    const result = await runChecker(["--env", envPath, "--base-url", server.baseUrl]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /PASS VITE_API_URL: configured as an HTTPS production URL\./);
    assert.match(result.stdout, /PASS GET \/api\/health:/);
    assert.match(result.stdout, /Summary: 0 failed, 5 warnings, 9 passed\./);
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
});

function runChecker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [checkerPath, ...args], {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function startHealthServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/health" || req.url === "/api/health/detailed") {
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ok: false }));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Health server did not bind a TCP port."));
        return;
      }
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve) => server.close(closeResolve))
      });
    });
  });
}
