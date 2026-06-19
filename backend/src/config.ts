import "dotenv/config";

const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const jwtSecret = process.env.JWT_SECRET ?? "dev-only-jwt-secret";

if (isProduction && jwtSecret === "dev-only-jwt-secret") {
  throw new Error("JWT_SECRET must be set in production.");
}

const corsOrigin = process.env.CORS_ORIGIN ?? "*";
if (isProduction && corsOrigin === "*") {
  console.warn("[config] WARNING: CORS_ORIGIN is not set — all origins are allowed. Set CORS_ORIGIN to your admin dashboard URL in production.");
}

const adminSessionTimeoutMinutes = Number(process.env.ADMIN_SESSION_TIMEOUT_MINUTES ?? 480);
if (!Number.isInteger(adminSessionTimeoutMinutes) || adminSessionTimeoutMinutes < 15 || adminSessionTimeoutMinutes > 1440) {
  throw new Error("ADMIN_SESSION_TIMEOUT_MINUTES must be an integer between 15 and 1440.");
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  corsOrigin,
  adminSessionTimeoutMinutes,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
