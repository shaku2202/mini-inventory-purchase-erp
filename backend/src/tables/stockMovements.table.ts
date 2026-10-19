import { defineTable } from '../utils/sql.js';

export const StockMovementsTable = defineTable('stock_movements', {
  id: 'id',
  productId: 'product_id',
  movementType: 'movement_type',
  quantity: 'quantity',
  balanceAfter: 'balance_after',
  referenceType: 'reference_type',
  referenceId: 'reference_id',
  remarks: 'remarks',
  createdAt: 'created_at',
});
