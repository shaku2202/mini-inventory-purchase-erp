import { PO_STATUS } from '../constants/enums.js';
import {
  GoodsReceiptsTable,
  ProductsTable,
  PurchaseOrderItemsTable,
  PurchaseOrdersTable,
  VendorPaymentsTable,
  VendorsTable,
} from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { Paginated, PurchaseOrder, PurchaseOrderItem } from '../types/domain.types.js';
import { selectColumns, toOffset } from '../utils/sql.js';
import type { CreatePurchaseOrderInput, ListPurchaseOrdersQuery } from '../validators/purchaseOrder.validator.js';

const T = PurchaseOrdersTable;
const C = T.columns;
const I = PurchaseOrderItemsTable;
const IC = I.columns;
const P = ProductsTable.columns;
const V = VendorsTable.columns;

const PO_SELECT = `
  SELECT ${selectColumns(T, 'po')},
         v.${V.code} AS "vendorCode",
         v.${V.name} AS "vendorName"
  FROM ${T.name} po
  JOIN ${VendorsTable.name} v ON v.${V.id} = po.${C.vendorId}`;

export async function insertPurchaseOrder(
  db: Queryable,
  input: Pick<CreatePurchaseOrderInput, 'vendorId' | 'orderDate' | 'expectedDate' | 'notes'>,
): Promise<{ id: number }> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ${T.name} (${C.vendorId}, ${C.orderDate}, ${C.expectedDate}, ${C.notes})
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4)
     RETURNING ${C.id} AS id`,
    [input.vendorId, input.orderDate, input.expectedDate, input.notes],
  );
  return rows[0]!;
}

/** Inserts all lines with a single round trip using UNNEST. */
export async function insertPurchaseOrderItems(
  db: Queryable,
  purchaseOrderId: number,
  items: CreatePurchaseOrderInput['items'],
): Promise<void> {
  await db.query(
    `INSERT INTO ${I.name} (${IC.purchaseOrderId}, ${IC.productId}, ${IC.quantity}, ${IC.unitPrice})
     SELECT $1, t.product_id, t.quantity, t.unit_price
     FROM unnest($2::bigint[], $3::numeric[], $4::numeric[]) AS t(product_id, quantity, unit_price)`,
    [purchaseOrderId, items.map((i) => i.productId), items.map((i) => i.quantity), items.map((i) => i.unitPrice)],
  );
}

/** PO total is always derived from its lines inside the same transaction. */
export async function refreshPurchaseOrderTotal(db: Queryable, purchaseOrderId: number): Promise<void> {
  await db.query(
    `UPDATE ${T.name} SET ${C.totalAmount} = (
       SELECT COALESCE(SUM(${IC.lineTotal}), 0) FROM ${I.name} WHERE ${IC.purchaseOrderId} = $1
     ) WHERE ${C.id} = $1`,
    [purchaseOrderId],
  );
}

export async function findPurchaseOrderById(
  db: Queryable,
  id: number,
  options: { forUpdate?: boolean } = {},
): Promise<PurchaseOrder | null> {
  const { rows } = await db.query<PurchaseOrder>(
    `${PO_SELECT} WHERE po.${C.id} = $1 ${options.forUpdate ? 'FOR UPDATE OF po' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Lines of a PO with product info. With `forUpdate` the lines are row-locked
 * (in id order) so two concurrent receipts cannot both pass the
 * "pending quantity" check.
 */
export async function findPurchaseOrderItems(
  db: Queryable,
  purchaseOrderId: number,
  options: { forUpdate?: boolean } = {},
): Promise<PurchaseOrderItem[]> {
  const { rows } = await db.query<PurchaseOrderItem>(
    `SELECT ${selectColumns(I, 'i', ['id', 'purchaseOrderId', 'productId', 'quantity', 'unitPrice', 'lineTotal', 'receivedQuantity'])},
            (i.${IC.quantity} - i.${IC.receivedQuantity})::numeric(14,3) AS "pendingQuantity",
            p.${P.sku}  AS "productSku",
            p.${P.name} AS "productName",
            p.${P.unit} AS "unit"
     FROM ${I.name} i
     JOIN ${ProductsTable.name} p ON p.${P.id} = i.${IC.productId}
     WHERE i.${IC.purchaseOrderId} = $1
     ORDER BY i.${IC.id}
     ${options.forUpdate ? 'FOR UPDATE OF i' : ''}`,
    [purchaseOrderId],
  );
  return rows;
}

export async function listPurchaseOrders(db: Queryable, query: ListPurchaseOrdersQuery): Promise<Paginated<PurchaseOrder>> {
  const search = query.search ? `%${query.search}%` : null;
  const where = `WHERE ($1::bigint IS NULL OR po.${C.vendorId} = $1)
      AND ($2::text IS NULL OR po.${C.status} = $2)
      AND ($3::text IS NULL OR po.${C.poNumber} ILIKE $3 OR v.${V.name} ILIKE $3)`;
  const params = [query.vendorId ?? null, query.status ?? null, search];

  const [list, count] = await Promise.all([
    db.query<PurchaseOrder>(`${PO_SELECT} ${where} ORDER BY po.${C.id} DESC LIMIT $4 OFFSET $5`, [
      ...params,
      query.limit,
      toOffset(query),
    ]),
    db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM ${T.name} po JOIN ${VendorsTable.name} v ON v.${V.id} = po.${C.vendorId} ${where}`,
      params,
    ),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}

export async function incrementReceivedQuantity(db: Queryable, purchaseOrderItemId: number, quantity: string): Promise<void> {
  await db.query(
    `UPDATE ${I.name} SET ${IC.receivedQuantity} = ${IC.receivedQuantity} + $2::numeric WHERE ${IC.id} = $1`,
    [purchaseOrderItemId, quantity],
  );
}

/** Derives OPEN / PARTIALLY_RECEIVED / RECEIVED from the line quantities. */
export async function refreshPurchaseOrderStatus(db: Queryable, purchaseOrderId: number): Promise<void> {
  await db.query(
    `UPDATE ${T.name} po SET ${C.status} = s.status
     FROM (
       SELECT CASE
                WHEN bool_and(${IC.receivedQuantity} >= ${IC.quantity}) THEN '${PO_STATUS.RECEIVED}'
                WHEN bool_or(${IC.receivedQuantity} > 0)               THEN '${PO_STATUS.PARTIALLY_RECEIVED}'
                ELSE '${PO_STATUS.OPEN}'
              END AS status
       FROM ${I.name} WHERE ${IC.purchaseOrderId} = $1
     ) s
     WHERE po.${C.id} = $1 AND po.${C.status} IS DISTINCT FROM s.status`,
    [purchaseOrderId],
  );
}

const GR = GoodsReceiptsTable;
const VP = VendorPaymentsTable;

/**
 * Financial position of one PO. Each child table is aggregated in its own
 * sub-query so receipts and payments cannot multiply each other.
 */
export async function getPurchaseOrderFinancials(
  db: Queryable,
  purchaseOrderId: number,
): Promise<{ receivedValue: string; paidAmount: string; outstandingAmount: string }> {
  const { rows } = await db.query<{ receivedValue: string; paidAmount: string; outstandingAmount: string }>(
    `SELECT r.v AS "receivedValue", p.v AS "paidAmount", (r.v - p.v)::numeric(14,2) AS "outstandingAmount"
     FROM (SELECT COALESCE(SUM(${GR.columns.totalValue}), 0)::numeric(14,2) AS v
           FROM ${GR.name} WHERE ${GR.columns.purchaseOrderId} = $1) r,
          (SELECT COALESCE(SUM(${VP.columns.amount}), 0)::numeric(14,2) AS v
           FROM ${VP.name} WHERE ${VP.columns.purchaseOrderId} = $1) p`,
    [purchaseOrderId],
  );
  return rows[0]!;
}
