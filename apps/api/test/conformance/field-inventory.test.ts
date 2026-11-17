// Holds field-inventory.ts to the schema: every column of every model table
// has an entry, every entry names a real column, every "no" says why, and
// every column travels in a bundle. A new column fails here until someone
// has decided where it is meant to be used.
//
// Needs no database: it reads the Drizzle schema and the bundle's zod schema.
import { getTableColumns, getTableName, is, schema, Table } from '@openeam/db';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { dataBundleSchema } from '../../src/data-exchange/data-bundle.schema';
import { type Entry, FIELD_INVENTORY, NOT_MODEL } from './field-inventory';

// Every table the schema exports, by its export name (the bundle's key).
type AnyTable = Parameters<typeof getTableColumns>[0];
const tables = Object.entries(schema).filter(([, value]) => is(value, Table)) as unknown as Array<
  [string, AnyTable]
>;
const modelTables = tables.filter(([name]) => !(name in NOT_MODEL));

// The fields a bundle row of this table may carry.
function bundleFields(key: string): string[] | undefined {
  let part: z.ZodType | undefined = dataBundleSchema.shape[
    key as keyof typeof dataBundleSchema.shape
  ] as z.ZodType | undefined;
  if (!part) return undefined;
  if (part instanceof z.ZodDefault) part = part.unwrap() as z.ZodType;
  if (part instanceof z.ZodArray) part = part.element as z.ZodType;
  return part instanceof z.ZodObject ? Object.keys(part.shape) : undefined;
}

function reasons(entry: Entry): string[] {
  if ('structural' in entry) return [entry.structural];
  return Object.values(entry).flatMap((reach) =>
    reach === true ? [] : 'gap' in reach ? [reach.gap] : [reach.exempt],
  );
}

describe('the field inventory', () => {
  it('knows every table, as model or not', () => {
    const known = new Set([...Object.keys(FIELD_INVENTORY), ...Object.keys(NOT_MODEL)]);
    const unknown = tables.map(([name]) => name).filter((name) => !known.has(name));
    expect(unknown, 'tables with no entry in field-inventory.ts').toEqual([]);

    const exported = new Set(tables.map(([name]) => name));
    const stale = [...known].filter((name) => !exported.has(name));
    expect(stale, 'entries in field-inventory.ts for tables that do not exist').toEqual([]);
  });

  it.each(modelTables)('has exactly the columns of %s', (name, table) => {
    const columns = Object.keys(getTableColumns(table)).sort();
    const entries = Object.keys(FIELD_INVENTORY[name] ?? {}).sort();
    expect(entries, `field-inventory.ts for ${getTableName(table)}`).toEqual(columns);
  });

  it('says why wherever a field is not used', () => {
    const unexplained = Object.entries(FIELD_INVENTORY).flatMap(([table, columns]) =>
      Object.entries(columns)
        .filter(([, entry]) => reasons(entry).some((reason) => reason.trim() === ''))
        .map(([column]) => `${table}.${column}`),
    );
    expect(unexplained).toEqual([]);
  });
});

describe('export and import', () => {
  it.each(modelTables)('carry every column of %s', (name, table) => {
    const fields = bundleFields(name);
    expect(fields, `the bundle has no "${name}"`).toBeDefined();
    const missing = Object.keys(getTableColumns(table)).filter((c) => !fields?.includes(c));
    expect(missing, `columns of ${getTableName(table)} a bundle drops`).toEqual([]);
  });

  it('carry nothing of the tables that are not the model', () => {
    const carried = Object.keys(NOT_MODEL).filter((name) => bundleFields(name) !== undefined);
    expect(carried).toEqual([]);
  });
});
