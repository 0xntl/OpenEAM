// Public entry of @openeam/db. Re-exports the database client factory and the
// Drizzle schema namespace for consumers (the API).

// Filter helpers (and the Column type their arguments carry) are re-exported
// so consumers building `.where()` clauses on the service layer don't need a
// direct dependency on drizzle-orm; so are the helpers a test uses to walk
// the schema (which exports are tables, and their columns).
export type { Column } from 'drizzle-orm';
export {
  and,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  is,
  isNull,
  lt,
  ne,
  Table,
} from 'drizzle-orm';
export * from './client';
export * as schema from './schema/index';
