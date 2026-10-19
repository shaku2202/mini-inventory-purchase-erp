import { VendorBalancesView, VendorsTable } from '../tables/index.js';
import type { Queryable } from '../types/db.types.js';
import type { Paginated, Vendor, VendorBalance } from '../types/domain.types.js';
import { selectColumns, toOffset } from '../utils/sql.js';
import type { CreateVendorInput } from '../validators/vendor.validator.js';
import type { ListQuery } from '../validators/common.validator.js';

const T = VendorsTable;
const C = T.columns;
const VENDOR_COLUMNS = selectColumns(T);

export async function insertVendor(db: Queryable, input: CreateVendorInput): Promise<Vendor> {
  const { rows } = await db.query<Vendor>(
    `INSERT INTO ${T.name} (${C.code}, ${C.name}, ${C.contactPerson}, ${C.email}, ${C.phone}, ${C.gstin}, ${C.address})
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${VENDOR_COLUMNS}`,
    [input.code, input.name, input.contactPerson, input.email, input.phone, input.gstin, input.address],
  );
  return rows[0]!;
}

export async function findVendorById(db: Queryable, id: number, options: { forUpdate?: boolean } = {}): Promise<Vendor | null> {
  const { rows } = await db.query<Vendor>(
    `SELECT ${VENDOR_COLUMNS} FROM ${T.name} WHERE ${C.id} = $1 ${options.forUpdate ? 'FOR UPDATE' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

export async function existsVendorWithCode(db: Queryable, code: string): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM ${T.name} WHERE ${C.code} = $1`, [code]);
  return rows.length > 0;
}

export async function listVendors(db: Queryable, query: ListQuery): Promise<Paginated<Vendor>> {
  const search = query.search ? `%${query.search}%` : null;
  const where = `WHERE ($1::text IS NULL OR ${C.name} ILIKE $1 OR ${C.code} ILIKE $1)`;
  const [list, count] = await Promise.all([
    db.query<Vendor>(
      `SELECT ${VENDOR_COLUMNS} FROM ${T.name} ${where} ORDER BY ${C.name} LIMIT $2 OFFSET $3`,
      [search, query.limit, toOffset(query)],
    ),
    db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${T.name} ${where}`, [search]),
  ]);
  return { rows: list.rows, total: count.rows[0]?.total ?? 0 };
}

const V = VendorBalancesView;

export async function findVendorBalance(db: Queryable, vendorId: number): Promise<VendorBalance | null> {
  const { rows } = await db.query<VendorBalance>(
    `SELECT ${selectColumns(V)} FROM ${V.name} WHERE ${V.columns.vendorId} = $1`,
    [vendorId],
  );
  return rows[0] ?? null;
}

export async function listVendorBalances(db: Queryable): Promise<VendorBalance[]> {
  const { rows } = await db.query<VendorBalance>(
    `SELECT ${selectColumns(V)} FROM ${V.name}
     ORDER BY ${V.columns.outstandingBalance} DESC, ${V.columns.vendorName}`,
  );
  return rows;
}
