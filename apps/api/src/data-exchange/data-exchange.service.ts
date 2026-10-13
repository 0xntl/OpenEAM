// Per-enterprise export/import for moving enterprise models between OpenEAM
// instances or restoring local dev data. A bundle carries one or more
// enterprises and everything modeled within them; import replaces exactly
// those enterprises (delete cascades from the enterprises table wipe their
// rows) and leaves every other enterprise untouched.
//
// Both directions are scoped to the caller (INV-16): export only hands out
// enterprises they are a member of, and import only replaces ones they are a
// member of (or creates new ones, with the caller as first member). Memberships
// are not part of a bundle — they describe an instance, not a model — so they
// are preserved across the delete-and-reinsert.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { type Database, inArray, schema, type Transaction } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { grantMembership, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type { DataBundle } from './data-bundle.schema';
import { type BundleIssue, validateBundle } from './data-bundle.validator';

// Orders rows of a self-referencing table so parents precede children,
// satisfying the FK on insert. Rows with dangling or cyclic parent
// references are appended last so the database reports them as FK errors
// instead of this silently looping.
function parentsFirst<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const sorted: T[] = [];
  const emitted = new Set<string>();
  let remaining = rows;
  while (remaining.length > 0) {
    const ready = remaining.filter((r) => r.parentId === null || emitted.has(r.parentId));
    if (ready.length === 0) break;
    for (const row of ready) {
      sorted.push(row);
      emitted.add(row.id);
    }
    remaining = remaining.filter((r) => !emitted.has(r.id));
  }
  return [...sorted, ...remaining];
}

@Injectable()
export class DataExchangeService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Without enterpriseId: every enterprise the caller is a member of. With
  // it: just that enterprise's model.
  async export(principal: Principal, enterpriseId?: string): Promise<DataBundle> {
    if (enterpriseId) assertCan(principal, 'data.export', enterpriseId);
    const visible = new Set(enterpriseId ? [enterpriseId] : principal.enterpriseIds);
    const enterpriseFilter = <T extends { enterpriseId: string }>(rows: T[]): T[] =>
      rows.filter((r) => visible.has(r.enterpriseId));

    const [
      enterprises,
      businessCapabilities,
      businessProcesses,
      processSteps,
      valueStreams,
      valueStreamStages,
      stageCapabilities,
      architectureDomains,
      organizationUnits,
      buildingBlocks,
      buildingBlockArchitectureDomains,
      buildingBlockOrganizationUnits,
      buildingBlockRealizations,
      buildingBlockCapabilities,
      buildingBlockRelationships,
      informationObjects,
      capabilityInformation,
      actors,
      capabilityActors,
    ] = await Promise.all([
      this.db.select().from(schema.enterprises),
      this.db.select().from(schema.businessCapabilities),
      this.db.select().from(schema.businessProcesses),
      this.db.select().from(schema.processSteps),
      this.db.select().from(schema.valueStreams),
      this.db.select().from(schema.valueStreamStages),
      this.db.select().from(schema.stageCapabilities),
      this.db.select().from(schema.architectureDomains),
      this.db.select().from(schema.organizationUnits),
      this.db.select().from(schema.buildingBlocks),
      this.db.select().from(schema.buildingBlockArchitectureDomains),
      this.db.select().from(schema.buildingBlockOrganizationUnits),
      this.db.select().from(schema.buildingBlockRealizations),
      this.db.select().from(schema.buildingBlockCapabilities),
      this.db.select().from(schema.buildingBlockRelationships),
      this.db.select().from(schema.informationObjects),
      this.db.select().from(schema.capabilityInformation),
      this.db.select().from(schema.actors),
      this.db.select().from(schema.capabilityActors),
    ]);

    // Child/link rows have no enterpriseId of their own; they follow their
    // parents' membership.
    const scopedCapabilities = enterpriseFilter(businessCapabilities);
    const scopedProcesses = enterpriseFilter(businessProcesses);
    const scopedValueStreams = enterpriseFilter(valueStreams);
    const scopedBuildingBlocks = enterpriseFilter(buildingBlocks);
    const capabilityIds = new Set(scopedCapabilities.map((c) => c.id));
    const processIds = new Set(scopedProcesses.map((p) => p.id));
    const valueStreamIds = new Set(scopedValueStreams.map((v) => v.id));
    const scopedStages = valueStreamStages.filter((s) => valueStreamIds.has(s.valueStreamId));
    const stageIds = new Set(scopedStages.map((s) => s.id));
    const buildingBlockIds = new Set(scopedBuildingBlocks.map((b) => b.id));
    const scopedInformationObjects = enterpriseFilter(informationObjects);
    const informationObjectIds = new Set(scopedInformationObjects.map((i) => i.id));
    const scopedActors = enterpriseFilter(actors);
    const actorIds = new Set(scopedActors.map((a) => a.id));

    // Row order is not meaningful; a stable one keeps a re-export of the same
    // model byte-identical, so a diff between two bundles shows real changes.
    const byId = <T extends { id: string }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const byKey = <T>(rows: T[], key: (r: T) => string): T[] =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b)));

    return sortBundle({
      enterprises: enterprises.filter((e) => visible.has(e.id)),
      businessCapabilities: scopedCapabilities,
      businessProcesses: scopedProcesses,
      processSteps: processSteps.filter((s) => processIds.has(s.processId)),
      valueStreams: scopedValueStreams,
      valueStreamStages: scopedStages,
      stageCapabilities: stageCapabilities.filter(
        (sc) => stageIds.has(sc.stageId) && capabilityIds.has(sc.capabilityId),
      ),
      architectureDomains: enterpriseFilter(architectureDomains),
      organizationUnits: enterpriseFilter(organizationUnits),
      buildingBlocks: scopedBuildingBlocks,
      buildingBlockArchitectureDomains: buildingBlockArchitectureDomains.filter((l) =>
        buildingBlockIds.has(l.buildingBlockId),
      ),
      buildingBlockOrganizationUnits: buildingBlockOrganizationUnits.filter((l) =>
        buildingBlockIds.has(l.buildingBlockId),
      ),
      buildingBlockRealizations: buildingBlockRealizations.filter(
        (l) =>
          buildingBlockIds.has(l.architectureBuildingBlockId) &&
          buildingBlockIds.has(l.solutionBuildingBlockId),
      ),
      buildingBlockCapabilities: buildingBlockCapabilities.filter(
        (l) => buildingBlockIds.has(l.buildingBlockId) && capabilityIds.has(l.capabilityId),
      ),
      buildingBlockRelationships: buildingBlockRelationships.filter(
        (l) =>
          buildingBlockIds.has(l.sourceBuildingBlockId) &&
          buildingBlockIds.has(l.targetBuildingBlockId),
      ),
      informationObjects: scopedInformationObjects,
      capabilityInformation: capabilityInformation.filter(
        (l) => informationObjectIds.has(l.informationObjectId) && capabilityIds.has(l.capabilityId),
      ),
      actors: scopedActors,
      capabilityActors: capabilityActors.filter(
        (l) => actorIds.has(l.actorId) && capabilityIds.has(l.capabilityId),
      ),
    });

    function sortBundle(bundle: DataBundle): DataBundle {
      return {
        ...bundle,
        enterprises: byId(bundle.enterprises),
        businessCapabilities: byId(bundle.businessCapabilities),
        businessProcesses: byId(bundle.businessProcesses),
        processSteps: byId(bundle.processSteps),
        valueStreams: byId(bundle.valueStreams),
        valueStreamStages: byId(bundle.valueStreamStages),
        stageCapabilities: byKey(bundle.stageCapabilities, (r) => `${r.stageId}/${r.capabilityId}`),
        architectureDomains: byId(bundle.architectureDomains),
        organizationUnits: byId(bundle.organizationUnits),
        buildingBlocks: byId(bundle.buildingBlocks),
        buildingBlockArchitectureDomains: byKey(
          bundle.buildingBlockArchitectureDomains,
          (r) => `${r.buildingBlockId}/${r.architectureDomainId}`,
        ),
        buildingBlockOrganizationUnits: byId(bundle.buildingBlockOrganizationUnits),
        buildingBlockRealizations: byId(bundle.buildingBlockRealizations),
        buildingBlockCapabilities: byId(bundle.buildingBlockCapabilities),
        buildingBlockRelationships: byId(bundle.buildingBlockRelationships),
        informationObjects: byId(bundle.informationObjects),
        capabilityInformation: byId(bundle.capabilityInformation),
        actors: byId(bundle.actors),
        capabilityActors: byId(bundle.capabilityActors),
      };
    }
  }

  async import(principal: Principal, bundle: DataBundle): Promise<void> {
    // The invariants the services enforce, applied to the whole bundle up
    // front (D-16). Nothing is written if anything is wrong.
    const issues = validateBundle(bundle);
    if (issues.length > 0) {
      throw new BadRequestException({ message: 'The bundle violates model rules', issues });
    }

    const enterpriseIds = bundle.enterprises.map((e) => e.id);

    // An enterprise that already exists here may only be replaced by one of
    // its members; a bundle is not a way around the boundary.
    const existing = await this.db.query.enterprises.findMany({
      where: (t, { inArray }) => inArray(t.id, enterpriseIds),
      columns: { id: true, name: true },
    });
    for (const enterprise of existing) {
      if (!principal.enterpriseIds.includes(enterprise.id)) {
        throw new ForbiddenException(
          `Enterprise ${enterprise.id} exists and you are not a member of it`,
        );
      }
      assertCan(principal, 'data.import', enterprise.id);
    }

    // Deleting the enterprises cascades through enterprise_members too;
    // remember who had access so a restore does not lock anyone out.
    const memberships =
      enterpriseIds.length > 0
        ? await this.db.query.enterpriseMembers.findMany({
            where: (t, { inArray }) => inArray(t.enterpriseId, enterpriseIds),
            columns: { enterpriseId: true, userId: true, role: true },
          })
        : [];

    await this.db.transaction(async (tx) => {
      // Replace the bundle's enterprises: deleting them cascades to every
      // row modeled within them, leaving other enterprises untouched.
      if (enterpriseIds.length > 0) {
        await tx.delete(schema.enterprises).where(inArray(schema.enterprises.id, enterpriseIds));
      }

      // INV-10: ids are globally unique. The bundle's own enterprises are
      // gone at this point, so any id that still exists belongs to another
      // enterprise — report it by table and id instead of letting Postgres
      // answer with a duplicate-key 500. Throwing rolls the transaction back.
      const collisions = await this.collisions(tx, bundle);
      if (collisions.length > 0) {
        throw new BadRequestException({
          message: 'The bundle reuses ids that already exist in another enterprise',
          issues: collisions,
        });
      }

      if (enterpriseIds.length > 0) {
        await tx.insert(schema.enterprises).values(bundle.enterprises);

        // Memberships and roles survive the replace; whoever imports a new
        // enterprise owns it.
        const restored = new Map(memberships.map((m) => [`${m.enterpriseId}:${m.userId}`, m]));
        for (const enterpriseId of enterpriseIds) {
          const key = `${enterpriseId}:${principal.userId}`;
          if (!restored.has(key)) {
            restored.set(key, { enterpriseId, userId: principal.userId, role: 'owner' as const });
          }
        }
        await tx.insert(schema.enterpriseMembers).values([...restored.values()]);
        for (const m of restored.values()) {
          if (m.userId === principal.userId) grantMembership(principal, m.enterpriseId, m.role);
        }
      }

      // Insert parent-to-child.
      if (bundle.businessCapabilities.length > 0) {
        await tx.insert(schema.businessCapabilities).values(bundle.businessCapabilities);
      }
      if (bundle.valueStreams.length > 0) {
        await tx.insert(schema.valueStreams).values(bundle.valueStreams);
      }
      if (bundle.businessProcesses.length > 0) {
        await tx.insert(schema.businessProcesses).values(bundle.businessProcesses);
      }
      if (bundle.valueStreamStages.length > 0) {
        await tx.insert(schema.valueStreamStages).values(bundle.valueStreamStages);
      }
      if (bundle.processSteps.length > 0) {
        await tx.insert(schema.processSteps).values(bundle.processSteps);
      }
      if (bundle.stageCapabilities.length > 0) {
        await tx.insert(schema.stageCapabilities).values(bundle.stageCapabilities);
      }
      if (bundle.architectureDomains.length > 0) {
        await tx.insert(schema.architectureDomains).values(bundle.architectureDomains);
      }
      if (bundle.organizationUnits.length > 0) {
        await tx.insert(schema.organizationUnits).values(parentsFirst(bundle.organizationUnits));
      }
      if (bundle.buildingBlocks.length > 0) {
        await tx.insert(schema.buildingBlocks).values(bundle.buildingBlocks);
      }
      if (bundle.buildingBlockArchitectureDomains.length > 0) {
        await tx
          .insert(schema.buildingBlockArchitectureDomains)
          .values(bundle.buildingBlockArchitectureDomains);
      }
      if (bundle.buildingBlockOrganizationUnits.length > 0) {
        await tx
          .insert(schema.buildingBlockOrganizationUnits)
          .values(bundle.buildingBlockOrganizationUnits);
      }
      if (bundle.buildingBlockRealizations.length > 0) {
        await tx.insert(schema.buildingBlockRealizations).values(bundle.buildingBlockRealizations);
      }
      if (bundle.buildingBlockCapabilities.length > 0) {
        await tx.insert(schema.buildingBlockCapabilities).values(bundle.buildingBlockCapabilities);
      }
      if (bundle.buildingBlockRelationships.length > 0) {
        await tx
          .insert(schema.buildingBlockRelationships)
          .values(bundle.buildingBlockRelationships);
      }
      if (bundle.informationObjects.length > 0) {
        await tx.insert(schema.informationObjects).values(bundle.informationObjects);
      }
      if (bundle.capabilityInformation.length > 0) {
        await tx.insert(schema.capabilityInformation).values(bundle.capabilityInformation);
      }
      if (bundle.actors.length > 0) {
        await tx.insert(schema.actors).values(bundle.actors);
      }
      if (bundle.capabilityActors.length > 0) {
        await tx.insert(schema.capabilityActors).values(bundle.capabilityActors);
      }
    });
  }

  private async collisions(tx: Transaction, bundle: DataBundle): Promise<BundleIssue[]> {
    const tables = [
      ['enterprises', schema.enterprises, bundle.enterprises],
      ['businessCapabilities', schema.businessCapabilities, bundle.businessCapabilities],
      ['businessProcesses', schema.businessProcesses, bundle.businessProcesses],
      ['processSteps', schema.processSteps, bundle.processSteps],
      ['valueStreams', schema.valueStreams, bundle.valueStreams],
      ['valueStreamStages', schema.valueStreamStages, bundle.valueStreamStages],
      ['architectureDomains', schema.architectureDomains, bundle.architectureDomains],
      ['organizationUnits', schema.organizationUnits, bundle.organizationUnits],
      ['buildingBlocks', schema.buildingBlocks, bundle.buildingBlocks],
      [
        'buildingBlockOrganizationUnits',
        schema.buildingBlockOrganizationUnits,
        bundle.buildingBlockOrganizationUnits,
      ],
      [
        'buildingBlockRealizations',
        schema.buildingBlockRealizations,
        bundle.buildingBlockRealizations,
      ],
      [
        'buildingBlockCapabilities',
        schema.buildingBlockCapabilities,
        bundle.buildingBlockCapabilities,
      ],
      [
        'buildingBlockRelationships',
        schema.buildingBlockRelationships,
        bundle.buildingBlockRelationships,
      ],
      ['informationObjects', schema.informationObjects, bundle.informationObjects],
      ['capabilityInformation', schema.capabilityInformation, bundle.capabilityInformation],
      ['actors', schema.actors, bundle.actors],
      ['capabilityActors', schema.capabilityActors, bundle.capabilityActors],
    ] as const;

    const issues: BundleIssue[] = [];
    for (const [name, table, rows] of tables) {
      if (rows.length === 0) continue;
      const existing = await tx
        .select({ id: table.id })
        .from(table)
        .where(
          inArray(
            table.id,
            rows.map((r) => r.id),
          ),
        );
      for (const row of existing) {
        issues.push({
          table: name,
          id: row.id,
          message: 'id already exists in another enterprise',
        });
      }
    }
    return issues;
  }
}
