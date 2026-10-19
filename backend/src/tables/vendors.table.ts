import { defineTable } from '../utils/sql.js';

export const VendorsTable = defineTable('vendors', {
  id: 'id',
  code: 'code',
  name: 'name',
  contactPerson: 'contact_person',
  email: 'email',
  phone: 'phone',
  gstin: 'gstin',
  address: 'address',
  isActive: 'is_active',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});
