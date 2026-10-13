import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import type { ActorInvolvement, ActorKind } from '../actors/actor.model';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import type { MappedBuildingBlock } from '../building-blocks/building-blocks.service';
import { toBuildingBlock, withAllLinks } from '../building-blocks/building-blocks.service';
import type { BusinessProcess } from '../business-processes/business-process.model';
import { DATABASE } from '../db.module';
import type { InformationUsage } from '../information-objects/information-object.model';
import type {
  BusinessCapabilityInput,
  CapabilityActor,
  Information,
  ValueStreamStageLink,
} from './business-capability.model';

export interface BusinessCapabilityRow {
  id: string;
  enterpriseId: string;
  name: string;
  description: string | null;
  direction: string | null;
  businessProcesses: BusinessProcess[];
  resources: MappedBuildingBlock[];
  information: Information[];
  actors: CapabilityActor[];
  valueStreamStages: ValueStreamStageLink[];
}

@Injectable()
export class BusinessCapabilitiesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAll(principal: Principal, enterpriseId: string): Promise<BusinessCapabilityRow[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.businessCapabilities.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      with: {
        businessProcesses: {
          with: { steps: { orderBy: (t, { asc }) => [asc(t.position)] } },
        },
        buildingBlockLinks: { with: { buildingBlock: { with: withAllLinks } } },
        stageCapabilities: { with: { stage: { with: { valueStream: true } } } },
        informationLinks: { with: { informationObject: true } },
        actorLinks: { with: { actor: true } },
      },
    });
    return rows.map(toCapabilityRow);
  }

  // Scoped to the caller's enterprises (INV-16).
  async findOne(principal: Principal, id: string): Promise<BusinessCapabilityRow | undefined> {
    const row = await this.db.query.businessCapabilities.findFirst({
      where: (t, { and, eq, inArray }) =>
        and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: {
        businessProcesses: {
          with: { steps: { orderBy: (t, { asc }) => [asc(t.position)] } },
        },
        buildingBlockLinks: { with: { buildingBlock: { with: withAllLinks } } },
        stageCapabilities: { with: { stage: { with: { valueStream: true } } } },
        informationLinks: { with: { informationObject: true } },
        actorLinks: { with: { actor: true } },
      },
    });
    return row ? toCapabilityRow(row) : undefined;
  }

  async create(
    principal: Principal,
    input: BusinessCapabilityInput,
  ): Promise<BusinessCapabilityRow> {
    assertCan(principal, 'model.write', input.enterpriseId);
    const [inserted] = await this.db
      .insert(schema.businessCapabilities)
      .values({
        enterpriseId: input.enterpriseId,
        name: input.name,
        description: input.description ?? null,
        direction: input.direction ?? null,
      })
      .returning({ id: schema.businessCapabilities.id });

    if (!inserted) throw new NotFoundException('Business capability insert returned no row');
    const created = await this.findOne(principal, inserted.id);
    if (!created) {
      throw new NotFoundException(`Business capability ${inserted.id} not found after creation`);
    }
    return created;
  }

  // enterpriseId is intentionally not updatable: entities never move between
  // enterprises (see docs/VISION.md — models are owned by exactly one scope).
  async update(
    principal: Principal,
    id: string,
    input: BusinessCapabilityInput,
  ): Promise<BusinessCapabilityRow> {
    await this.requireWritable(principal, id);
    const [updated] = await this.db
      .update(schema.businessCapabilities)
      .set({
        name: input.name,
        description: input.description ?? null,
        direction: input.direction ?? null,
      })
      .where(
        and(
          eq(schema.businessCapabilities.id, id),
          inArray(schema.businessCapabilities.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.businessCapabilities.id });

    if (!updated) throw new NotFoundException(`Business capability ${id} not found`);
    const result = await this.findOne(principal, id);
    if (!result) {
      throw new NotFoundException(`Business capability ${id} not found after update`);
    }
    return result;
  }

  private requireWritable(principal: Principal, id: string) {
    return requireWritableCapability(this.db, principal, id);
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    await this.requireWritable(principal, id);
    const [deleted] = await this.db
      .delete(schema.businessCapabilities)
      .where(
        and(
          eq(schema.businessCapabilities.id, id),
          inArray(schema.businessCapabilities.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.businessCapabilities.id });
    return Boolean(deleted);
  }
}

// Scoped existence check plus the write permission, without loading the
// capability's whole graph.
async function requireWritableCapability(db: Database, principal: Principal, id: string) {
  const row = await db.query.businessCapabilities.findFirst({
    where: (t, { and, eq, inArray }) =>
      and(eq(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
    columns: { enterpriseId: true },
  });
  if (!row) throw new NotFoundException(`Business capability ${id} not found`);
  assertCan(principal, 'model.write', row.enterpriseId);
}

function toCapabilityRow(row: {
  id: string;
  enterpriseId: string;
  name: string;
  description: string | null;
  direction: string | null;
  businessProcesses: BusinessProcess[];
  buildingBlockLinks: Array<{ buildingBlock: Parameters<typeof toBuildingBlock>[0] }>;
  stageCapabilities: Array<{
    stage: { id: string; name: string; valueStream: { id: string; name: string } };
  }>;
  informationLinks: Array<{
    id: string;
    usage: string;
    validFrom: string | null;
    validTo: string | null;
    informationObject: { id: string; name: string; description: string | null };
  }>;
  actorLinks: Array<{
    id: string;
    involvement: string;
    validFrom: string | null;
    validTo: string | null;
    actor: { id: string; name: string; description: string | null; kind: string };
  }>;
}): BusinessCapabilityRow {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    name: row.name,
    description: row.description,
    direction: row.direction,
    businessProcesses: row.businessProcesses,
    resources: row.buildingBlockLinks.map((link) => toBuildingBlock(link.buildingBlock)),
    information: row.informationLinks.map((link) => ({
      id: link.informationObject.id,
      linkId: link.id,
      name: link.informationObject.name,
      description: link.informationObject.description,
      usage: link.usage as InformationUsage,
      validFrom: link.validFrom,
      validTo: link.validTo,
    })),
    actors: row.actorLinks.map((link) => ({
      id: link.actor.id,
      linkId: link.id,
      name: link.actor.name,
      description: link.actor.description,
      kind: link.actor.kind as ActorKind,
      involvement: link.involvement as ActorInvolvement,
      validFrom: link.validFrom,
      validTo: link.validTo,
    })),
    valueStreamStages: row.stageCapabilities.map((sc) => ({
      valueStreamId: sc.stage.valueStream.id,
      valueStreamName: sc.stage.valueStream.name,
      stageId: sc.stage.id,
      stageName: sc.stage.name,
    })),
  };
}
