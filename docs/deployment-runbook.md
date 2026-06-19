# Deployment Runbook

Video Reposter monorepo deployment guide for backend API and admin dashboard.

## Prerequisites

- Node.js 22+ and npm 10+ on the deployment host
- PostgreSQL 15+ (or Supabase project)
- A process manager (PM2 recommended for Node.js)
- A reverse proxy (nginx or Caddy) for TLS termination
- DNS records pointing to your server

---

## Vercel Production Deployment

The repository includes a Vercel configuration for deploying the admin dashboard as a static Vite app and the backend API as serverless functions.

### Required project settings

Set these Vercel environment variables before deploying:

```
DATABASE_URL=postgresql://...
JWT_SECRET=<64+ random bytes>
CORS_ORIGIN=https://<your-vercel-domain-or-custom-admin-domain>
VITE_API_URL=https://<your-vercel-domain-or-custom-api-domain>
ADMIN_EMAIL=your@admin.email
ADMIN_PASSWORD=<strong password>
```

If using Supabase REST repositories instead of direct Prisma/PostgreSQL access, also set:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

### Commands

```bash
npm run build:production
npm run deploy:production
```

Vercel uses `vercel.json`, which runs `npm run build:production`, publishes `admin-dashboard/dist`, routes `/api/*` to the Express backend adapter in `api/`, and falls back all non-API routes to the admin SPA.

### Post-deploy checks

```bash
curl https://<deployment-domain>/api/health
curl https://<deployment-domain>/api/health/detailed
```

Open the admin dashboard URL and confirm login, package list, license list, analytics, and PDF export.

---

## 1. Backend API

### Environment variables

Copy `.env.example` to `.env` and fill in all required values:

```
DATABASE_URL=postgresql://user:pass@host:5432/video_reposter
JWT_SECRET=<64+ random bytes, e.g. openssl rand -hex 32>
PORT=4000
ADMIN_EMAIL=your@admin.email
ADMIN_PASSWORD=<strong password>
CORS_ORIGIN=https://your-admin-dashboard.example.com

# Optional — Supabase REST repositories (replaces PostgreSQL direct connection)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Optional — SMTP email notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASS=<smtp password>
SMTP_FROM=Video Reposter <noreply@example.com>
```

**Never commit `.env` to git.**

### Database setup

```bash
cd backend
npx prisma migrate deploy   # applies all migrations
npx prisma db seed          # seeds packages and admin user (idempotent)
```

### Build and start

```bash
npm install --workspaces
npm run build --workspace=backend   # compiles TypeScript

# Start with PM2
pm2 start dist/server.js --name video-reposter-api \
  --env production \
  --max-memory-restart 512M

pm2 save
pm2 startup   # registers PM2 on system boot
```

### Health check

```
GET /api/health              → { ok: true }
GET /api/health/detailed     → { ok, uptime, database: { status, latencyMs }, email: { configured } }
```

Use `/api/health/detailed` as the probe URL for your load balancer or uptime monitor.

### nginx reverse proxy (example)

```nginx
server {
    listen 443 ssl;
    server_name api.videoreposter.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.videoreposter.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.videoreposter.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 2. Admin Dashboard

The admin dashboard is a static Vite SPA. Build it and serve from any static host.

### Build

```bash
# Set the API URL before building
VITE_API_URL=https://api.videoreposter.example.com \
  npm run build --workspace=admin-dashboard

# Output is admin-dashboard/dist/
```

### Serve with nginx (example)

```nginx
server {
    listen 443 ssl;
    server_name admin.videoreposter.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin.videoreposter.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.videoreposter.example.com/privkey.pem;

    root /var/www/admin-dashboard/dist;
    index index.html;

    # SPA routing — all unknown paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Serve with Caddy (example)

```
admin.videoreposter.example.com {
    root * /var/www/admin-dashboard/dist
    file_server
    try_files {path} /index.html
}
```

---

## 3. Desktop App Release

The Windows installer is built with Electron Builder.

```bash
npm run build --workspace=desktop-app   # Vite + tsc

# Package (requires Windows or Wine on Linux)
cd desktop-app
npx electron-builder --win --publish never

# Output: desktop-app/dist/Video Reposter Setup <version>.exe
```

Set the desktop app's `VITE_LICENSE_SERVER_URL` env var (at build time or via the packager config) to point at your deployed backend URL.

Optionally set `VIDEO_REPOSTER_UPDATE_URL` to your update manifest endpoint so the in-app auto-updater can check for new releases.

---

## 4. Rollback

### Backend rollback

```bash
pm2 stop video-reposter-api
cd backend
git checkout <previous-tag>
npm install
npm run build
npx prisma migrate deploy   # safe to re-run; skips already-applied migrations
pm2 start video-reposter-api
```

### Admin dashboard rollback

Re-deploy the previous build artifact to the static host.

### Database rollback

Prisma does not generate automatic down migrations. For a destructive schema change:
1. Restore a PostgreSQL backup taken before the migration.
2. Roll back to the previous backend version.

Always take a `pg_dump` snapshot before running `migrate deploy` in production.

---

## 5. Monitoring checklist

- [ ] Uptime monitor on `GET /api/health` (≤ 1 min interval)
- [ ] Alert if `GET /api/health/detailed` returns `ok: false`
- [ ] PM2 log rotation: `pm2 install pm2-logrotate`
- [ ] PostgreSQL WAL archiving or managed backup enabled
- [ ] TLS certificate auto-renewal (certbot or Caddy handles this automatically)
- [ ] `CORS_ORIGIN` set to the exact admin dashboard origin — not `*`
- [ ] `JWT_SECRET` rotated from the default `dev-only-jwt-secret`
