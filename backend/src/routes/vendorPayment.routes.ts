import { Router } from 'express';
import * as vendorPaymentController from '../controllers/vendorPayment.controller.js';

export const vendorPaymentRouter = Router();

vendorPaymentRouter.post('/', vendorPaymentController.createVendorPayment);
vendorPaymentRouter.get('/', vendorPaymentController.listVendorPayments);
