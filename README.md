# Mini Inventory & Purchase ERP

A small ERP module that covers this workflow:
**Vendor → Purchase Order → Goods Receipt → Inventory Update → Vendor Payable → Payment**

| Layer | Stack |
|---|---|
| Database | **PostgreSQL** (migrations, constraints, view for the vendor balance report) |
| API | **Node.js + TypeScript (strict) + Express 5**, Zod validation, `pg` with parameterised SQL |
| Front end | **Svelte 5 (Runes) + SvelteKit + Tailwind CSS 4**, a static SPA |
| Tests | Vitest + Supertest, **45 integration tests against real PostgreSQL** |

> MySQL → PostgreSQL and React → Svelte 5 were changed as agreed with the hiring team. See [docs/DESIGN.md](docs/DESIGN.md#1-deviations-from-the-original-brief-agreed-with-the-recruiter).

## Highlights

- **Stock rises exactly once per receipt.** An `Idempotency-Key` with payload hashing, row locks and a DB `CHECK` mean retries, double clicks and concurrent submissions never double-count stock or payments. These cases are tested with real concurrency.
- **Atomic transactions.** The GRN, its lines, the PO received quantity, product stock, the stock ledger and the PO status are written in one transaction. Any failure rolls all of them back.
- **Exact money.** `NUMERIC` columns and string decimals end to end, with no floating point.
- **Clear payable policy.** The vendor is owed for goods *received*. Payments can never exceed the outstanding balance.
- **Vendor balance SQL without fan-out.** Each child table is pre-aggregated in its own CTE ([view](backend/migrations/002_vendor_balance_view.sql), [stand-alone report](backend/sql/reports/vendor_balance_summary.sql)).
- **Layered backend:** routes → controllers → business → services → tables, plus utils.
- **Every error message lives in [`errorMessages.json`](backend/src/constants/errorMessages.json)** and is produced by one dynamic factory, `createError(code, params)`.
- **ERP-style UI:** keyboard shortcuts (Alt+1…6 to navigate modules, `/` to search, Alt+A to add a PO line, Ctrl+Enter to save), inline field errors, toasts for transaction status, and a responsive layout down to phone width.

## Project structure

```
backend/
  migrations/            001_init_schema.sql, 002_vendor_balance_view.sql
  sql/reports/           vendor_balance_summary.sql   (SQL task)
  src/
    routes/ controllers/ business/ services/ tables/ validators/
    utils/ constants/errorMessages.json  middlewares/  db/  config/
  tests/                 integration + unit tests
  scripts/local-db.mjs   embedded PostgreSQL for machines without Postgres/Docker
frontend/
  src/lib/               api client, types, components, toast store, formatters
  src/routes/            inventory, inventory/[id], purchase-orders(/new, /[id]), payments, vendors, products
docs/                    API.md, postman_collection.json, DESIGN.md, TEST_CASES.md, DEPLOYMENT.md
deploy/                  nginx.conf, PM2 ecosystem file
.github/workflows/ci.yml typecheck + tests (Postgres service) + builds
```

## Running locally

**Requirements:** Node.js **22.17+** and one of the following:
- a local PostgreSQL 14+ installation,
- Docker, or
- neither: use the bundled embedded PostgreSQL.

### 1. Database

Choose **one** option:

```bash
# a) Embedded PostgreSQL (no install needed; downloads the binaries through npm)
cd backend && npm install && npm run db:local      # keep this terminal open (port 5433)

# b) Docker
docker compose up -d                                 # port 5433, also creates erp_test

# c) Existing PostgreSQL: create the databases erp_db and erp_test yourself
```

### 2. Backend (API on http://localhost:4000)

```bash
cd backend
cp .env.example .env          # set DATABASE_URL / TEST_DATABASE_URL (the password must match your DB)
npm install
npm run db:seed               # runs the migrations and adds demo vendors and products
npm run dev
```

### 3. Frontend (http://localhost:5173)

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev
```

### Commands

| Where | Command | Purpose |
|---|---|---|
| backend | `npm run dev` | API with hot reload |
| backend | `npm test` | 45 integration/unit tests (uses `TEST_DATABASE_URL`, which is wiped) |
| backend | `npm run typecheck` / `npm run build` / `npm start` | Type check / compile to `dist` / run the compiled build |
| backend | `npm run db:migrate` / `npm run db:seed` | Apply migrations / migrations + demo data |
| frontend | `npm run dev` / `npm run build` / `npm run check` | Dev server / static build to `build/` / svelte-check |

### Environment variables

**backend/.env** (see [`.env.example`](backend/.env.example))

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://erp_user:***@localhost:5433/erp_db` | **required** |
| `TEST_DATABASE_URL` | `postgres://erp_user:***@localhost:5433/erp_test` | used by `npm test` only; it is truncated |
| `DATABASE_SSL` | `false` | `true` for Neon, Supabase or Render |
| `DB_POOL_MAX` | `10` | |
| `PORT` | `4000` | |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated allow-list |
| `LOG_LEVEL` | `info` | |
| `NODE_ENV` | `development` | |

**frontend/.env**: `VITE_API_URL` (API base URL, read at build time).

No passwords or secrets are committed. `.env` files are git-ignored.

**Authentication:** not implemented in this exercise, so there are no sample credentials (see limitations).

## Documentation

- [API reference + curl walk-through](docs/API.md) · [Postman collection](docs/postman_collection.json)
- [Design decisions, payable policy, assumptions, limitations](docs/DESIGN.md)
- [Automated tests & manual test script](docs/TEST_CASES.md)
- [Deployment (free hosting / Linux VPS with Nginx + PM2)](docs/DEPLOYMENT.md)

## Known limitations (summary)

There is no authentication or RBAC, no PO edit/cancel, no GRN reversal or stock adjustment UI, no tax (GST) handling, a single warehouse and currency, and no PWA/offline mode. Details and the next steps are in [DESIGN.md §8](docs/DESIGN.md#8-known-limitations--not-implemented).

## Submission notes

### Time spent

About **2 hours 15 minutes** of AI-assisted development, well within the 8-hour limit. This covers reading the brief, building the database, API and front end, writing the tests and documentation, and testing the UI in a browser.

### Third-party code / AI assistance

I used **Claude Code** (Anthropic's AI coding assistant) to build this solution. I defined the requirements and the changes agreed with the hiring team (PostgreSQL instead of MySQL, Svelte 5 instead of React). I also set the architecture: routes → controllers → business → services → tables, separate utils, and every error message in one JSON file behind a single dynamic error function. The AI generated most of the code under my direction.

I verified the result by:

- reviewing the code layer by layer;
- running the **45 backend integration tests** against a real PostgreSQL database, including the concurrency tests for duplicate receipts and payments;
- running `svelte-check` and the production builds of both apps (0 errors);
- testing every workflow from [docs/TEST_CASES.md](docs/TEST_CASES.md) in a real (headless Chromium) browser at desktop, tablet (768px) and phone (390px) widths, including a "response lost, user retries" scenario for goods receipts.

The browser testing found two bugs, and both were fixed:

1. An empty form field was reported as "too short" instead of "required".
2. Two pages scrolled horizontally on phone screens.

Open-source libraries used: Express, Zod, pg, pino, helmet, express-rate-limit, Vitest, Supertest, SvelteKit, Svelte, Tailwind CSS, and embedded-postgres (local development only). No code templates were copied.

### Demo URL

_To be added after deployment._
