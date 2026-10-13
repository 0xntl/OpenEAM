// Human labels for the enums the API speaks in, and the small formatting
// helpers every page needs. One place, so a raw `PHASING_OUT` never reaches
// a screen and two pages never disagree on how a date range reads.
import type {
  ArchitectureLevel,
  BuildingBlockKind,
  BuildingBlockRelationshipType,
  LifecyclePhase,
} from './entities';

export const LIFECYCLE_LABEL: Record<LifecyclePhase, string> = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  PHASING_OUT: 'Phasing out',
  RETIRED: 'Retired',
};
export const LIFECYCLE_PHASES: LifecyclePhase[] = ['PLANNED', 'ACTIVE', 'PHASING_OUT', 'RETIRED'];

export const ARCHITECTURE_LEVEL_LABEL: Record<ArchitectureLevel, string> = {
  STRATEGIC: 'Strategic',
  SEGMENT: 'Segment',
  CAPABILITY: 'Capability',
};
export const ARCHITECTURE_LEVELS: ArchitectureLevel[] = ['STRATEGIC', 'SEGMENT', 'CAPABILITY'];

// The short forms are the ones architects use; the long ones explain them.
export const BUILDING_BLOCK_KIND_LABEL: Record<BuildingBlockKind, string> = {
  ARCHITECTURE: 'ABB',
  SOLUTION: 'SBB',
};
export const BUILDING_BLOCK_KIND_LONG_LABEL: Record<BuildingBlockKind, string> = {
  ARCHITECTURE: 'Architecture building block',
  SOLUTION: 'Solution building block',
};

export function kindOf(
  typename: 'ArchitectureBuildingBlock' | 'SolutionBuildingBlock',
): BuildingBlockKind {
  return typename === 'ArchitectureBuildingBlock' ? 'ARCHITECTURE' : 'SOLUTION';
}

export const RELATIONSHIP_TYPE_LABEL: Record<BuildingBlockRelationshipType, string> = {
  DEPENDS_ON: 'Depends on',
  DATA_FLOW: 'Data flow',
  HOSTED_ON: 'Hosted on',
};
export const RELATIONSHIP_TYPES: BuildingBlockRelationshipType[] = [
  'DEPENDS_ON',
  'DATA_FLOW',
  'HOSTED_ON',
];

// Two initials for an avatar: "Kim Lee" → "KL".
export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// A validity interval as people read it: "2019-01-01 – …", "… – 2026-12-31",
// or "open" when neither side is set.
export function formatValidity(validFrom?: string | null, validTo?: string | null): string {
  if (!validFrom && !validTo) return 'open';
  return `${validFrom ?? '…'} – ${validTo ?? '…'}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
