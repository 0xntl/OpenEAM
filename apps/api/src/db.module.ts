// Global database module. Builds a single Postgres connection (Drizzle ORM + pg
// Pool) from the validated config and exposes both via DI tokens; closes the
// pool on application shutdown.
import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createDatabase, type Database } from '@openeam/db';
import type { Pool } from 'pg';
import { config } from './config';

export const DATABASE = Symbol('DATABASE');
export const DB_POOL = Symbol('DB_POOL');

const CONNECTION = Symbol('DB_CONNECTION');

type Connection = ReturnType<typeof createDatabase>;

@Global()
@Module({
  providers: [
    {
      provide: CONNECTION,
      useFactory: (): Connection => {
        return createDatabase({ connectionString: config.DATABASE_URL });
      },
    },
    {
      provide: DATABASE,
      useFactory: (connection: Connection): Database => connection.db,
      inject: [CONNECTION],
    },
    {
      provide: DB_POOL,
      useFactory: (connection: Connection): Pool => connection.pool,
      inject: [CONNECTION],
    },
  ],
  exports: [DATABASE, DB_POOL],
})
export class DbModule implements OnModuleDestroy {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
