import { Router } from 'express';
import * as inventoryController from '../controllers/inventory.controller.js';

export const inventoryRouter = Router();

inventoryRouter.get('/', inventoryController.listInventory);
inventoryRouter.get('/:id/movements', inventoryController.getStockMovements);
