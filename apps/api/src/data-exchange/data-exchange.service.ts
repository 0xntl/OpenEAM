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
import { and, type Column, type Database, inArray, schema, type Transaction } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { grantMembership, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import { CURRENT_FORMAT_VERSION, generator } from './data-bundle.format';
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
  // it: just that enterprise's model. Every query is scoped in the database:
  // rows of enterprise-owned tables by enterprise id, child and link rows by
  // a subquery on their parents, so an export reads only what it returns.
  async export(principal: Principal, enterpriseId?: string): Promise<DataBundle> {
    if (enterpriseId) assertCan(principal, 'data.export', enterpriseId);
    const ids = enterpriseId ? [enterpriseId] : [...principal.enterpriseIds];

    const owned = (enterpriseIdColumn: Column) => inArray(enterpriseIdColumn, ids);
    const capabilityIds = this.db
      .select({ id: schema.businessCapabilities.id })
      .from(schema.businessCapabilities)
      .where(owned(schema.businessCapabilities.enterpriseId));
    const processIds = this.db
      .select({ id: schema.businessProcesses.id })
      .from(schema.businessProcesses)
      .where(owned(schema.businessProcesses.enterpriseId));
    const valueStreamIds = this.db
      .select({ id: schema.valueStreams.id })
      .from(schema.valueStreams)
      .where(owned(schema.valueStreams.enterpriseId));
    const buildingBlockIds = this.db
      .select({ id: schema.buildingBlocks.id })
      .from(schema.buildingBlocks)
      .where(owned(schema.buildingBlocks.enterpriseId));
    const informationObjectIds = this.db
      .select({ id: schema.informationObjects.id })
      .from(schema.informationObjects)
      .where(owned(schema.informationObjects.enterpriseId));
    const actorIds = this.db
      .select({ id: schema.actors.id })
      .from(schema.actors)
      .where(owned(schema.actors.enterpriseId));
    const stageIds = this.db
      .select({ id: schema.valueStreamStages.id })
      .from(schema.valueStreamStages)
      .where(inArray(schema.valueStreamStages.valueStreamId, valueStreamIds));

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
      this.db.select().from(schema.enterprises).where(inArray(schema.enterprises.id, ids)),
      this.db
        .select()
        .from(schema.businessCapabilities)
        .where(owned(schema.businessCapabilities.enterpriseId)),
      this.db
        .select()
        .from(schema.businessProcesses)
        .where(owned(schema.businessProcesses.enterpriseId)),
      this.db
        .select()
        .from(schema.processSteps)
        .where(inArray(schema.processSteps.processId, processIds)),
      this.db.select().from(schema.valueStreams).where(owned(schema.valueStreams.enterpriseId)),
      this.db
        .select()
        .from(schema.valueStreamStages)
        .where(inArray(schema.valueStreamStages.valueStreamId, valueStreamIds)),
      this.db
        .select()
        .from(schema.stageCapabilities)
        .where(
          and(
            inArray(schema.stageCapabilities.stageId, stageIds),
            inArray(schema.stageCapabilities.capabilityId, capabilityIds),
          ),
        ),
      this.db
        .select()
        .from(schema.architectureDomains)
        .where(owned(schema.architectureDomains.enterpriseId)),
      this.db
        .select()
        .from(schema.organizationUnits)
        .where(owned(schema.organizationUnits.enterpriseId)),
      this.db.select().from(schema.buildingBlocks).where(owned(schema.buildingBlocks.enterpriseId)),
      this.db
        .select()
        .from(schema.buildingBlockArchitectureDomains)
        .where(inArray(schema.buildingBlockArchitectureDomains.buildingBlockId, buildingBlockIds)),
      this.db
        .select()
        .from(schema.buildingBlockOrganizationUnits)
        .where(inArray(schema.buildingBlockOrganizationUnits.buildingBlockId, buildingBlockIds)),
      this.db
        .select()
        .from(schema.buildingBlockRealizations)
        .where(
          and(
            inArray(schema.buildingBlockRealizations.architectureBuildingBlockId, buildingBlockIds),
            inArray(schema.buildingBlockRealizations.solutionBuildingBlockId, buildingBlockIds),
          ),
        ),
      this.db
        .select()
        .from(schema.buildingBlockCapabilities)
        .where(
          and(
            inArray(schema.buildingBlockCapabilities.buildingBlockId, buildingBlockIds),
            inArray(schema.buildingBlockCapabilities.capabilityId, capabilityIds),
          ),
        ),
      this.db
        .select()
        .from(schema.buildingBlockRelationships)
        .where(
          and(
            inArray(schema.buildingBlockRelationships.sourceBuildingBlockId, buildingBlockIds),
            inArray(schema.buildingBlockRelationships.targetBuildingBlockId, buildingBlockIds),
          ),
        ),
      this.db
        .select()
        .from(schema.informationObjects)
        .where(owned(schema.informationObjects.enterpriseId)),
      this.db
        .select()
        .from(schema.capabilityInformation)
        .where(
          and(
            inArray(schema.capabilityInformation.informationObjectId, informationObjectIds),
            inArray(schema.capabilityInformation.capabilityId, capabilityIds),
          ),
        ),
      this.db.select().from(schema.actors).where(owned(schema.actors.enterpriseId)),
      this.db
        .select()
        .from(schema.capabilityActors)
        .where(
          and(
            inArray(schema.capabilityActors.actorId, actorIds),
            inArray(schema.capabilityActors.capabilityId, capabilityIds),
          ),
        ),
    ]);

    // Row order is not meaningful; a stable one keeps a re-export of the same
    // model byte-identical, so a diff between two bundles shows real changes.
    const byId = <T extends { id: string }>(rows: T[]): T[] =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const byKey = <T>(rows: T[], key: (r: T) => string): T[] =>
      [...rows].sort((a, b) => key(a).localeCompare(key(b)));

    return {
      formatVersion: CURRENT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      generator: generator(),
      enterprises: byId(enterprises),
      businessCapabilities: byId(businessCapabilities),
      businessProcesses: byId(businessProcesses),
      processSteps: byId(processSteps),
      valueStreams: byId(valueStreams),
      valueStreamStages: byId(valueStreamStages),
      stageCapabilities: byKey(stageCapabilities, (r) => `${r.stageId}/${r.capabilityId}`),
      architectureDomains: byId(architectureDomains),
      organizationUnits: byId(organizationUnits),
      buildingBlocks: byId(buildingBlocks),
      buildingBlockArchitectureDomains: byKey(
        buildingBlockArchitectureDomains,
        (r) => `${r.buildingBlockId}/${r.architectureDomainId}`,
      ),
      buildingBlockOrganizationUnits: byId(buildingBlockOrganizationUnits),
      buildingBlockRealizations: byId(buildingBlockRealizations),
      buildingBlockCapabilities: byId(buildingBlockCapabilities),
      buildingBlockRelationships: byId(buildingBlockRelationships),
      informationObjects: byId(informationObjects),
      capabilityInformation: byId(capabilityInformation),
      actors: byId(actors),
      capabilityActors: byId(capabilityActors),
    };
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
