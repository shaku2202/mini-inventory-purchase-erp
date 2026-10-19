import { PO_STATUS } from '../constants/enums.js';
import { ProductsTable, PurchaseOrderItemsTable, PurchaseOrdersTable, StockMovementsTable } from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { InventoryItem, Paginated, Product } from '../types/domain.types.js';
import { selectColumns, toOffset } from '../utils/sql.js';
import type { ListQuery } from '../validators/common.validator.js';
import type { CreateProductInput } from '../validators/product.validator.js';

const T = ProductsTable;
const C = T.columns;
const PRODUCT_COLUMNS = selectColumns(T);

export async function insertProduct(db: Queryable, input: CreateProductInput): Promise<Product> {
  const { rows } = await db.query<Product>(
    `INSERT INTO ${T.name} (${C.sku}, ${C.name}, ${C.description}, ${C.unit}, ${C.reorderLevel})
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PRODUCT_COLUMNS}`,
    [input.sku, input.name, input.description, input.unit, input.reorderLevel],
  );
  return rows[0]!;
}

export async function findProductById(db: Queryable, id: number): Promise<Product | null> {
  const { rows } = await db.query<Product>(`SELECT ${PRODUCT_COLUMNS} FROM ${T.name} WHERE ${C.id} = $1`, [id]);
  return rows[0] ?? null;
}

export async function existsProductWithSku(db: Queryable, sku: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM ${T.name} WHERE ${C.sku} = $1`, [sku]);
  return rows.length > 0;
}

/** Returns the subset of `ids` that exist and are active. */
export async function findActiveProductIds(db: Queryable, ids: number[]): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT ${C.id} AS id FROM ${T.name} WHERE ${C.id} = ANY($1::bigint[]) AND ${C.isActive}`,
    [ids],
  );
  return rows.map((r) => r.id);
}

export async function listProducts(db: Queryable, query: ListQuery): Promise<Paginated<Product>> {
  const search = query.search ? `%${query.search}%` : null;
  const where = `WHERE ($1::text IS NULL OR ${C.name} ILIKE $1 OR ${C.sku} ILIKE $1)`;
  const [list, count] = await Promise.all([
    db.query<Product>(
      `SELECT ${PRODUCT_COLUMNS} FROM ${T.name} ${where} ORDER BY ${C.name} LIMIT $2 OFFSET $3`,
      [search, query.limit, toOffset(query)],
    ),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} ${where}`, [search]),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}

/**
 * Atomically adds `quantity` to the running stock and returns the new
 * balance. The UPDATE takes a row lock, so concurrent receipts of the same
 * product are serialised and no increment is lost.
 */
export async function incrementStock(db: Queryable, productId: number, quantity: string): Promise<string> {
  const { rows } = await db.query<{ currentStock: string }>(
    `UPDATE ${T.name} SET ${C.currentStock} = ${C.currentStock} + $2::numeric
     WHERE ${C.id} = $1
     RETURNING ${C.currentStock} AS "currentStock"`,
    [productId, quantity],
  );
  return rows[0]!.currentStock;
}

const POI = PurchaseOrderItemsTable.columns;
const PO = PurchaseOrdersTable.columns;
const SM = StockMovementsTable.columns;

/** Stock levels + quantity still expected on open purchase orders. */
export async function listInventory(db: Queryable, query: ListQuery & { lowStockOnly?: boolean }): Promise<Paginated<InventoryItem>> {
  const search = query.search ? `%${query.search}%` : null;
  const where = `WHERE p.${C.isActive}
      AND ($1::text IS NULL OR p.${C.name} ILIKE $1 OR p.${C.sku} ILIKE $1)
      AND (NOT $2::boolean OR p.${C.currentStock} <= p.${C.reorderLevel})`;
  const params = [search, query.lowStockOnly ?? false];

  const [list, count] = await Promise.all([
    db.query<InventoryItem>(
      `SELECT ${selectColumns(T, 'p', ['id', 'sku', 'name', 'unit', 'reorderLevel', 'currentStock'])},
              COALESCE(incoming.qty, 0)::numeric(14,3)                   AS "incomingQuantity",
              (p.${C.currentStock} <= p.${C.reorderLevel})                AS "isLowStock",
              last_move.created_at                                        AS "lastMovementAt"
       FROM ${T.name} p
       LEFT JOIN (
         SELECT i.${POI.productId} AS product_id, SUM(i.${POI.quantity} - i.${POI.receivedQuantity}) AS qty
         FROM ${PurchaseOrderItemsTable.name} i
         JOIN ${PurchaseOrdersTable.name} po ON po.${PO.id} = i.${POI.purchaseOrderId}
         WHERE po.${PO.status} <> '${PO_STATUS.RECEIVED}'
         GROUP BY i.${POI.productId}
       ) incoming ON incoming.product_id = p.${C.id}
       LEFT JOIN LATERAL (
         SELECT sm.${SM.createdAt} AS created_at FROM ${StockMovementsTable.name} sm
         WHERE sm.${SM.productId} = p.${C.id}
         ORDER BY sm.${SM.createdAt} DESC, sm.${SM.id} DESC LIMIT 1
       ) last_move ON TRUE
       ${where}
       ORDER BY p.${C.name}
       LIMIT $3 OFFSET $4`,
      [...params, query.limit, toOffset(query)],
    ),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} p ${where}`, params),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}
