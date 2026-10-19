import { pool } from '../db/pool.js';
import * as productService from '../services/product.service.js';
import * as stockMovementService from '../services/stockMovement.service.js';
import type { InventoryItem, Paginated, Product, StockMovement } from '../types/domain.types.js';
import { createError } from '../utils/appError.js';
import type { PageQuery } from '../utils/sql.js';
import type { ListQuery } from '../validators/common.validator.js';
import type { CreateProductInput } from '../validators/product.validator.js';

export async function createProduct(input: CreateProductInput): Promise<Product> {
  if (await productService.existsProductWithSku(pool, input.sku)) {
    throw createError('PRODUCT_SKU_EXISTS', { sku: input.sku });
  }
  return productService.insertProduct(pool, input);
}

export async function getProduct(productId: number): Promise<Product> {
  const product = await productService.findProductById(pool, productId);
  if (!product) throw createError('PRODUCT_NOT_FOUND', { productId });
  return product;
}

export function listProducts(query: ListQuery): Promise<Paginated<Product>> {
  return productService.listProducts(pool, query);
}

export function listInventory(query: ListQuery & { lowStockOnly?: boolean }): Promise<Paginated<InventoryItem>> {
  return productService.listInventory(pool, query);
}

/** Stock ledger for one product - lets a user trace every change to its stock. */
export async function getStockMovements(
  productId: number,
  page: PageQuery,
): Promise<{ product: Product; movements: Paginated<StockMovement> }> {
  const product = await getProduct(productId);
  const movements = await stockMovementService.listMovementsByProduct(pool, productId, page);
  return { product, movements };
}
