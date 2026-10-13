import { sql } from 'drizzle-orm';
import { check, customType, type PgColumn, timestamp } from 'drizzle-orm/pg-core';

// Shared record-metadata columns ("recency" in TOGAF terms). Kept as strings
// so JSON export/import round-trips them without Date conversion.
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date().toISOString()),
};

// Raw bytes (an uploaded logo). drizzle-orm has no bytea column of its own.
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// INV-1 at the database: a validity interval is half-open and never empty.
// Null on either side is unbounded and passes.
export function validityCheck(table: string, validFrom: PgColumn, validTo: PgColumn) {
  return check(
    `${table}_validity_check`,
    sql`${validFrom} IS NULL OR ${validTo} IS NULL OR ${validFrom} < ${validTo}`,
  );
}
