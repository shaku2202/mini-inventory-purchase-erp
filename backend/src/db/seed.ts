import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './pool.js';
import { runMigrations } from './migrate.js';
import { logger } from '../utils/logger.js';

/**
 * Demo master data (vendors + products). Idempotent: re-running does not
 * create duplicates (ON CONFLICT DO NOTHING on the natural keys).
 * Transactions (POs, receipts, payments) are deliberately NOT seeded so the
 * full workflow can be demonstrated from the UI.
 */
const vendors = [
  ['SAINT-GOBAIN', 'Saint-Gobain Glass India', 'Rahul Mehta', 'purchase@sg-glass.example', '+91 98765 43210', '33AAACS1234A1Z5', 'Sriperumbudur, Tamil Nadu'],
  ['ASAHI', 'AIS Glass Solutions', 'Neha Kapoor', 'orders@ais.example', '+91 91234 56789', '06AAACA1234B1Z2', 'Gurugram, Haryana'],
  ['GOLD-PLUS', 'Gold Plus Float Glass', 'Arjun Singh', 'sales@goldplus.example', '+91 99887 76655', null, 'Roorkee, Uttarakhand'],
  ['PVB-SUPPLY', 'Interlayer Films Pvt Ltd', 'Priya Nair', 'pvb@films.example', '+91 90000 11111', null, 'Pune, Maharashtra'],
] as const;

const products = [
  ['CLR-FLT-5MM', 'Clear Float Glass 5mm', 'Clear float sheet 2140 x 3300 mm', 'SQM', '200'],
  ['CLR-FLT-8MM', 'Clear Float Glass 8mm', 'Clear float sheet 2140 x 3300 mm', 'SQM', '150'],
  ['TNT-GRY-6MM', 'Grey Tinted Glass 6mm', 'Body tinted grey float', 'SQM', '80'],
  ['PVB-076', 'PVB Interlayer 0.76mm', 'Polyvinyl butyral film roll for laminated glass', 'SQM', '300'],
  ['SLNT-SIL', 'Structural Silicone Sealant', '300ml cartridge', 'PCS', '100'],
  ['SPCR-ALU-12', 'Aluminium Spacer Bar 12mm', 'For insulated glass units', 'MTR', '500'],
] as const;

export async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const v of vendors) {
      await client.query(
        `INSERT INTO vendors (code, name, contact_person, email, phone, gstin, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING`,
        [...v],
      );
    }
    for (const p of products) {
      await client.query(
        `INSERT INTO products (sku, name, description, unit, reorder_level)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sku) DO NOTHING`,
        [...p],
      );
    }
    await client.query('COMMIT');
    logger.info(`Seeded ${vendors.length} vendors and ${products.length} products`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(seed)
    .catch((error) => {
      logger.error(error);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
