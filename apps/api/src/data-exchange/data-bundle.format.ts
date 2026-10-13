// The data bundle's format version and the migration chain that brings an
// older bundle up to the current shape before it is validated (D-24).
//
// A bundle says which format it is written in (`formatVersion`). Bundles
// written before the field existed are version 0. Import migrates a bundle
// step by step to the current version and validates only the result, so the
// zod schema describes exactly one shape and compatibility with old bundles
// lives here, as explicit steps, instead of accumulating as optional fields.
//
// What needs a step and what does not: adding an optional field or array to
// the format is not a new version — an omitted field means null, default, or
// empty, so an older bundle already reads correctly. A rename, a split, a
// changed meaning, or a field that becomes required needs a new version and a
// step here that rewrites the old shape into the new one.
import { createRequire } from 'node:module';

export const CURRENT_FORMAT_VERSION = 1;

type RawBundle = Record<string, unknown>;

// `migrations[n]` rewrites a version-n bundle into a version-(n+1) bundle.
const migrations: Array<(bundle: RawBundle) => RawBundle> = [
  // 0 → 1: the version field itself. Everything the format gained before it
  // carried a version was additive (landscape tables, icons, information
  // objects, actors, timestamps, bpmnXml), so an unversioned bundle reads
  // under the version-1 rules without further changes.
  (bundle) => bundle,
];

export type MigrationResult =
  | { ok: true; bundle: RawBundle; fromVersion: number }
  | { ok: false; message: string };

export function migrateBundle(raw: unknown): MigrationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, message: 'A data bundle is a JSON object' };
  }
  const input = raw as RawBundle;
  const declared = input.formatVersion;
  const fromVersion = declared === undefined ? 0 : declared;
  if (typeof fromVersion !== 'number' || !Number.isInteger(fromVersion) || fromVersion < 0) {
    return { ok: false, message: 'formatVersion must be a non-negative integer' };
  }
  if (fromVersion > CURRENT_FORMAT_VERSION) {
    return {
      ok: false,
      message: `This bundle uses format version ${fromVersion}, written by a newer OpenEAM; this instance reads up to version ${CURRENT_FORMAT_VERSION}`,
    };
  }

  let bundle = input;
  for (const step of migrations.slice(fromVersion)) bundle = step(bundle);
  return { ok: true, bundle: { ...bundle, formatVersion: CURRENT_FORMAT_VERSION }, fromVersion };
}

// The generator stamp an export carries: which software, which version. The
// API's package.json sits two levels above this module in src/ and in dist/
// alike, and the container image ships it (see apps/api/Dockerfile).
export function generator(): { name: string; version: string } {
  let version = '0.0.0';
  try {
    const pkg = createRequire(__filename)('../../package.json') as { version?: string };
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // Missing package.json is not worth failing an export over.
  }
  return { name: 'openeam', version };
}
