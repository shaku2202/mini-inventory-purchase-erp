# API Reference

Base URL: `http://localhost:4000/api` · JSON in, JSON out · A ready-to-import Postman collection is in [`postman_collection.json`](./postman_collection.json).

## Conventions

**Success**

```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

**Error** (every error looks like this; `code` is stable, `message` comes from `backend/src/constants/errorMessages.json`)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed. Check 'details' for the invalid fields.",
    "details": [{ "field": "items[0].quantity", "code": "FIELD_MUST_BE_POSITIVE", "message": "items[0].quantity must be greater than 0." }],
    "requestId": "3641906d-2a43-4e52-bfd9-355d9ae25bc5"
  }
}
```

- **Money and quantities are decimal strings** in responses (`"450.50"`, `"60.000"`). Requests accept a number or a numeric string. Money allows up to 2 decimals, quantities up to 3.
- Unknown request fields are rejected (`FIELD_UNKNOWN`). They are not silently ignored.
- `X-Request-Id` is returned on every response, and the client can also send it. Quote it when you report a problem.

**Status codes used**

| Code | Meaning |
|---|---|
| 200 | OK, or an idempotent replay (`Idempotent-Replayed: true`) |
| 201 | Created |
| 400 | Validation failed, malformed JSON, or missing/invalid `Idempotency-Key` |
| 403 | CORS origin not allowed |
| 404 | Vendor / product / PO not found, or unknown route |
| 409 | Duplicate (vendor code, SKU), PO already fully received, or idempotency key reused with a different payload |
| 422 | Business rule violated (over-receipt, overpayment, PO of another vendor, ...) |
| 429 | Rate limit (120 writes / minute / IP) |
| 500 / 503 | Unexpected error / database unreachable. Details are logged on the server, never returned to the client |

### Idempotency (duplicate protection)

`POST /goods-receipts` and `POST /vendor-payments` **require** an `Idempotency-Key` header: 8 to 100 characters, `[A-Za-z0-9_:-]`. Generate one key per user action (e.g. `grn-<uuid>`) and **send the same key on every retry**.

| Situation | Result |
|---|---|
| First request with the key | `201`, `Idempotent-Replayed: false` |
| Same key + same payload again (retry, double click, network timeout) | `200`, `Idempotent-Replayed: true`, **the original record**. Nothing is changed a second time |
| Same key + different payload | `409 IDEMPOTENCY_KEY_REUSED` |

---

## Endpoints

### Health
`GET /health` returns `{ status: "ok", database: "up", latencyMs }`, or 503 if the database is down.

### Vendors

`POST /vendors`

```json
{ "code": "SAINT-GOBAIN", "name": "Saint-Gobain Glass India", "contactPerson": "Rahul Mehta",
  "email": "purchase@sg.example", "phone": "+91 98765 43210", "gstin": "33AAACS1234A1Z5", "address": "Chennai" }
```

`code` (2 to 30 chars, `A-Z 0-9 - _`, upper-cased automatically) and `name` are required. The other fields are optional. Returns `201` with the vendor, or `409 VENDOR_CODE_EXISTS`.

`GET /vendors?search=&page=1&limit=20`: list vendors.
`GET /vendors/:id`: one vendor.
`GET /vendors/balances`: purchase / payable / payment summary for **all** vendors.
`GET /vendors/:id/balance`: the same summary for one vendor:

```json
{ "vendorId": 1, "vendorCode": "SAINT-GOBAIN", "vendorName": "Saint-Gobain Glass India",
  "purchaseOrderCount": 1, "totalOrderedValue": "51110.00",
  "goodsReceiptCount": 1, "totalReceivedValue": "27030.00",
  "paymentCount": 1, "totalPaid": "10000.00", "outstandingBalance": "17030.00" }
```

### Products

`POST /products`

```json
{ "sku": "CLR-FLT-5MM", "name": "Clear Float Glass 5mm", "unit": "SQM", "reorderLevel": 200, "description": "2140 x 3300 mm" }
```

`unit` is one of `PCS, SQM, SQFT, KG, LTR, MTR, BOX`. Opening stock is always 0. Returns `409 PRODUCT_SKU_EXISTS` for a duplicate SKU.
`GET /products?search=`, `GET /products/:id`

### Inventory

`GET /inventory?search=&lowStockOnly=true&page=1&limit=50`: stock per product, with `currentStock`, `reorderLevel`, `incomingQuantity` (still pending on open POs), `isLowStock` and `lastMovementAt`.

`GET /inventory/:productId/movements?page=1&limit=25`: the stock ledger, newest first. Each row has `movementType`, a signed `quantity`, `balanceAfter` and its reference (e.g. `GRN-000001`).

### Purchase orders

`POST /purchase-orders`

```json
{
  "vendorId": 1,
  "orderDate": "2026-10-19",
  "expectedDate": "2026-10-25",
  "notes": "Quotation Q-118",
  "items": [
    { "productId": 1, "quantity": 100, "unitPrice": "450.50" },
    { "productId": 4, "quantity": "50.5", "unitPrice": 120 }
  ]
}
```

- `items` must have 1 to 100 lines, and a product may appear only once (`PO_DUPLICATE_PRODUCT`).
- `quantity > 0` and `unitPrice > 0`.
- The server calculates `lineTotal = round(qty × price, 2)` and `totalAmount = Σ lineTotal`. Any total sent by the client is not accepted.
- Errors: `404 VENDOR_NOT_FOUND`, `404 PRODUCTS_NOT_FOUND` (with `details.productIds`), `422 VENDOR_INACTIVE`.

Returns `201` with the PO detail: header, `items[]` (with `receivedQuantity` and `pendingQuantity`), `receivedValue`, `paidAmount` and `outstandingAmount`.

`GET /purchase-orders?status=OPEN|PARTIALLY_RECEIVED|RECEIVED&vendorId=&search=`
`GET /purchase-orders/:id`

### Goods receipts

`POST /goods-receipts` (header **`Idempotency-Key`** required)

```json
{ "purchaseOrderId": 1, "receivedDate": "2026-10-19", "notes": "Challan 5531",
  "items": [ { "purchaseOrderItemId": 1, "quantity": 60 } ] }
```

The following happens in **one transaction**:

1. A GRN row and its line rows are created. The unit price always comes from the PO line.
2. `received_quantity` on the PO line increases.
3. `current_stock` on the product increases, and a `stock_movements` row is written with `balance_after`.
4. The PO status is recalculated.

Partial receipts are allowed.

| Error | When |
|---|---|
| `404 PURCHASE_ORDER_NOT_FOUND` | Unknown PO |
| `409 PO_ALREADY_FULLY_RECEIVED` | Nothing is pending on the PO |
| `422 RECEIPT_EXCEEDS_PENDING_QTY` | qty > ordered − already received (`details` gives `requested` and `pending`) |
| `422 RECEIPT_ITEM_NOT_IN_PO` | The line belongs to another PO |
| `400 RECEIPT_DUPLICATE_ITEM` | The same PO line appears twice in one receipt |

`GET /goods-receipts?purchaseOrderId=`, `GET /goods-receipts/:id`

### Vendor payments

`POST /vendor-payments` (header **`Idempotency-Key`** required)

```json
{ "vendorId": 1, "purchaseOrderId": 1, "amount": "10000.00", "paymentMethod": "BANK_TRANSFER",
  "paymentDate": "2026-10-19", "referenceNo": "UTR123456", "notes": "Part payment" }
```

`paymentMethod` is one of `BANK_TRANSFER, CHEQUE, CASH, UPI`. `purchaseOrderId` is optional. Leave it out for an on-account payment.

| Error | When |
|---|---|
| `404 VENDOR_NOT_FOUND` / `PURCHASE_ORDER_NOT_FOUND` | Unknown vendor or PO |
| `422 PAYMENT_NO_OUTSTANDING` | The vendor owes nothing (advance payments are not supported) |
| `422 PAYMENT_EXCEEDS_OUTSTANDING` | amount > vendor outstanding (`details.outstanding`) |
| `422 PAYMENT_EXCEEDS_PO_OUTSTANDING` | amount > what is still owed on that PO |
| `422 PO_VENDOR_MISMATCH` | The PO belongs to a different vendor |

The response contains `{ payment, vendorBalance }`, where `vendorBalance` is the recalculated outstanding balance.

`GET /vendor-payments?vendorId=`

---

## curl walk-through

```bash
A=http://localhost:4000/api
curl -X POST $A/purchase-orders -H 'Content-Type: application/json' \
  -d '{"vendorId":1,"items":[{"productId":1,"quantity":100,"unitPrice":"450.50"}]}'

# receive 60 - run it twice: the 2nd call replays (200), stock rises only once
curl -i -X POST $A/goods-receipts -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-grn-0001' \
  -d '{"purchaseOrderId":1,"items":[{"purchaseOrderItemId":1,"quantity":60}]}'

curl $A/inventory/1/movements
curl $A/vendors/1/balance                       # outstanding 27030.00

curl -X POST $A/vendor-payments -H 'Content-Type: application/json' -H 'Idempotency-Key: demo-pay-0001' \
  -d '{"vendorId":1,"amount":"30000","paymentMethod":"UPI"}'      # 422 PAYMENT_EXCEEDS_OUTSTANDING
```
