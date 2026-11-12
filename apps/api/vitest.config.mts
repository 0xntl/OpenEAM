// The API's tests run its real services against a real Postgres: the test
// database of the test stack (`pnpm db:test`, D-27), never the development
// one. test/harness.ts says how a test gets a clean database.
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { root, testDatabaseUrl } from '../../scripts/test-database.mjs';

// Throws unless the database name ends in `_test`: the same guard, from the
// same file, as the script that creates the database.
const databaseUrl = testDatabaseUrl().toString();

export default defineConfig({
  resolve: {
    alias: {
      // The package's entry point is its build output. Tests read the source
      // instead, so they need no build and cannot run against a stale one.
      '@openeam/db': join(root, 'packages/db/src/index.ts'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    // The harness connects to `provide`d URL and nothing else. `env` is there
    // because config.ts validates DATABASE_URL on import; it carries the same
    // value so that nothing can reach the development database by accident.
    provide: { databaseUrl },
    env: { DATABASE_URL: databaseUrl },
    // One database, and some tests lock rows other files would wait on. The
    // files are few and fast; running them in turn costs less than it saves.
    fileParallelism: false,
    // The files share one worker and its modules. No test keeps state outside
    // its own transaction, and importing the API once and not once per file
    // takes a third off the run.
    isolate: false,
  },
});
