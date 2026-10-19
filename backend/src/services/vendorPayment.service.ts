import { PurchaseOrdersTable, VendorPaymentsTable, VendorsTable } from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { Paginated, VendorPayment } from '../types/domain.types.js';
import { selectColumns, toOffset } from '../utils/sql.js';
import type { CreateVendorPaymentInput, ListVendorPaymentsQuery } from '../validators/vendorPayment.validator.js';

const T = VendorPaymentsTable;
const C = T.columns;
const V = VendorsTable.columns;
const PO = PurchaseOrdersTable.columns;

const PAYMENT_SELECT = `
  SELECT ${selectColumns(T, 'vp', [
    'id',
    'paymentNumber',
    'vendorId',
    'purchaseOrderId',
    'amount',
    'paymentDate',
    'paymentMethod',
    'referenceNo',
    'notes',
    'createdAt',
  ])},
         v.${V.name}       AS "vendorName",
         po.${PO.poNumber} AS "poNumber"
  FROM ${T.name} vp
  JOIN ${VendorsTable.name} v ON v.${V.id} = vp.${C.vendorId}
  LEFT JOIN ${PurchaseOrdersTable.name} po ON po.${PO.id} = vp.${C.purchaseOrderId}`;

export async function findPaymentByIdempotencyKey(
  db: Queryable,
  idempotencyKey: string,
): Promise<{ id: number; requestHash: string } | null> {
  const { rows } = await db.query<{ id: number; requestHash: string }>(
    `SELECT ${C.id} AS id, ${C.requestHash} AS "requestHash" FROM ${T.name} WHERE ${C.idempotencyKey} = $1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

export async function insertVendorPayment(
  db: Queryable,
  input: CreateVendorPaymentInput & { idempotencyKey: string; requestHash: string },
): Promise<{ id: number }> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ${T.name}
       (${C.vendorId}, ${C.purchaseOrderId}, ${C.amount}, ${C.paymentDate}, ${C.paymentMethod},
        ${C.referenceNo}, ${C.notes}, ${C.idempotencyKey}, ${C.requestHash})
     VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7, $8, $9)
     RETURNING ${C.id} AS id`,
    [
      input.vendorId,
      input.purchaseOrderId,
      input.amount,
      input.paymentDate,
      input.paymentMethod,
      input.referenceNo,
      input.notes,
      input.idempotencyKey,
      input.requestHash,
    ],
  );
  return rows[0]!;
}

export async function findPaymentById(db: Queryable, id: number): Promise<VendorPayment | null> {
  const { rows } = await db.query<VendorPayment>(`${PAYMENT_SELECT} WHERE vp.${C.id} = $1`, [id]);
  return rows[0] ?? null;
}

export async function listPayments(db: Queryable, query: ListVendorPaymentsQuery): Promise<Paginated<VendorPayment>> {
  const where = `WHERE ($1::bigint IS NULL OR vp.${C.vendorId} = $1)`;
  const params = [query.vendorId ?? null];
  const [list, count] = await Promise.all([
    db.query<VendorPayment>(`${PAYMENT_SELECT} ${where} ORDER BY vp.${C.id} DESC LIMIT $2 OFFSET $3`, [
      ...params,
      query.limit,
      toOffset(query),
    ]),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} vp ${where}`, params),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}
