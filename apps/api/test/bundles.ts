// Data bundles for tests: the public examples on disk, and the import and
// export endpoints as a caller reaches them.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateBundle } from '../src/data-exchange/data-bundle.format';
import { type DataBundle, dataBundleSchema } from '../src/data-exchange/data-bundle.schema';
import { DataExchangeController } from '../src/data-exchange/data-exchange.controller';
import type { World } from './harness';

const examplesDirectory = join(__dirname, '../../../examples');

// A bundle as it arrives: parsed JSON, nothing checked yet.
export type RawBundle = Record<string, unknown>;

// Top-level files only. examples/private/ holds real enterprises and is
// never read by a test.
export function exampleNames(): string[] {
  return readdirSync(examplesDirectory)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function example(name: string): RawBundle {
  return JSON.parse(readFileSync(join(examplesDirectory, name), 'utf8')) as RawBundle;
}

// The same example after the two steps import runs before anything else:
// the version migration and the schema. No database involved.
export function parsedExample(name: string): DataBundle {
  const migrated = migrateBundle(example(name));
  if (!migrated.ok) throw new Error(migrated.message);
  return dataBundleSchema.parse(migrated.bundle);
}

// The endpoints' own code. Calling the controller's methods runs everything
// a request does after the guard: version migration, schema validation, the
// service. What it leaves out is HTTP itself (routing, the guard, the body
// size limit), as harness.ts says of every test here.
export function exchange(world: World): DataExchangeController {
  return new DataExchangeController(world.dataExchange);
}

// As a bundle travels: serialized and parsed again.
export function overTheWire(bundle: unknown): RawBundle {
  return JSON.parse(JSON.stringify(bundle)) as RawBundle;
}

// A bundle without the one field that differs between two exports of the
// same model.
export function withoutTimeOfExport<T extends { exportedAt?: string }>(bundle: T) {
  const { exportedAt: _, ...model } = bundle;
  return model;
}

// The row arrays of a bundle, by table name.
export function tablesOf(bundle: object): Array<[table: string, rows: object[]]> {
  return Object.entries(bundle).filter((entry): entry is [string, object[]] =>
    Array.isArray(entry[1]),
  );
}
