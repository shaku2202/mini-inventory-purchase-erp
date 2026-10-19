import { REFERENCE_TYPE, type MovementType } from '../constants/enums.js';
import { GoodsReceiptsTable, StockMovementsTable } from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { Paginated, StockMovement } from '../types/domain.types.js';
import { selectColumns, toOffset, type PageQuery } from '../utils/sql.js';

const T = StockMovementsTable;
const C = T.columns;
const GR = GoodsReceiptsTable.columns;

export async function insertStockMovement(
  db: Queryable,
  movement: {
    productId: number;
    movementType: MovementType;
    quantity: string;
    balanceAfter: string;
    referenceType: string;
    referenceId: number;
    remarks?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO ${T.name} (${C.productId}, ${C.movementType}, ${C.quantity}, ${C.balanceAfter}, ${C.referenceType}, ${C.referenceId}, ${C.remarks})
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      movement.productId,
      movement.movementType,
      movement.quantity,
      movement.balanceAfter,
      movement.referenceType,
      movement.referenceId,
      movement.remarks ?? null,
    ],
  );
}

/** Stock ledger of a product, newest first, with the human readable document number. */
export async function listMovementsByProduct(db: Queryable, productId: number, page: PageQuery): Promise<Paginated<StockMovement>> {
  const [list, count] = await Promise.all([
    db.query<StockMovement>(
      `SELECT ${selectColumns(T, 'sm')},
              CASE WHEN sm.${C.referenceType} = '${REFERENCE_TYPE.GOODS_RECEIPT}' THEN gr.${GR.grnNumber} END AS "referenceNumber"
       FROM ${T.name} sm
       LEFT JOIN ${GoodsReceiptsTable.name} gr
              ON sm.${C.referenceType} = '${REFERENCE_TYPE.GOODS_RECEIPT}' AND gr.${GR.id} = sm.${C.referenceId}
       WHERE sm.${C.productId} = $1
       ORDER BY sm.${C.createdAt} DESC, sm.${C.id} DESC
       LIMIT $2 OFFSET $3`,
      [productId, page.limit, toOffset(page)],
    ),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} WHERE ${C.productId} = $1`, [productId]),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}
