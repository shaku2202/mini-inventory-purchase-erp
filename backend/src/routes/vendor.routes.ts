import { Router } from 'express';
import * as vendorController from '../controllers/vendor.controller.js';

export const vendorRouter = Router();

vendorRouter.post('/', vendorController.createVendor);
vendorRouter.get('/', vendorController.listVendors);
// static path before '/:id'
vendorRouter.get('/balances', vendorController.listVendorBalances);
vendorRouter.get('/:id', vendorController.getVendor);
vendorRouter.get('/:id/balance', vendorController.getVendorBalance);
