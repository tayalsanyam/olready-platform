import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** A fresh machine has no schema yet, and one test file reads the categories while it is being collected. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/olready_test';
  execFileSync('node', [path.resolve(__dirname, '../scripts/migrate.mjs'), '--reset'], {
    env: { ...process.env, DATABASE_URL: url, MKT_PLACE_STATES: process.env.MKT_PLACE_STATES ?? '04,03,06,07' },
    stdio: 'pipe',
  });
}
