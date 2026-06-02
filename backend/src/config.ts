import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-jwt-secret",
  corsOrigin: process.env.CORS_ORIGIN ?? "*"
};
