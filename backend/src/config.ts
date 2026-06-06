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

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  corsOrigin,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
};
