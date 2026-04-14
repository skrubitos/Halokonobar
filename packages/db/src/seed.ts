#!/usr/bin/env tsx
/**
 * Runs only the seed migration (002_seed_dev_data.sql).
 * Safe to call multiple times — uses ON CONFLICT DO NOTHING via fixed UUIDs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, '..', 'migrations', '002_seed_dev_data.sql');

async function seed() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString });

  try {
    const sql = fs.readFileSync(SEED_FILE, 'utf8');
    await pool.query(sql);
    console.log('Seed data applied.');
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
