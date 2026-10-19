import { Router } from 'express';
import * as purchaseOrderController from '../controllers/purchaseOrder.controller.js';

export const purchaseOrderRouter = Router();

purchaseOrderRouter.post('/', purchaseOrderController.createPurchaseOrder);
purchaseOrderRouter.get('/', purchaseOrderController.listPurchaseOrders);
purchaseOrderRouter.get('/:id', purchaseOrderController.getPurchaseOrder);
