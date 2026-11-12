// Runs once before the suite: the test database has to exist and carry every
// committed migration. Creating it stays the job of `pnpm db:test` (D-27);
// this only refuses to start against one that is missing or behind, so a
// stale schema fails here with one message and not as fifty confusing tests.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDatabase } from '@openeam/db';
import { root, testDatabaseUrl } from '../../../scripts/test-database.mjs';

interface Journal {
  entries: Array<{ when: number; tag: string }>;
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = decodeURIComponent(url.pathname.slice(1));
  const journal = JSON.parse(
    readFileSync(join(root, 'packages/db/drizzle/meta/_journal.json'), 'utf8'),
  ) as Journal;
  const latest = journal.entries.at(-1);

  const { pool } = createDatabase({ connectionString: url.toString(), max: 1 });
  let applied: string | undefined;
  try {
    // Drizzle's migrator records each migration under the journal's `when`.
    const result = await pool.query<{ created_at: string }>(
      'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );
    applied = result.rows[0]?.created_at;
  } catch (error) {
    throw new Error(
      `The test database "${name}" is missing or was never migrated. Run \`pnpm db:test\` (Postgres has to be running).`,
      { cause: error },
    );
  } finally {
    await pool.end();
  }

  if (!latest || String(latest.when) !== String(applied)) {
    throw new Error(
      `The test database "${name}" is behind the migrations (latest is ${latest?.tag}). Run \`pnpm db:test\` to recreate it.`,
    );
  }
}
