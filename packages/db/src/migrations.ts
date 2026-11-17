// Applies the committed migrations in ./drizzle to a database. Used by
// migrate.ts (what the API container runs before it starts) and by tests
// that need a database of their own.
//
// Uses drizzle-orm's runtime migrator rather than drizzle-kit so the
// production image needs no dev dependency; both read the same
// drizzle/meta/_journal.json and apply the same SQL files.
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Database } from './client';

export async function applyMigrations(db: Database): Promise<void> {
  // The migrations sit beside src/ and dist/ alike.
  await migrate(db, { migrationsFolder: resolve(__dirname, '..', 'drizzle') });
}
