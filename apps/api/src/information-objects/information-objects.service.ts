import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import { INTERVAL_MESSAGE, isHalfOpenInterval } from '../common/invariants';
import { DATABASE } from '../db.module';
import type {
  CapabilityInformationInput,
  InformationObject,
  InformationUsage,
} from './information-object.model';

type InformationObjectRow = {
  id: string;
  enterpriseId: string;
  name: string;
  description: string | null;
  capabilityLinks: Array<{
    id: string;
    usage: string;
    validFrom: string | null;
    validTo: string | null;
    capability: { id: string; name: string };
  }>;
};

@Injectable()
export class InformationObjectsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAll(principal: Principal, enterpriseId: string): Promise<InformationObject[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.informationObjects.findMany({
      where: (t, { eq: equals }) => equals(t.enterpriseId, enterpriseId),
      orderBy: (t, { asc }) => [asc(t.name)],
      with: { capabilityLinks: { with: { capability: true } } },
    });
    return rows.map(toInformationObject);
  }

  // Scoped to the caller's enterprises (INV-16).
  async findOne(principal: Principal, id: string): Promise<InformationObject | undefined> {
    const row = await this.db.query.informationObjects.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(equals(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: { capabilityLinks: { with: { capability: true } } },
    });
    return row ? toInformationObject(row) : undefined;
  }

  async create(
    principal: Principal,
    input: InformationObjectInputShape,
  ): Promise<InformationObject> {
    assertCan(principal, 'model.write', input.enterpriseId);
    const [inserted] = await this.db
      .insert(schema.informationObjects)
      .values({
        enterpriseId: input.enterpriseId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning({ id: schema.informationObjects.id });

    if (!inserted) throw new NotFoundException('Information object insert returned no row');
    const created = await this.findOne(principal, inserted.id);
    if (!created) {
      throw new NotFoundException(`Information object ${inserted.id} not found after creation`);
    }
    return created;
  }

  // enterpriseId is intentionally not updatable, same as every other entity:
  // rows never move between enterprises (see docs/VISION.md).
  async update(
    principal: Principal,
    id: string,
    input: InformationObjectInputShape,
  ): Promise<InformationObject> {
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Information object ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [updated] = await this.db
      .update(schema.informationObjects)
      .set({ name: input.name, description: input.description ?? null })
      .where(
        and(
          eq(schema.informationObjects.id, id),
          inArray(schema.informationObjects.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.informationObjects.id });

    if (!updated) throw new NotFoundException(`Information object ${id} not found`);
    const result = await this.findOne(principal, id);
    if (!result) throw new NotFoundException(`Information object ${id} not found after update`);
    return result;
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    const existing = await this.findOne(principal, id);
    if (!existing) return false;
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [deleted] = await this.db
      .delete(schema.informationObjects)
      .where(
        and(
          eq(schema.informationObjects.id, id),
          inArray(schema.informationObjects.enterpriseId, principal.enterpriseIds),
        ),
      )
      .returning({ id: schema.informationObjects.id });
    return Boolean(deleted);
  }

  async link(principal: Principal, input: CapabilityInformationInput): Promise<InformationObject> {
    const capability = await this.db.query.businessCapabilities.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(equals(t.id, input.capabilityId), inArray(t.enterpriseId, principal.enterpriseIds)),
    });
    if (!capability) {
      throw new BadRequestException(`Business capability ${input.capabilityId} not found`);
    }
    assertCan(principal, 'model.write', capability.enterpriseId);

    const object = await this.db.query.informationObjects.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(
          equals(t.id, input.informationObjectId),
          inArray(t.enterpriseId, principal.enterpriseIds),
        ),
    });
    if (!object) {
      throw new BadRequestException(`Information object ${input.informationObjectId} not found`);
    }

    // INV-11: a link may not straddle two enterprises. Nothing else enforces
    // this — both ids are valid on their own, and the pair is what is wrong.
    if (capability.enterpriseId !== object.enterpriseId) {
      throw new BadRequestException(
        'A capability and an information object must belong to the same enterprise',
      );
    }

    // INV-1: half-open, so an interval that starts where it ends is empty.
    if (!isHalfOpenInterval(input.validFrom, input.validTo)) {
      throw new BadRequestException(INTERVAL_MESSAGE);
    }

    // INV-12, the same rule as hosted_on (INV-5): one *open* link per pair.
    // Closing the existing one (setting validTo) before opening another is the
    // caller's job, exactly as it is for every temporal link in this schema.
    if (!input.validTo) {
      const open = await this.db.query.capabilityInformation.findFirst({
        where: (t, { and, eq: equals, isNull }) =>
          and(
            equals(t.capabilityId, input.capabilityId),
            equals(t.informationObjectId, input.informationObjectId),
            isNull(t.validTo),
          ),
      });
      if (open) {
        throw new BadRequestException(
          'This capability already has an open link to that information object — close it (set validTo) before adding another',
        );
      }
    }

    await this.db.insert(schema.capabilityInformation).values({
      capabilityId: input.capabilityId,
      informationObjectId: input.informationObjectId,
      usage: (input.usage ?? 'uses') as InformationUsage,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    });

    const result = await this.findOne(principal, input.informationObjectId);
    if (!result) {
      throw new NotFoundException(`Information object ${input.informationObjectId} not found`);
    }
    return result;
  }

  // The link has no enterpriseId of its own; it is scoped through the object.
  async unlink(principal: Principal, linkId: string): Promise<boolean> {
    const link = await this.db.query.capabilityInformation.findFirst({
      where: (t, { eq: equals }) => equals(t.id, linkId),
      with: { informationObject: { columns: { enterpriseId: true } } },
    });
    if (!link || !principal.enterpriseIds.includes(link.informationObject.enterpriseId)) {
      return false;
    }
    assertCan(principal, 'model.write', link.informationObject.enterpriseId);

    const [deleted] = await this.db
      .delete(schema.capabilityInformation)
      .where(eq(schema.capabilityInformation.id, linkId))
      .returning({ id: schema.capabilityInformation.id });
    return Boolean(deleted);
  }
}

type InformationObjectInputShape = {
  enterpriseId: string;
  name: string;
  description?: string | null;
};

function toInformationObject(row: InformationObjectRow): InformationObject {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    name: row.name,
    description: row.description,
    capabilities: row.capabilityLinks.map((link) => ({
      linkId: link.id,
      capabilityId: link.capability.id,
      capabilityName: link.capability.name,
      usage: link.usage as InformationUsage,
      validFrom: link.validFrom,
      validTo: link.validTo,
    })),
  };
}
