# Deployment

The app consists of three independently deployable parts:

| Part | Artifact | Needs |
|---|---|---|
| Database | PostgreSQL 14+ | A database, a user with DDL rights for migrations |
| API | `backend/dist` (Node 20+) | `DATABASE_URL`, `CORS_ORIGINS`, `PORT`, `DATABASE_SSL` |
| Front end | `frontend/build` (static files) | `VITE_API_URL` at **build** time |

Migrations run automatically when the API starts. They are forward-only, run once each, and are protected by an advisory lock, so several instances can start at the same time. They can also be run manually with `npm run db:migrate`.

## Option A: free hosting (demo link)

1. **Database: [Neon](https://neon.tech)** (free Postgres). Create a project and copy the pooled connection string.
2. **API: [Render](https://render.com) Web Service**
   - Root directory: `backend`
   - Build command: `npm ci --include=dev && npm run build`. `--include=dev` is needed because `NODE_ENV=production` would otherwise skip TypeScript.
   - Start command: `npm start`
   - Environment:
     - `NODE_ENV=production`
     - `DATABASE_URL=<neon url with sslmode=verify-full>`, for example `...neon.tech/neondb?sslmode=verify-full&channel_binding=require`. This verifies Neon's TLS certificate.
     - `DATABASE_SSL=false`, because TLS is configured by `sslmode` in the URL.
     - `CORS_ORIGINS=https://<your-frontend-domain>`
   - Health check path: `/api/health`
   - Seed the demo data once from your machine: `DATABASE_URL=<neon url> npm run db:seed`
3. **Front end: Netlify / Vercel / Cloudflare Pages**
   - Root directory: `frontend`
   - Build command: `npm ci && npm run build`
   - Publish directory: `build`
   - Environment: `VITE_API_URL=https://<render-app>.onrender.com/api`
   - Enable the SPA fallback: Netlify `/* /index.html 200`. Cloudflare and Vercel handle `index.html` automatically for SPAs.

> Render's free tier sleeps after inactivity, so the first request after a pause can take about 30 to 50 seconds.

## Option B: Linux VPS (Nginx + PM2)

```bash
# 1. system packages (Ubuntu)
sudo apt install -y nginx postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2

# 2. database
sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE erp_db OWNER erp_user;"

# 3. code
sudo mkdir -p /var/www/erp && sudo chown $USER /var/www/erp
git clone <repo> /var/www/erp && cd /var/www/erp

cd backend
cp .env.example .env && chmod 600 .env   # edit: DATABASE_URL, CORS_ORIGINS=https://erp.example.com
npm ci && npm run build && npm run db:seed

cd ../frontend
echo "VITE_API_URL=https://erp.example.com/api" > .env
npm ci && npm run build

# 4. processes + reverse proxy
cd .. && pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
sudo cp deploy/nginx.conf /etc/nginx/sites-available/erp
sudo ln -s /etc/nginx/sites-available/erp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d erp.example.com      # TLS
```

When the front end and API share a domain (Nginx serves `/` and proxies `/api`), CORS only has to allow that one origin.

### Production checklist

- `.env` has mode 600 and is never committed. Use a strong DB password, and restrict the DB user to this database.
- PostgreSQL listens only on localhost or a private network. Enable automated backups (`pg_dump` cron or provider snapshots) and test a restore.
- The API binds behind Nginx. `trust proxy` is enabled, so rate limiting sees the real client IP.
- Logs are pino JSON on stdout (`pm2 logs`) and can be shipped to any log stack. Every request carries an `X-Request-Id`.
- Point an uptime monitor at `/api/health`, which also checks the database.
- Zero-downtime reload with `pm2 reload erp-api`. The graceful shutdown finishes in-flight requests.
- CI (`.github/workflows/ci.yml`) runs typecheck, the full integration test suite against PostgreSQL, and both builds on every push and PR.
