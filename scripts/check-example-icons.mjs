// Fails when an example bundle names an icon this API cannot serve: a
// collection that is not in the allowlist, or a name the installed icon set
// does not have. The model tolerates such ids at runtime (they render as
// the fallback, see docs/DECISIONS.md D-22) — a committed example should
// not rely on that. Run from the repository root; CI does.
//
//   node scripts/check-example-icons.mjs [bundle.json ...]
//
// With no arguments every examples/*.json is checked. The icon sets are
// resolved from apps/api's dependencies, the same packages the API serves.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRequire = createRequire(join(root, 'apps/api/package.json'));

// Keep in step with ICON_COLLECTIONS in apps/api/src/icons/icon-id.ts.
const COLLECTIONS = ['simple-icons', 'lucide'];
const ICON_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

const sets = new Map(
  COLLECTIONS.map((prefix) => {
    const set = apiRequire(`@iconify-json/${prefix}/icons.json`);
    return [prefix, new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])];
  }),
);

const files =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(join(root, 'examples'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => join('examples', f));

let problems = 0;
let checked = 0;
for (const file of files) {
  const bundle = JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  for (const block of bundle.buildingBlocks ?? []) {
    if (block.icon == null) continue;
    checked += 1;
    const match = ICON_ID.exec(block.icon);
    const names = match ? sets.get(match[1]) : undefined;
    if (!match || !names) {
      console.error(`${file}: "${block.name}" has icon "${block.icon}", not a served collection`);
      problems += 1;
    } else if (!names.has(match[2])) {
      console.error(`${file}: "${block.name}" has icon "${block.icon}", not in ${match[1]}`);
      problems += 1;
    }
  }
}

if (problems > 0) {
  console.error(`${problems} icon reference(s) cannot be served.`);
  process.exit(1);
}
console.log(`${checked} icon reference(s) in ${files.length} bundle(s) resolve.`);
