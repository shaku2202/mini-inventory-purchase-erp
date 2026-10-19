import { defineTable } from '../utils/sql.js';

export const ProductsTable = defineTable('products', {
  id: 'id',
  sku: 'sku',
  name: 'name',
  description: 'description',
  unit: 'unit',
  reorderLevel: 'reorder_level',
  currentStock: 'current_stock',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});
