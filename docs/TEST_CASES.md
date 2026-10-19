# Test Cases

## Automated (backend: `cd backend && npm test`)

45 tests run against a **real PostgreSQL** test database (`TEST_DATABASE_URL`). The schema is rebuilt from the migrations before each run, and the tables are truncated before each test.

| File | What it proves |
|---|---|
| `masterData.test.ts` | Valid vendor/product creation, required fields, invalid email/unit, unknown fields rejected, duplicate code/SKU → 409, invalid id → 400, malformed JSON → 400, unknown route → 404 |
| `purchaseOrder.test.ts` | Multi-line PO, line totals and header total rounded consistently (3 × 33.33 + 1.5 × 10.01 = 115.01), zero/negative qty and price rejected, empty items, duplicate products, nonexistent vendor/products → 404 with **nothing written** |
| `goodsReceipt.test.ts` | GRN + movement + stock increase exactly once; partial receipts and status changes; **same-key retry replays (stock unchanged)**; `"10"` and `10` count as the same payload; same key with a different payload → 409; **5 concurrent identical submissions → one receipt**; **4 concurrent different receipts racing for the last pending qty → only one wins**; fully received PO → 409; missing key → 400; invalid quantities (0, −5, "abc", 4 decimals) → 400; over-receipt → 422; **one bad line rolls back the whole receipt**; DB CHECK blocks over-receipt even outside the API |
| `vendorPayment.test.ts` | Payable created only on receipt; payment reduces the outstanding balance; exact full payment allowed, then nothing more; overpayment → 422 with nothing written; invalid amounts → 400; unknown vendor → 404; PO of another vendor → 422; PO-level outstanding enforced; idempotent replay; **5 concurrent payments cannot overpay**; vendor balance report with 2 POs, 3 GRNs and 3 payments shows **no fan-out** |
| `utils.test.ts` | Error-message factory (status + interpolation from JSON), exact decimal maths, key-order-independent payload hash |

## Manual test script (UI)

Prerequisites: backend and frontend running, database seeded (`npm run db:seed`).

| # | Steps | Expected |
|---|---|---|
| 1 | **Vendors** → *Add vendor* → Save with empty fields | Inline errors "code is required", "name is required" |
| 2 | Add vendor `SAINT-GOBAIN` again | Inline error on code: "A vendor with code 'SAINT-GOBAIN' already exists." |
| 3 | **New Purchase Order** (Alt+3) → choose vendor → line 1: Clear Float 5mm, qty `100`, price `450.50` → Alt+A → line 2: PVB, qty `50.5`, price `120` → Ctrl+Enter | Toast "Purchase order PO-00000X created · Total ₹51,110.00", and the PO page opens |
| 4 | New PO with qty `-3` or `0` | Inline red error under the quantity; nothing saved |
| 5 | On the PO page, enter Receive now = `60` for line 1 → *Receive goods* | Toast "Goods receipt GRN-… posted"; Received 60, Pending 40; status *Partially received*; Received value ₹27,030.00 |
| 6 | **Duplicate / retry:** stop the backend, enter 10 → *Receive goods* (network error toast), start the backend, click *Receive goods* again | Posted once. If the first request actually reached the server, the toast says "already recorded – stock was not added twice" |
| 7 | Enter `41` for line 1 (only 40 pending) | Error "Cannot receive 41.000 of 'Clear Float Glass 5mm': only 40.000 is still pending…"; stock unchanged |
| 8 | *Fill all pending* → *Receive goods* | Status *Received*; the receive form disappears |
| 9 | **Inventory** (Alt+1) → *Ledger →* for Clear Float 5mm | One movement row per GRN with the GRN number and balance after |
| 10 | **Vendor Payments** (Alt+4) → vendor → amount above the outstanding balance → Record | Error "Payment of … exceeds the outstanding balance of …"; nothing recorded |
| 11 | Click *Full* → Record | Toast with the new outstanding of ₹0.00; vendor row shows 0 |
| 12 | Choose a vendor with no receipts → any amount | "…has no outstanding balance. Advance payments are not supported." |
| 13 | Resize the browser to phone width | Sidebar becomes a ☰ menu, PO lines stack into cards, tables scroll horizontally |

## Manual API checks

See the `curl` walk-through at the end of [API.md](./API.md), or import [postman_collection.json](./postman_collection.json) and run the folders in order.
