import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, inArray, schema } from '@openeam/db';
import { assertCan } from '../auth/policy';
import { assertEnterpriseAccess, type Principal } from '../auth/principal';
import {
  INTERVAL_MESSAGE,
  isHalfOpenInterval,
  ORGANIZATION_UNIT_MESSAGE,
  organizationUnitAllowed,
} from '../common/invariants';
import { DATABASE } from '../db.module';
import type {
  Actor,
  ActorInput,
  ActorInvolvement,
  ActorKind,
  CapabilityActorInput,
} from './actor.model';

type ActorRow = {
  id: string;
  enterpriseId: string;
  kind: string;
  name: string;
  description: string | null;
  organizationUnitId: string | null;
  organizationUnit: { id: string; name: string } | null;
  capabilityLinks: Array<{
    id: string;
    involvement: string;
    validFrom: string | null;
    validTo: string | null;
    capability: { id: string; name: string };
  }>;
};

const withLinks = {
  organizationUnit: true,
  capabilityLinks: { with: { capability: true } },
} as const;

@Injectable()
export class ActorsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findAll(principal: Principal, enterpriseId: string): Promise<Actor[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.actors.findMany({
      where: (t, { eq: equals }) => equals(t.enterpriseId, enterpriseId),
      orderBy: (t, { asc }) => [asc(t.name)],
      with: withLinks,
    });
    return rows.map(toActor);
  }

  // Scoped to the caller's enterprises (INV-16): an id from elsewhere reads
  // as not found.
  async findOne(principal: Principal, id: string): Promise<Actor | undefined> {
    const row = await this.db.query.actors.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(equals(t.id, id), inArray(t.enterpriseId, principal.enterpriseIds)),
      with: withLinks,
    });
    return row ? toActor(row) : undefined;
  }

  async create(principal: Principal, input: ActorInput): Promise<Actor> {
    assertCan(principal, 'model.write', input.enterpriseId);
    await this.validate(input, input.enterpriseId);
    const [inserted] = await this.db
      .insert(schema.actors)
      .values({
        enterpriseId: input.enterpriseId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        organizationUnitId: input.organizationUnitId ?? null,
      })
      .returning({ id: schema.actors.id });

    if (!inserted) throw new NotFoundException('Actor insert returned no row');
    const created = await this.findOne(principal, inserted.id);
    if (!created) throw new NotFoundException(`Actor ${inserted.id} not found after creation`);
    return created;
  }

  // enterpriseId is intentionally not updatable: rows never move between
  // enterprises (see docs/VISION.md). The stored one, not the input's, is
  // what the organization unit is checked against.
  async update(principal: Principal, id: string, input: ActorInput): Promise<Actor> {
    const existing = await this.findOne(principal, id);
    if (!existing) throw new NotFoundException(`Actor ${id} not found`);
    assertCan(principal, 'model.write', existing.enterpriseId);
    await this.validate(input, existing.enterpriseId);

    await this.db
      .update(schema.actors)
      .set({
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        organizationUnitId: input.organizationUnitId ?? null,
      })
      .where(eq(schema.actors.id, id));

    const result = await this.findOne(principal, id);
    if (!result) throw new NotFoundException(`Actor ${id} not found after update`);
    return result;
  }

  async delete(principal: Principal, id: string): Promise<boolean> {
    const existing = await this.findOne(principal, id);
    if (!existing) return false;
    assertCan(principal, 'model.write', existing.enterpriseId);
    const [deleted] = await this.db
      .delete(schema.actors)
      .where(
        and(eq(schema.actors.id, id), inArray(schema.actors.enterpriseId, principal.enterpriseIds)),
      )
      .returning({ id: schema.actors.id });
    return Boolean(deleted);
  }

  async link(principal: Principal, input: CapabilityActorInput): Promise<Actor> {
    const capability = await this.db.query.businessCapabilities.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(equals(t.id, input.capabilityId), inArray(t.enterpriseId, principal.enterpriseIds)),
    });
    if (!capability) {
      throw new BadRequestException(`Business capability ${input.capabilityId} not found`);
    }
    assertCan(principal, 'model.write', capability.enterpriseId);

    const actor = await this.db.query.actors.findFirst({
      where: (t, { and, eq: equals, inArray }) =>
        and(equals(t.id, input.actorId), inArray(t.enterpriseId, principal.enterpriseIds)),
    });
    if (!actor) throw new BadRequestException(`Actor ${input.actorId} not found`);

    // INV-14: a link may not straddle two enterprises. Both ids are valid on
    // their own; the pair is what is wrong.
    if (capability.enterpriseId !== actor.enterpriseId) {
      throw new BadRequestException('A capability and an actor must belong to the same enterprise');
    }

    // INV-1: half-open, so an interval that starts where it ends is empty.
    if (!isHalfOpenInterval(input.validFrom, input.validTo)) {
      throw new BadRequestException(INTERVAL_MESSAGE);
    }

    // INV-15: one open link per pair — close the existing one before opening
    // another, the same rule as hosted_on (INV-5).
    if (!input.validTo) {
      const open = await this.db.query.capabilityActors.findFirst({
        where: (t, { and, eq: equals, isNull }) =>
          and(
            equals(t.capabilityId, input.capabilityId),
            equals(t.actorId, input.actorId),
            isNull(t.validTo),
          ),
      });
      if (open) {
        throw new BadRequestException(
          'This capability already has an open link to that actor — close it (set validTo) before adding another',
        );
      }
    }

    await this.db.insert(schema.capabilityActors).values({
      capabilityId: input.capabilityId,
      actorId: input.actorId,
      involvement: (input.involvement ?? 'performs') as ActorInvolvement,
      validFrom: input.validFrom ?? null,
      validTo: input.validTo ?? null,
    });

    const result = await this.findOne(principal, input.actorId);
    if (!result) throw new NotFoundException(`Actor ${input.actorId} not found`);
    return result;
  }

  // The link has no enterpriseId of its own; it is scoped through the actor.
  async unlink(principal: Principal, linkId: string): Promise<boolean> {
    const link = await this.db.query.capabilityActors.findFirst({
      where: (t, { eq: equals }) => equals(t.id, linkId),
      with: { actor: { columns: { enterpriseId: true } } },
    });
    if (!link || !principal.enterpriseIds.includes(link.actor.enterpriseId)) return false;
    assertCan(principal, 'model.write', link.actor.enterpriseId);

    const [deleted] = await this.db
      .delete(schema.capabilityActors)
      .where(eq(schema.capabilityActors.id, linkId))
      .returning({ id: schema.capabilityActors.id });
    return Boolean(deleted);
  }

  // INV-13: organizationUnitId is meaningful only for a team, and the unit has
  // to belong to the same enterprise. A team actor pointing at the unit that
  // already models it is the whole reason the column exists — without the
  // check, teams quietly end up modelled twice under two names.
  private async validate(input: ActorInput, enterpriseId: string): Promise<void> {
    if (!input.organizationUnitId) return;

    if (!organizationUnitAllowed(input.kind, input.organizationUnitId)) {
      throw new BadRequestException(ORGANIZATION_UNIT_MESSAGE);
    }

    const unit = await this.db.query.organizationUnits.findFirst({
      where: (t, { eq: equals }) => equals(t.id, input.organizationUnitId as string),
    });
    if (!unit)
      throw new BadRequestException(`Organization unit ${input.organizationUnitId} not found`);
    if (unit.enterpriseId !== enterpriseId) {
      throw new BadRequestException(
        'An actor and its organization unit must belong to the same enterprise',
      );
    }
  }
}

function toActor(row: ActorRow): Actor {
  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    kind: row.kind as ActorKind,
    name: row.name,
    description: row.description,
    organizationUnitId: row.organizationUnitId,
    organizationUnitName: row.organizationUnit?.name ?? null,
    capabilities: row.capabilityLinks.map((link) => ({
      linkId: link.id,
      capabilityId: link.capability.id,
      capabilityName: link.capability.name,
      involvement: link.involvement as ActorInvolvement,
      validFrom: link.validFrom,
      validTo: link.validTo,
    })),
  };
}
