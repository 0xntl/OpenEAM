// Public entry of @openeam/db. Re-exports the database client factory and the
// Drizzle schema namespace for consumers (the API).

// Filter helpers (and the Column type their arguments carry) are re-exported
// so consumers building `.where()` clauses on the service layer don't need a
// direct dependency on drizzle-orm.
export type { Column } from 'drizzle-orm';
export { and, eq, inArray, isNull, lt, ne } from 'drizzle-orm';
export * from './client';
export * as schema from './schema/index';
