import { Router } from 'express';
import * as productController from '../controllers/product.controller.js';

export const productRouter = Router();

productRouter.post('/', productController.createProduct);
productRouter.get('/', productController.listProducts);
productRouter.get('/:id', productController.getProduct);
