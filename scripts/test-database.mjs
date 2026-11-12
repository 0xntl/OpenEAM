// Which database the test side uses, and the one guard that keeps it off any
// other. Shared by the test stack (test-stack.mjs, which drops and recreates
// this database) and the test suite (apps/api/vitest.config.mts, which
// writes to it), so there is a single answer to "is this safe to write to".
//
// The database is the one in DATABASE_URL with `_test` appended to its name,
// or TEST_DATABASE_URL when set. Either way its name has to end in `_test`.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// On import, so TEST_API_PORT and the like are there for the importer too.
// Variables already set win over .env, which is how CI passes its own.
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

/** @returns {URL} */
export function testDatabaseUrl() {
  let url;
  if (process.env.TEST_DATABASE_URL) {
    url = new URL(process.env.TEST_DATABASE_URL);
  } else {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set (copy .env.example to .env).');
    }
    url = new URL(process.env.DATABASE_URL);
    url.pathname = `${url.pathname}_test`;
  }
  // The one guard that matters: `pnpm db:test` drops this database.
  if (!url.pathname.endsWith('_test')) {
    throw new Error(`refusing database "${url.pathname.slice(1)}": the name must end in _test.`);
  }
  return url;
}
