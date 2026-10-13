// The shape of a model icon reference (D-22): an Iconify id, "<collection>:<name>",
// stored as a string on the row. Never markup, never a URL — the id is data,
// the SVG is looked up from the collections this API serves (icons.service.ts).
//
// Shared by the building block service (mutations) and the bundle schema
// (import), so both paths reject the same things.

// The collections the icon endpoint serves. Adding one means adding its
// `@iconify-json/*` package to apps/api and a line here; nothing else.
export const ICON_COLLECTIONS = ['simple-icons', 'lucide'] as const;
export type IconCollection = (typeof ICON_COLLECTIONS)[number];

// Iconify's own naming rule for both halves: lowercase, digits, single dashes.
const ICON_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export const ICON_ID_MESSAGE = `icon must be "<collection>:<name>" (lowercase, dashes), with the collection one of: ${ICON_COLLECTIONS.join(', ')}`;

export function isIconCollection(prefix: string): prefix is IconCollection {
  return (ICON_COLLECTIONS as readonly string[]).includes(prefix);
}

// The collection must be one this instance serves; the *name* is not checked
// against the set. A brand that Simple Icons later removes, or an icon from
// a newer release than the one installed here, stays in the model and
// renders with the fallback until the next update resolves it again.
export function parseIconId(id: string): { collection: IconCollection; name: string } | undefined {
  const match = ICON_ID.exec(id);
  const prefix = match?.[1];
  const name = match?.[2];
  if (!prefix || !name || !isIconCollection(prefix)) return undefined;
  return { collection: prefix, name };
}

export function isIconId(id: string): boolean {
  return parseIconId(id) !== undefined;
}
