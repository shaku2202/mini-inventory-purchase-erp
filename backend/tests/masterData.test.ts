import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../src/db/pool.js';
import { api, createVendor, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(closePool);

describe('Vendors', () => {
  it('creates a valid vendor (code normalised to upper case)', async () => {
    const res = await api()
      .post('/api/vendors')
      .send({ code: 'sg-01', name: 'Saint-Gobain', email: 'PO@SG.example', gstin: '33aaacs1234a1z5' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'SG-01', name: 'Saint-Gobain', email: 'po@sg.example', gstin: '33AAACS1234A1Z5' });
  });

  it('rejects missing required fields with field level errors', async () => {
    const res = await api().post('/api/vendors').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const fields = Object.fromEntries(res.body.error.details.map((d: { field: string; code: string }) => [d.field, d.code]));
    expect(fields).toMatchObject({ code: 'FIELD_REQUIRED', name: 'FIELD_REQUIRED', email: 'FIELD_INVALID_EMAIL' });
  });

  it('treats empty / whitespace-only strings as missing (what an untouched form sends)', async () => {
    const res = await api().post('/api/vendors').send({ code: '', name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { code: string }) => d.code)).toEqual(['FIELD_REQUIRED', 'FIELD_REQUIRED']);
  });

  it('rejects unknown fields instead of silently ignoring them', async () => {
    const res = await api().post('/api/vendors').send({ code: 'V1', name: 'Vendor', balance: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe('FIELD_UNKNOWN');
  });

  it('rejects a duplicate vendor code with 409', async () => {
    await createVendor({ code: 'DUP' });
    const res = await api().post('/api/vendors').send({ code: 'dup', name: 'Another' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VENDOR_CODE_EXISTS');
  });

  it('returns 404 for a nonexistent vendor and 400 for a malformed id', async () => {
    expect((await api().get('/api/vendors/999/balance')).body.error.code).toBe('VENDOR_NOT_FOUND');
    const bad = await api().get('/api/vendors/abc');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].code).toBe('FIELD_INVALID_ID');
  });
});

describe('Products', () => {
  it('creates a product with zero opening stock', async () => {
    const res = await api().post('/api/products').send({ sku: 'clr-5', name: 'Clear 5mm', unit: 'SQM', reorderLevel: 25 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ sku: 'CLR-5', currentStock: '0.000', reorderLevel: '25.000' });
  });

  it('rejects invalid unit and negative reorder level', async () => {
    const res = await api().post('/api/products').send({ sku: 'X1', name: 'Bad', unit: 'TONS', reorderLevel: -1 });
    expect(res.status).toBe(400);
    const codes = res.body.error.details.map((d: { code: string }) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['FIELD_INVALID_ENUM', 'FIELD_MUST_BE_NON_NEGATIVE']));
  });

  it('rejects a duplicate SKU with 409', async () => {
    await api().post('/api/products').send({ sku: 'SAME', name: 'One', unit: 'PCS' });
    const res = await api().post('/api/products').send({ sku: 'SAME', name: 'Two', unit: 'PCS' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_SKU_EXISTS');
  });
});

describe('Generic API behaviour', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await api().get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: 'ROUTE_NOT_FOUND' } });
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await api().post('/api/vendors').set('Content-Type', 'application/json').send('{"code":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
