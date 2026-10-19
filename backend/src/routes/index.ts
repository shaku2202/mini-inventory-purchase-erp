import { Router } from 'express';
import { pool } from '../db/pool.js';
import { goodsReceiptRouter } from './goodsReceipt.routes.js';
import { inventoryRouter } from './inventory.routes.js';
import { productRouter } from './product.routes.js';
import { purchaseOrderRouter } from './purchaseOrder.routes.js';
import { vendorPaymentRouter } from './vendorPayment.routes.js';
import { vendorRouter } from './vendor.routes.js';

export const apiRouter = Router();

apiRouter.use('/vendors', vendorRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/purchase-orders', purchaseOrderRouter);
apiRouter.use('/goods-receipts', goodsReceiptRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/vendor-payments', vendorPaymentRouter);

/** Liveness + database readiness probe (used by load balancers / uptime monitors). */
apiRouter.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { status: 'ok', database: 'up', latencyMs: Date.now() - startedAt } });
  } catch {
    res.status(503).json({ success: true, data: { status: 'degraded', database: 'down' } });
  }
});
