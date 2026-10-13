// Validates a data bundle against the same invariants the services enforce
// (INV-1 … INV-15 in docs/ARCHITECTURE.md) plus the enterprise boundary
// (INV-9/INV-16) before a single row is written. The importer does not go
// through the services — a bundle is a snapshot, and replaying it as edits
// would lose ids and timestamps (docs/DECISIONS.md D-16) — so this is where
// those rules apply to the import path.
//
// Every violation is reported with the table and the offending id, and the
// validator keeps going, so one response lists everything wrong with a bundle.
import {
  architectureLevelAllowed,
  isHalfOpenInterval,
  organizationUnitAllowed,
} from '../common/invariants';
import type { DataBundle } from './data-bundle.schema';

export interface BundleIssue {
  table: string;
  id?: string;
  message: string;
}

interface Temporal {
  validFrom: string | null;
  validTo: string | null;
}

export function validateBundle(bundle: DataBundle): BundleIssue[] {
  const issues: BundleIssue[] = [];
  const report = (table: string, id: string | undefined, message: string) =>
    issues.push({ table, id, message });

  // Every row must belong to one of the bundle's own enterprises. This is
  // the boundary: a row tagged with another enterprise's id, or a link to a
  // row outside the bundle, would write into an enterprise the importer was
  // never asked to touch.
  const enterpriseIds = index('enterprises', bundle.enterprises, report);

  function owned<T extends { id: string; enterpriseId: string }>(
    table: string,
    rows: T[],
  ): Map<string, T> {
    const byId = index(table, rows, report);
    for (const row of rows) {
      if (!enterpriseIds.has(row.enterpriseId)) {
        report(
          table,
          row.id,
          `belongs to enterprise ${row.enterpriseId}, which is not in the bundle`,
        );
      }
    }
    return byId;
  }

  const capabilities = owned('businessCapabilities', bundle.businessCapabilities);
  const processes = owned('businessProcesses', bundle.businessProcesses);
  const valueStreams = owned('valueStreams', bundle.valueStreams);
  const domains = owned('architectureDomains', bundle.architectureDomains);
  const units = owned('organizationUnits', bundle.organizationUnits);
  const blocks = owned('buildingBlocks', bundle.buildingBlocks);
  const informationObjects = owned('informationObjects', bundle.informationObjects);
  const actors = owned('actors', bundle.actors);
  const stages = index('valueStreamStages', bundle.valueStreamStages, report);
  index('processSteps', bundle.processSteps, report);

  // Resolves a reference and checks it lands in the expected enterprise.
  // Returns the enterprise the referenced row belongs to, or undefined when
  // the reference is already reported as broken.
  function ref<T extends { enterpriseId: string }>(
    table: string,
    id: string,
    field: string,
    target: string,
    targetId: string,
    targets: Map<string, T>,
    sameAs?: string,
  ): string | undefined {
    const row = targets.get(targetId);
    if (!row) {
      report(table, id, `${field} ${targetId} is not in the bundle's ${target}`);
      return undefined;
    }
    if (sameAs !== undefined && row.enterpriseId !== sameAs) {
      report(table, id, `${field} ${targetId} belongs to a different enterprise`);
    }
    return row.enterpriseId;
  }

  function interval(table: string, row: { id: string } & Temporal) {
    if (!isHalfOpenInterval(row.validFrom, row.validTo)) {
      report(table, row.id, 'validFrom must be earlier than validTo (INV-1)');
    }
  }

  // One *open* row per key — the close-before-you-open rule (INV-5/12/15).
  function oneOpenPer<T extends { id: string } & Temporal>(
    table: string,
    rows: T[],
    key: (row: T) => string,
  ) {
    const open = new Set<string>();
    for (const row of rows) {
      if (row.validTo !== null) continue;
      const k = key(row);
      if (open.has(k)) report(table, row.id, `a second open row for ${k} — close the other first`);
      open.add(k);
    }
  }

  // --- business layer ---
  for (const p of bundle.businessProcesses) {
    const e = ref(
      'businessProcesses',
      p.id,
      'capabilityId',
      'businessCapabilities',
      p.capabilityId,
      capabilities,
    );
    if (e !== undefined && e !== p.enterpriseId) {
      report(
        'businessProcesses',
        p.id,
        'must belong to the same enterprise as its capability (INV-6)',
      );
    }
  }
  for (const s of bundle.processSteps) {
    if (!processes.has(s.processId)) {
      report(
        'processSteps',
        s.id,
        `processId ${s.processId} is not in the bundle's businessProcesses`,
      );
    }
  }
  uniquePositions(
    'processSteps',
    bundle.processSteps,
    (s) => s.processId,
    (s) => s.id,
  );
  uniquePositions(
    'valueStreamStages',
    bundle.valueStreamStages,
    (s) => s.valueStreamId,
    (s) => s.id,
  );
  uniquePositions(
    'stageCapabilities',
    bundle.stageCapabilities,
    (sc) => sc.stageId,
    (sc) => `${sc.stageId}/${sc.capabilityId}`,
  );
  const stageEnterprise = new Map<string, string>();
  for (const s of bundle.valueStreamStages) {
    const vs = valueStreams.get(s.valueStreamId);
    if (!vs) {
      report(
        'valueStreamStages',
        s.id,
        `valueStreamId ${s.valueStreamId} is not in the bundle's valueStreams`,
      );
    } else {
      stageEnterprise.set(s.id, vs.enterpriseId);
    }
  }
  for (const sc of bundle.stageCapabilities) {
    const id = `${sc.stageId}/${sc.capabilityId}`;
    const stageEnt = stageEnterprise.get(sc.stageId);
    if (!stages.has(sc.stageId)) {
      report(
        'stageCapabilities',
        id,
        `stageId ${sc.stageId} is not in the bundle's valueStreamStages`,
      );
    }
    ref(
      'stageCapabilities',
      id,
      'capabilityId',
      'businessCapabilities',
      sc.capabilityId,
      capabilities,
      stageEnt,
    );
  }

  // --- organization ---
  for (const u of bundle.organizationUnits) {
    if (u.parentId !== null) {
      ref(
        'organizationUnits',
        u.id,
        'parentId',
        'organizationUnits',
        u.parentId,
        units,
        u.enterpriseId,
      );
    }
  }
  for (const u of bundle.organizationUnits) {
    // A cycle would otherwise surface as a foreign-key error from the database.
    const seen = new Set<string>([u.id]);
    let cursor = u.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) {
        report('organizationUnits', u.id, 'parentId chain forms a cycle');
        break;
      }
      seen.add(cursor);
      cursor = units.get(cursor)?.parentId ?? null;
    }
  }

  // --- actors and information ---
  for (const a of bundle.actors) {
    if (!organizationUnitAllowed(a.kind, a.organizationUnitId)) {
      report('actors', a.id, 'organizationUnitId applies only to actors of kind "team" (INV-13)');
    } else if (a.organizationUnitId) {
      ref(
        'actors',
        a.id,
        'organizationUnitId',
        'organizationUnits',
        a.organizationUnitId,
        units,
        a.enterpriseId,
      );
    }
  }
  for (const l of bundle.capabilityActors) {
    const e = ref(
      'capabilityActors',
      l.id,
      'capabilityId',
      'businessCapabilities',
      l.capabilityId,
      capabilities,
    );
    ref('capabilityActors', l.id, 'actorId', 'actors', l.actorId, actors, e);
    interval('capabilityActors', l);
  }
  oneOpenPer('capabilityActors', bundle.capabilityActors, (r) => `${r.capabilityId}/${r.actorId}`);
  for (const l of bundle.capabilityInformation) {
    const e = ref(
      'capabilityInformation',
      l.id,
      'capabilityId',
      'businessCapabilities',
      l.capabilityId,
      capabilities,
    );
    ref(
      'capabilityInformation',
      l.id,
      'informationObjectId',
      'informationObjects',
      l.informationObjectId,
      informationObjects,
      e,
    );
    interval('capabilityInformation', l);
  }
  oneOpenPer(
    'capabilityInformation',
    bundle.capabilityInformation,
    (r) => `${r.capabilityId}/${r.informationObjectId}`,
  );

  // --- architecture layer ---
  for (const b of bundle.buildingBlocks) {
    if (!architectureLevelAllowed(b.kind, b.architectureLevel)) {
      report(
        'buildingBlocks',
        b.id,
        'architectureLevel only applies to architecture building blocks (INV-3)',
      );
    }
    interval('buildingBlocks', b);
  }
  const classified = new Set<string>();
  for (const l of bundle.buildingBlockArchitectureDomains) {
    const id = `${l.buildingBlockId}/${l.architectureDomainId}`;
    const e = ref(
      'buildingBlockArchitectureDomains',
      id,
      'buildingBlockId',
      'buildingBlocks',
      l.buildingBlockId,
      blocks,
    );
    ref(
      'buildingBlockArchitectureDomains',
      id,
      'architectureDomainId',
      'architectureDomains',
      l.architectureDomainId,
      domains,
      e,
    );
    classified.add(l.buildingBlockId);
  }
  for (const b of bundle.buildingBlocks) {
    if (!classified.has(b.id)) {
      report('buildingBlocks', b.id, 'must belong to at least one architecture domain (INV-2)');
    }
  }
  for (const l of bundle.buildingBlockOrganizationUnits) {
    const e = ref(
      'buildingBlockOrganizationUnits',
      l.id,
      'buildingBlockId',
      'buildingBlocks',
      l.buildingBlockId,
      blocks,
    );
    ref(
      'buildingBlockOrganizationUnits',
      l.id,
      'organizationUnitId',
      'organizationUnits',
      l.organizationUnitId,
      units,
      e,
    );
    interval('buildingBlockOrganizationUnits', l);
  }
  for (const r of bundle.buildingBlockRealizations) {
    const e = ref(
      'buildingBlockRealizations',
      r.id,
      'architectureBuildingBlockId',
      'buildingBlocks',
      r.architectureBuildingBlockId,
      blocks,
    );
    ref(
      'buildingBlockRealizations',
      r.id,
      'solutionBuildingBlockId',
      'buildingBlocks',
      r.solutionBuildingBlockId,
      blocks,
      e,
    );
    if (blocks.get(r.architectureBuildingBlockId)?.kind === 'solution') {
      report(
        'buildingBlockRealizations',
        r.id,
        'architectureBuildingBlockId must point at an architecture building block',
      );
    }
    if (blocks.get(r.solutionBuildingBlockId)?.kind === 'architecture') {
      report(
        'buildingBlockRealizations',
        r.id,
        'solutionBuildingBlockId must point at a solution building block',
      );
    }
    interval('buildingBlockRealizations', r);
  }
  for (const l of bundle.buildingBlockCapabilities) {
    const e = ref(
      'buildingBlockCapabilities',
      l.id,
      'buildingBlockId',
      'buildingBlocks',
      l.buildingBlockId,
      blocks,
    );
    ref(
      'buildingBlockCapabilities',
      l.id,
      'capabilityId',
      'businessCapabilities',
      l.capabilityId,
      capabilities,
      e,
    );
    interval('buildingBlockCapabilities', l);
  }
  for (const r of bundle.buildingBlockRelationships) {
    if (r.sourceBuildingBlockId === r.targetBuildingBlockId) {
      report(
        'buildingBlockRelationships',
        r.id,
        'a building block cannot relate to itself (INV-4)',
      );
    }
    const e = ref(
      'buildingBlockRelationships',
      r.id,
      'sourceBuildingBlockId',
      'buildingBlocks',
      r.sourceBuildingBlockId,
      blocks,
    );
    ref(
      'buildingBlockRelationships',
      r.id,
      'targetBuildingBlockId',
      'buildingBlocks',
      r.targetBuildingBlockId,
      blocks,
      e,
    );
    interval('buildingBlockRelationships', r);
  }
  oneOpenPer(
    'buildingBlockRelationships',
    bundle.buildingBlockRelationships.filter((r) => r.type === 'hosted_on'),
    (r) => `hosted_on from ${r.sourceBuildingBlockId} (INV-5)`,
  );

  // Order within a parent is a unique (parent, position) pair in the database.
  function uniquePositions<T extends { position: number }>(
    table: string,
    rows: T[],
    parentOf: (row: T) => string,
    idOf: (row: T) => string,
  ) {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${parentOf(row)}#${row.position}`;
      if (seen.has(key))
        report(table, idOf(row), `position ${row.position} is used twice under the same parent`);
      seen.add(key);
    }
  }

  return issues;
}

// Indexes rows by id and reports duplicates within the table.
function index<T extends { id: string }>(
  table: string,
  rows: T[],
  report: (table: string, id: string | undefined, message: string) => void,
): Map<string, T> {
  const byId = new Map<string, T>();
  for (const row of rows) {
    if (byId.has(row.id)) report(table, row.id, 'duplicate id within the bundle');
    byId.set(row.id, row);
  }
  return byId;
}
