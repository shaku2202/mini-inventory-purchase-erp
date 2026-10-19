import {
  GoodsReceiptItemsTable,
  GoodsReceiptsTable,
  ProductsTable,
  PurchaseOrdersTable,
  VendorsTable,
} from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { GoodsReceipt, GoodsReceiptItem, Paginated } from '../types/domain.types.js';
import { selectColumns, toOffset } from '../utils/sql.js';
import type { ListGoodsReceiptsQuery } from '../validators/goodsReceipt.validator.js';

const T = GoodsReceiptsTable;
const C = T.columns;
const I = GoodsReceiptItemsTable;
const IC = I.columns;
const PO = PurchaseOrdersTable.columns;
const V = VendorsTable.columns;
const P = ProductsTable.columns;

const RECEIPT_SELECT = `
  SELECT ${selectColumns(T, 'gr', ['id', 'grnNumber', 'purchaseOrderId', 'vendorId', 'receivedDate', 'totalValue', 'notes', 'createdAt'])},
         po.${PO.poNumber} AS "poNumber",
         v.${V.name}       AS "vendorName"
  FROM ${T.name} gr
  JOIN ${PurchaseOrdersTable.name} po ON po.${PO.id} = gr.${C.purchaseOrderId}
  JOIN ${VendorsTable.name} v ON v.${V.id} = gr.${C.vendorId}`;

export interface ReceiptLineToInsert {
  purchaseOrderItemId: number;
  productId: number;
  quantity: string;
  unitPrice: string;
}

export async function findReceiptByIdempotencyKey(
  db: Queryable,
  idempotencyKey: string,
): Promise<{ id: number; requestHash: string } | null> {
  const { rows } = await db.query<{ id: number; requestHash: string }>(
    `SELECT ${C.id} AS id, ${C.requestHash} AS "requestHash" FROM ${T.name} WHERE ${C.idempotencyKey} = $1`,
    [idempotencyKey],
  );
  return rows[0] ?? null;
}

/**
 * Inserts the GRN header. Its total is computed by PostgreSQL from the same
 * line values (round(qty * price, 2)) that the generated line_value column
 * uses, so header and lines can never disagree.
 */
export async function insertGoodsReceipt(
  db: Queryable,
  header: {
    purchaseOrderId: number;
    vendorId: number;
    receivedDate: string | null;
    notes: string | null;
    idempotencyKey: string;
    requestHash: string;
  },
  lines: ReceiptLineToInsert[],
): Promise<{ id: number }> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO ${T.name}
       (${C.purchaseOrderId}, ${C.vendorId}, ${C.receivedDate}, ${C.notes}, ${C.idempotencyKey}, ${C.requestHash}, ${C.totalValue})
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6,
             (SELECT SUM(round(q * p, 2)) FROM unnest($7::numeric[], $8::numeric[]) AS t(q, p)))
     RETURNING ${C.id} AS id`,
    [
      header.purchaseOrderId,
      header.vendorId,
      header.receivedDate,
      header.notes,
      header.idempotencyKey,
      header.requestHash,
      lines.map((l) => l.quantity),
      lines.map((l) => l.unitPrice),
    ],
  );
  return rows[0]!;
}

export async function insertGoodsReceiptItems(db: Queryable, goodsReceiptId: number, lines: ReceiptLineToInsert[]): Promise<void> {
  await db.query(
    `INSERT INTO ${I.name} (${IC.goodsReceiptId}, ${IC.purchaseOrderItemId}, ${IC.productId}, ${IC.quantity}, ${IC.unitPrice})
     SELECT $1, t.po_item_id, t.product_id, t.quantity, t.unit_price
     FROM unnest($2::bigint[], $3::bigint[], $4::numeric[], $5::numeric[]) AS t(po_item_id, product_id, quantity, unit_price)`,
    [
      goodsReceiptId,
      lines.map((l) => l.purchaseOrderItemId),
      lines.map((l) => l.productId),
      lines.map((l) => l.quantity),
      lines.map((l) => l.unitPrice),
    ],
  );
}

export async function findGoodsReceiptById(db: Queryable, id: number): Promise<GoodsReceipt | null> {
  const { rows } = await db.query<GoodsReceipt>(`${RECEIPT_SELECT} WHERE gr.${C.id} = $1`, [id]);
  return rows[0] ?? null;
}

export async function findGoodsReceiptItems(db: Queryable, goodsReceiptId: number): Promise<GoodsReceiptItem[]> {
  const { rows } = await db.query<GoodsReceiptItem>(
    `SELECT ${selectColumns(I, 'gi', ['id', 'purchaseOrderItemId', 'productId', 'quantity', 'unitPrice', 'lineValue'])},
            p.${P.sku}  AS "productSku",
            p.${P.name} AS "productName",
            p.${P.unit} AS "unit"
     FROM ${I.name} gi
     JOIN ${ProductsTable.name} p ON p.${P.id} = gi.${IC.productId}
     WHERE gi.${IC.goodsReceiptId} = $1
     ORDER BY gi.${IC.id}`,
    [goodsReceiptId],
  );
  return rows;
}

export async function listGoodsReceipts(db: Queryable, query: ListGoodsReceiptsQuery): Promise<Paginated<GoodsReceipt>> {
  const where = `WHERE ($1::bigint IS NULL OR gr.${C.purchaseOrderId} = $1)`;
  const params = [query.purchaseOrderId ?? null];
  const [list, count] = await Promise.all([
    db.query<GoodsReceipt>(`${RECEIPT_SELECT} ${where} ORDER BY gr.${C.id} DESC LIMIT $2 OFFSET $3`, [
      ...params,
      query.limit,
      toOffset(query),
    ]),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} gr ${where}`, params),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}
