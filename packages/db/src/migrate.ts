// Applies the committed migrations in ./drizzle to the database at
// DATABASE_URL, then exits. This is what the API container runs before it
// starts (see apps/api/Dockerfile), so a self-hoster never has to run
// drizzle-kit by hand. Locally, `pnpm db:migrate` (drizzle-kit) does the same.
//
// Uses drizzle-orm's runtime migrator rather than drizzle-kit so the
// production image needs no dev dependency; both read the same
// drizzle/meta/_journal.json and apply the same SQL files.
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const { db, pool } = createDatabase({ connectionString, max: 1 });
  try {
    // __dirname is dist/ after compilation; the migrations sit next to it.
    await migrate(db, { migrationsFolder: resolve(__dirname, '..', 'drizzle') });
    console.log('Database migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
