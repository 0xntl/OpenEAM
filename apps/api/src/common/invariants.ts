// Pure checks shared by the services (one row at a time) and the data-bundle
// validator (a whole bundle before it is written), so the two write paths
// cannot drift apart. Each function is one invariant from
// docs/ARCHITECTURE.md; the message next to it is what the user sees.

// INV-1: half-open interval — validFrom inclusive, validTo exclusive, null
// unbounded on that side. An interval that starts where it ends is empty.
export function isHalfOpenInterval(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
): boolean {
  return !(validFrom && validTo && validFrom >= validTo);
}
export const INTERVAL_MESSAGE = 'validFrom must be earlier than validTo';

// INV-3: architectureLevel applies only to architecture building blocks.
export function architectureLevelAllowed(
  kind: 'architecture' | 'solution',
  architectureLevel: string | null | undefined,
): boolean {
  return kind === 'architecture' || !architectureLevel;
}
export const ARCHITECTURE_LEVEL_MESSAGE =
  'architectureLevel only applies to architecture building blocks';

// INV-13: organizationUnitId is meaningful only for actors of kind 'team'.
export function organizationUnitAllowed(
  kind: string,
  organizationUnitId: string | null | undefined,
): boolean {
  return kind === 'team' || !organizationUnitId;
}
export const ORGANIZATION_UNIT_MESSAGE = 'organizationUnitId applies only to actors of kind "team"';
