import { BadRequestException } from '@nestjs/common';
import { eq, schema } from '@openeam/db';
import { ActorKind } from '../../src/actors/actor.model';
import { describe, expect, it, type World } from '../harness';
import { expectRefusal, type SmallModel, smallModel } from '../model';

// The two kinds of capability link follow the same pair of rules, so they
// are tested by the same pair of tests: INV-11 and INV-12 for information
// objects, INV-14 and INV-15 for actors.
const links = [
  {
    what: 'an information object',
    sameEnterprise: 'INV-11',
    oneOpen: 'INV-12',
    index: 'capability_information_one_open_per_pair_idx',
    table: schema.capabilityInformation,
    row: (m: SmallModel) => ({
      capabilityId: m.capability.id,
      informationObjectId: m.informationObject.id,
    }),
    link: (world: World, m: SmallModel, capabilityId: string, validTo?: string) =>
      world.informationObjects.link(m.enterprise.owner, {
        capabilityId,
        informationObjectId: m.informationObject.id,
        validFrom: '2020-01-01',
        validTo,
      }),
    unlink: (world: World, m: SmallModel, linkId: string) =>
      world.informationObjects.unlink(m.enterprise.owner, linkId),
  },
  {
    what: 'an actor',
    sameEnterprise: 'INV-14',
    oneOpen: 'INV-15',
    index: 'capability_actors_one_open_per_pair_idx',
    table: schema.capabilityActors,
    row: (m: SmallModel) => ({ capabilityId: m.capability.id, actorId: m.actor.id }),
    link: (world: World, m: SmallModel, capabilityId: string, validTo?: string) =>
      world.actors.link(m.enterprise.owner, {
        capabilityId,
        actorId: m.actor.id,
        validFrom: '2020-01-01',
        validTo,
      }),
    unlink: (world: World, m: SmallModel, linkId: string) =>
      world.actors.unlink(m.enterprise.owner, linkId),
  },
];

describe.for(links)('a capability linked to $what', (kind) => {
  it(`${kind.sameEnterprise}: both ends belong to the same enterprise`, async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    // The same person owns both enterprises: each id is one they may use,
    // and only the pair is wrong.
    const elsewhere = await world.enterprise(m.enterprise.owner);
    const foreign = await world.capabilities.create(m.enterprise.owner, {
      enterpriseId: elsewhere.id,
      name: 'Sell',
    });

    await expectRefusal(
      kind.link(world, m, foreign.id),
      BadRequestException,
      /must belong to the same enterprise/,
    );
    const linked = await kind.link(world, m, m.capability.id);
    expect(linked.capabilities.map((c) => c.capabilityId)).toEqual([m.capability.id]);
  });

  it(`${kind.oneOpen}: a capability has at most one open link to it`, async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const openLinks = (links: Array<{ linkId: string; validTo?: string | null }>) =>
      links.filter((l) => !l.validTo);

    // A closed link is history and stands beside the open one.
    await kind.link(world, m, m.capability.id, '2026-01-01');
    const linked = await kind.link(world, m, m.capability.id);
    expect(linked.capabilities).toHaveLength(2);

    await expectRefusal(
      kind.link(world, m, m.capability.id),
      BadRequestException,
      /already has an open link/,
    );

    // With the open link gone, the next one is welcome.
    const [open] = openLinks(linked.capabilities);
    if (!open) throw new Error('fixture');
    expect(await kind.unlink(world, m, open.linkId)).toBe(true);
    const relinked = await kind.link(world, m, m.capability.id);
    expect(openLinks(relinked.capabilities)).toHaveLength(1);
  });

  it(`${kind.oneOpen}: is refused by Postgres, whatever wrote the row`, async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const insert = (validTo: string | null) =>
      world.constraintViolatedBy((db) =>
        db.insert(kind.table).values({ ...kind.row(m), validTo } as never),
      );

    expect(await insert(null)).toBeNull();
    expect(await insert(null)).toBe(kind.index);
    expect(await insert('2026-01-01')).toBeNull();
  });
});

describe('INV-13: only a team actor points at an organization unit, and at one of its own enterprise', () => {
  it('refuses an organization unit on an actor that is not a team, new or edited', async ({
    world,
  }) => {
    const { enterprise, actor, organizationUnitId } = await smallModel(
      world,
      await world.enterprise(),
    );
    const input = (kind: ActorKind) => ({
      enterpriseId: enterprise.id,
      kind,
      name: 'Sales',
      organizationUnitId,
    });
    const message = /organizationUnitId applies only to actors of kind "team"/;

    for (const kind of [ActorKind.ROLE, ActorKind.INDIVIDUAL, ActorKind.EXTERNAL]) {
      await expectRefusal(
        world.actors.create(enterprise.owner, input(kind)),
        BadRequestException,
        message,
      );
    }
    await expectRefusal(
      world.actors.update(enterprise.owner, actor.id, input(ActorKind.ROLE)),
      BadRequestException,
      message,
    );

    const team = await world.actors.create(enterprise.owner, input(ActorKind.TEAM));
    expect(team.organizationUnitId).toBe(organizationUnitId);
  });

  it("refuses a team pointing at another enterprise's organization unit", async ({ world }) => {
    const enterprise = await world.enterprise();
    const elsewhere = await world.enterprise(enterprise.owner);
    const foreignUnit = await world.organizationUnit(elsewhere.id);

    await expectRefusal(
      world.actors.create(enterprise.owner, {
        enterpriseId: enterprise.id,
        kind: ActorKind.TEAM,
        name: 'Sales',
        organizationUnitId: foreignUnit,
      }),
      BadRequestException,
      /An actor and its organization unit must belong to the same enterprise/,
    );
  });

  it('is refused by Postgres on both counts, whatever wrote the row', async ({ world }) => {
    const { enterprise, actor, organizationUnitId } = await smallModel(
      world,
      await world.enterprise(),
    );
    const elsewhere = await world.enterprise(enterprise.owner);
    const foreignUnit = await world.organizationUnit(elsewhere.id);
    const set = (kind: 'role' | 'team', unitId: string) =>
      world.constraintViolatedBy((db) =>
        db
          .update(schema.actors)
          .set({ kind, organizationUnitId: unitId })
          .where(eq(schema.actors.id, actor.id)),
      );

    expect(await set('role', organizationUnitId)).toBe(
      'actors_organization_unit_only_for_team_check',
    );
    expect(await set('team', foreignUnit)).toBe('actors_organization_unit_same_enterprise_fk');
    expect(await set('team', organizationUnitId)).toBeNull();
  });
});
