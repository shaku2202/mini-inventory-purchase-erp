# Design Decisions, Assumptions & Limitations

## 1. Deviations from the original brief (agreed with the recruiter)

| Brief said | Built with | Why |
|---|---|---|
| MySQL | **PostgreSQL 14+** | Requested by JP Safety Glass. The ERP's production database is PostgreSQL. |
| React + TypeScript preferred | **Svelte 5 (Runes) + SvelteKit + Tailwind CSS** | The company's ERP front end uses this stack. The brief allows "another modern frontend framework if agreed". |

Backend: **Node.js + TypeScript (strict) + Express 5**, with Zod for validation and `pg` with plain parameterised SQL (no ORM).

## 2. Backend architecture

```
HTTP ─► routes/        URL → controller mapping only
        controllers/   HTTP concerns: validate input (Zod), read headers, pick the status code, send the envelope
        business/      Business rules, transactions, idempotency, locking. Has no knowledge of Express
        services/      Data access: one function per SQL statement, takes a Queryable (pool OR tx client)
        tables/        Table/column definitions (camelCase ↔ snake_case), the single place column names live
        validators/    Zod schemas per resource
        utils/         appError (dynamic error factory), validateInput, decimal, hash, response, sql helpers
        constants/     errorMessages.json (every message + HTTP status) and enums
        db/            pool, withTransaction, migration runner, seed
        middlewares/   error handler, 404, CORS, rate limit
```

- **The business layer owns the transaction.** Services accept a `Queryable`, so the same `findVendorById` works on the pool for a read and inside `withTransaction` for a locked read. The business layer decides which one to use.
- **Errors in one place.** `createError('VENDOR_NOT_FOUND', { vendorId: 42 })` looks up the status and template in `errorMessages.json` and fills in the placeholders. Zod issues are translated into the same codes (`FIELD_REQUIRED`, `FIELD_MUST_BE_POSITIVE`, …). PostgreSQL constraint errors are mapped to 4xx codes as a safety net (`utils/dbError.ts`). Clients never see stack traces or SQL.

## 3. Database design

Tables: `vendors`, `products`, `purchase_orders`, `purchase_order_items`, `goods_receipts`, `goods_receipt_items`, `stock_movements`, `vendor_payments`, plus the `v_vendor_balances` view and `schema_migrations`.

- **Money is `NUMERIC(14,2)` and quantity is `NUMERIC(14,3)`.** Glass is bought by the sqm, so quantities can be fractional. These values travel as strings end to end. JavaScript floats are never used for business values. Comparisons in JS use scaled `BigInt` (`utils/decimal.ts`).
- **Generated columns:** `line_total` and `line_value = round(qty × price, 2)`. The PO header total is recalculated from the lines in the same transaction, and the GRN total is computed by SQL with the same expression. As a result, header and lines cannot disagree.
- **Invariants enforced by the database as well**, not only by the API:
  - `CHECK (current_stock >= 0)`
  - `CHECK (0 <= received_quantity <= quantity)` (the last line of defence against over-receipt or double receipt)
  - `CHECK (amount > 0)`, quantity > 0 and price > 0
  - Status, unit and method enums
  - `UNIQUE (purchase_order_id, product_id)`
  - `UNIQUE (idempotency_key)`
- **Foreign keys** use `ON DELETE RESTRICT` for anything financial. Only PO lines and GRN lines cascade with their header.
- **Indexes** cover every foreign key, `(product_id, created_at DESC)` for the ledger, status, lower(name) for search, and a partial index on payments that are allocated to a PO.
- **Business numbers** (`PO-000001`, `GRN-000001`, `PAY-000001`) come from dedicated sequences. Gaps can appear after a rollback, which is normal for sequences.
- **Stock:** `products.current_stock` is a denormalised running balance kept for fast reads. `stock_movements` is the ledger and the source of truth, and each row stores `balance_after`. Both are written in the same transaction.

### Vendor balance query (task 4)

The query is in `backend/migrations/002_vendor_balance_view.sql` (as the view `v_vendor_balances`) and in `backend/sql/reports/vendor_balance_summary.sql` (stand-alone, plus a per-PO drill-down).

Purchase orders, goods receipts and payments are three independent one-to-many relations of a vendor. Joining them directly fans the rows out: 2 POs × 3 payments gives 6 rows, so every `SUM` is multiplied. Each child table is therefore **aggregated per vendor in its own CTE first** and only then `LEFT JOIN`ed to `vendors`. A test (`vendorPayment.test.ts › no fan-out`) covers 2 POs, 3 receipts and 3 payments.

## 4. Business rules & policies

| Topic | Decision |
|---|---|
| **Payable policy** | A vendor is owed the **value of goods received** (GRN qty × PO unit price), not the value ordered. `outstanding = Σ GRN value − Σ payments`. This is the usual "pay for what you received" practice in purchasing. |
| Receipt price | Always the PO line price. The client cannot send a price on a receipt. |
| Partial receipts | Allowed. PO status is `OPEN`, then `PARTIALLY_RECEIVED`, then `RECEIVED`. |
| Over-receipt | Rejected (`422`). Receiving more than ordered would need a PO amendment, which is out of scope. |
| Advance / overpayment | **Not supported.** `amount ≤ outstanding`. A vendor with nothing outstanding gets `422 PAYMENT_NO_OUTSTANDING`. |
| Payment allocation | A payment is allocated to the vendor. It can optionally be allocated to one PO (the "invoice"), and then it must also be ≤ that PO's received value minus the payments already made on that PO. |
| Inactive vendors / products | Cannot be used on a new PO. |
| Duplicate product on a PO | Rejected. Quantities must be combined into one line. |

## 5. Duplicate protection & transaction integrity

**Goods receipt**

1. **`Idempotency-Key` header (required).** Inside the transaction, `pg_advisory_xact_lock(namespace, hashtext(key))` serialises requests that share a key. The key is then looked up:
   - Found with the same payload hash (SHA-256 of the canonicalised, validated body): the original GRN is returned with `200` and `Idempotent-Replayed: true`.
   - Found with a different hash: `409`.
   - The unique constraint on the key also covers any race.
2. **Row locks.** `SELECT … FOR UPDATE` on the PO and its lines, so two different receipts for the same PO run one after the other, and each checks the still-pending quantity again. Product rows are updated in ascending id order to prevent deadlocks.
3. **The DB CHECK** on `received_quantity`.

**Payment:** the same idempotency mechanism, plus `SELECT … FOR UPDATE` on the vendor row. Two simultaneous payments therefore cannot both pass the outstanding-balance check. A test fires 5 concurrent payments of 400 against an outstanding 1000; exactly 2 succeed.

**Atomicity:** every multi-step write runs inside `withTransaction` (BEGIN, then COMMIT, or ROLLBACK on any error). A test shows that one invalid line rolls back the whole receipt: no GRN, no stock change and no movement row.

**Front end:** each receipt or payment form holds one idempotency key. The key is kept when the request fails, so **Retry after a timeout is safe**. It is renewed only after a confirmed success (or after `IDEMPOTENCY_KEY_REUSED`). The submit button is also disabled while the request is in flight.

## 6. Security

- No secrets in code. All configuration comes from environment variables, and `config/env.ts` validates it with Zod at boot and refuses to start if it is invalid. `.env` is git-ignored and `.env.example` documents every variable.
- Every SQL statement is parameterised. Table and column names come from constants, never from user input.
- `helmet` headers, a CORS allow-list (`CORS_ORIGINS`), a 100 KB JSON body limit, write rate limiting, and the `x-powered-by` header removed.
- Errors return generic messages for 5xx. Full detail goes to the structured pino log with a `requestId` for correlation.
- **No authentication / RBAC** in this exercise (see limitations).

## 7. Assumptions

- Single currency (INR) and single warehouse / location.
- Taxes (GST), discounts and freight are not modelled. Prices are taken as net of tax.
- `receivedDate` and `paymentDate` default to today. Back-dating is allowed; the UI blocks future dates.
- A vendor or product is never deleted once used (`RESTRICT`). `is_active` exists for deactivation, but there is no UI for it yet.

## 8. Known limitations / not implemented

- **No authentication / roles.** In production, JWT or session auth with roles (Purchase, Stores, Accounts) would sit in front of the routes, and `created_by` columns would be added.
- No edit or cancel of POs, no GRN reversal / return-to-vendor, and no stock issue or adjustment UI. The `stock_movements` types are already in place for these.
- No vendor invoice (bill) entity. A PO plays the role of the "invoice" for payment allocation. A full 3-way match (PO ↔ GRN ↔ Invoice) is the natural next step.
- No PWA / offline mode.
- Lists use offset pagination. Keyset pagination would be better for very large tables.
- Front-end automated tests are not included. The business rules are covered by 45 backend integration tests against a real PostgreSQL database.
