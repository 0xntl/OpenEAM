// Applies the committed migrations in ./drizzle to the database at
// DATABASE_URL, then exits. This is what the API container runs before it
// starts (see apps/api/Dockerfile), so a self-hoster never has to run
// drizzle-kit by hand. Locally, `pnpm db:migrate` (drizzle-kit) does the same.
import { createDatabase } from './client';
import { applyMigrations } from './migrations';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const { db, pool } = createDatabase({ connectionString, max: 1 });
  try {
    await applyMigrations(db);
    console.log('Database migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
