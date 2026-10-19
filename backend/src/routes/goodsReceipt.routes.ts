import { Router } from 'express';
import * as goodsReceiptController from '../controllers/goodsReceipt.controller.js';

export const goodsReceiptRouter = Router();

goodsReceiptRouter.post('/', goodsReceiptController.createGoodsReceipt);
goodsReceiptRouter.get('/', goodsReceiptController.listGoodsReceipts);
goodsReceiptRouter.get('/:id', goodsReceiptController.getGoodsReceipt);
