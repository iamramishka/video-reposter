import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const envPath = path.resolve(args.env ?? ".env.production");
const exampleEnvPath = path.resolve(".env.production.example");
const env = {
  ...process.env,
  ...(existsSync(envPath) ? parseEnvFile(readFileSync(envPath, "utf8")) : {})
};
const results = [];

checkRequired("DATABASE_URL", "Required for Prisma migrations and direct PostgreSQL repositories.");
checkRequired("ADMIN_EMAIL", "Required for seeded/admin access.");
checkJwtSecret();
checkCorsOrigin();
checkHttpsUrl("VITE_API_URL", "Required when building the admin dashboard for production.");
checkHttpsUrl("PRODUCTION_BASE_URL", "Required so health checks, emails, and deployment probes use the public API origin.");
checkAdminPassword();
await checkHealthEndpoints();
addOpsWarnings();

const failed = results.filter((result) => result.status === "fail");
const warned = results.filter((result) => result.status === "warn");

console.log("# Production Readiness Check");
console.log("");
console.log(`Host: ${os.hostname()}`);
console.log(`Env file: ${existsSync(envPath) ? envPath : `${envPath} (not found; process env only)`}`);
if (!existsSync(envPath) && existsSync(exampleEnvPath)) {
  console.log(`Template: ${exampleEnvPath}`);
  console.log("Tip: copy the template to `.env.production`, fill real production values, then rerun this check.");
}
console.log("");
for (const result of results) {
  console.log(`- ${badge(result.status)} ${result.name}: ${result.message}`);
}
console.log("");
console.log(`Summary: ${failed.length} failed, ${warned.length} warnings, ${results.length - failed.length - warned.length} passed.`);

if (failed.length > 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--env") parsed.env = argv[++index];
    else if (current === "--base-url") parsed.baseUrl = argv[++index];
  }
  return parsed;
}

function parseEnvFile(contents) {
  const parsed = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    parsed[match[1]] = unquote(match[2].trim());
  }
  return parsed;
}

function unquote(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function checkRequired(name, message) {
  const value = env[name]?.trim();
  if (!value) {
    add("fail", name, message);
  } else if (isPlaceholderValue(value)) {
    add("fail", name, "Replace the template placeholder with the real production value.");
  } else {
    add("pass", name, "configured");
  }
}

function checkJwtSecret() {
  const value = env.JWT_SECRET?.trim() ?? "";
  const banned = new Set(["dev-only-jwt-secret", "change-me-in-production", "admin12345"]);
  if (!value) {
    add("fail", "JWT_SECRET strength", "JWT_SECRET is missing.");
  } else if (banned.has(value) || value.length < 64) {
    add("fail", "JWT_SECRET strength", "Use a rotated 64+ character random secret, for example output from `openssl rand -hex 32`.");
  } else {
    add("pass", "JWT_SECRET strength", "64+ characters and not a known default.");
  }
}

function checkCorsOrigin() {
  const value = env.CORS_ORIGIN?.trim() ?? "";
  if (!value) {
    add("fail", "CORS_ORIGIN", "Set CORS_ORIGIN to the exact admin dashboard HTTPS origin.");
  } else if (isPlaceholderValue(value)) {
    add("fail", "CORS_ORIGIN", "Replace the template placeholder with the exact production admin dashboard origin.");
  } else if (value === "*" || value.includes(",")) {
    add("fail", "CORS_ORIGIN", "Use one exact admin dashboard origin, not `*` or a comma-separated list.");
  } else if (!value.startsWith("https://")) {
    add("warn", "CORS_ORIGIN", "Production CORS_ORIGIN should normally be HTTPS.");
  } else {
    add("pass", "CORS_ORIGIN", "configured as one HTTPS origin.");
  }
}

function checkAdminPassword() {
  const value = env.ADMIN_PASSWORD?.trim() ?? "";
  if (!value) {
    add("fail", "ADMIN_PASSWORD", "Required for seeded/admin access.");
  } else if (isPlaceholderValue(value) || value === "admin12345" || value.length < 12) {
    add("fail", "ADMIN_PASSWORD", "Use a strong production admin password; do not keep the development default.");
  } else {
    add("pass", "ADMIN_PASSWORD", "not the development default.");
  }
}

function checkHttpsUrl(name, missingMessage) {
  const value = env[name]?.trim() ?? "";
  if (!value) {
    add("fail", name, missingMessage);
  } else if (isPlaceholderValue(value)) {
    add("fail", name, "Replace the template placeholder with the real production URL.");
  } else if (!value.startsWith("https://")) {
    add("fail", name, "Use an HTTPS production URL.");
  } else {
    add("pass", name, "configured as an HTTPS production URL.");
  }
}

function isPlaceholderValue(value) {
  return /(<[^>]+>|replace-with|your-|example\.com|example\.org|example\.net|user:password@host|localhost|127\.0\.0\.1)/i.test(value);
}

async function checkHealthEndpoints() {
  const baseUrl = (args.baseUrl ?? env.PRODUCTION_BASE_URL ?? env.VITE_API_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl || (!args.baseUrl && (baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1") || baseUrl.includes("example.com")))) {
    add("warn", "Health endpoints", "Set PRODUCTION_BASE_URL or pass `--base-url https://...` to probe deployed health endpoints.");
    return;
  }

  await checkJsonEndpoint(`${baseUrl}/api/health`, "GET /api/health", (body) => body?.ok === true);
  await checkJsonEndpoint(`${baseUrl}/api/health/detailed`, "GET /api/health/detailed", (body) => body?.ok === true);
}

async function checkJsonEndpoint(url, name, isHealthy) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await response.json().catch(() => null);
    if (response.ok && isHealthy(body)) {
      add("pass", name, `${url} returned healthy JSON.`);
    } else {
      add("fail", name, `${url} returned HTTP ${response.status} or unhealthy JSON.`);
    }
  } catch (error) {
    add("fail", name, `${url} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function addOpsWarnings() {
  add("warn", "External uptime monitor", "Confirm provider monitor probes `/api/health` every 60 seconds or less.");
  add("warn", "Detailed health alert", "Confirm provider alert fires when `/api/health/detailed` returns `ok: false`.");
  add("warn", "PM2 log rotation", "On PM2 hosts run `pm2 install pm2-logrotate` and confirm retention settings.");
  add("warn", "Database backups", "Confirm PostgreSQL WAL archiving or managed daily backups outside the repo.");
  add("warn", "TLS auto-renewal", "Confirm certbot/Caddy/provider TLS certificate renewal outside the repo.");
}

function add(status, name, message) {
  results.push({ status, name, message });
}

function badge(status) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}
