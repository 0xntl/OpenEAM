import { BadRequestException } from '@nestjs/common';
import { schema } from '@openeam/db';
import { ActorKind } from '../../src/actors/actor.model';
import { BuildingBlockRelationshipType } from '../../src/building-blocks/building-block.model';
import { describe, expect, it } from '../harness';
import { blockInput, expectRefusal, smallModel } from '../model';

// In every test here one person owns both enterprises. Membership (INV-16)
// is then not what refuses anything: each id is one the caller may use, and
// what is left is the rule that rows of two enterprises do not mix.
describe('INV-9: every row belongs to exactly one enterprise, and nothing is shared between two', () => {
  it("refuses a building block classified or assigned with another enterprise's rows", async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const elsewhere = await world.enterprise(enterprise.owner);
    const ownUnit = await world.organizationUnit(enterprise.id);
    const foreignUnit = await world.organizationUnit(elsewhere.id);
    const create = (overrides: Parameters<typeof blockInput>[1]) =>
      world.buildingBlocks.create(enterprise.owner, blockInput(enterprise, overrides));

    await expectRefusal(
      create({ architectureDomainIds: [...enterprise.domainIds, ...elsewhere.domainIds] }),
      BadRequestException,
      /Every architecture domain must belong to this enterprise/,
    );
    await expectRefusal(
      create({ organizationUnitIds: [ownUnit, foreignUnit] }),
      BadRequestException,
      /Every organization unit must belong to this enterprise/,
    );

    const block = await create({ organizationUnitIds: [ownUnit] });
    await expectRefusal(
      world.buildingBlocks.update(
        enterprise.owner,
        block.id,
        blockInput(enterprise, { architectureDomainIds: elsewhere.domainIds }),
      ),
      BadRequestException,
      /Every architecture domain must belong to this enterprise/,
    );
  });

  it('refuses a relationship between building blocks of two enterprises', async ({ world }) => {
    const here = await smallModel(world, await world.enterprise());
    const elsewhere = await world.enterprise(here.enterprise.owner);
    const foreign = await world.buildingBlocks.create(elsewhere.owner, blockInput(elsewhere));
    const relate = (targetBuildingBlockId: string) =>
      world.buildingBlocks.createRelationship(here.enterprise.owner, {
        sourceBuildingBlockId: here.sbb.id,
        targetBuildingBlockId,
        type: BuildingBlockRelationshipType.DATA_FLOW,
      });

    await expectRefusal(
      relate(foreign.id),
      BadRequestException,
      /Related building blocks must belong to the same enterprise/,
    );
    await expect(relate(here.abb.id)).resolves.toBeDefined();
  });

  it("refuses a value stream stage that names another enterprise's capability", async ({
    world,
  }) => {
    const here = await smallModel(world, await world.enterprise());
    const { owner } = here.enterprise;
    const elsewhere = await world.enterprise(owner);
    const foreign = await world.capabilities.create(owner, {
      enterpriseId: elsewhere.id,
      name: 'Sell',
    });
    const stream = (capabilityIds: string[]) => ({
      enterpriseId: here.enterprise.id,
      name: 'Order to cash',
      stages: [{ name: 'Order', capabilityIds }],
    });
    const message = /Every capability must belong to this enterprise/;

    await expectRefusal(
      world.valueStreams.create(owner, stream([here.capability.id, foreign.id])),
      BadRequestException,
      message,
    );
    await expectRefusal(
      world.valueStreams.update(owner, here.valueStream.id, stream([foreign.id])),
      BadRequestException,
      message,
    );
    await expect(
      world.valueStreams.update(owner, here.valueStream.id, stream([here.capability.id])),
    ).resolves.toBeDefined();
  });

  it('keeps a row in its enterprise when an edit names another one', async ({ world }) => {
    const here = await smallModel(world, await world.enterprise());
    const { owner, id: home } = here.enterprise;
    const elsewhere = await world.enterprise(owner);
    const enterpriseId = elsewhere.id;

    // Thunks, run one after the other: the test's transaction is one connection.
    const edits = {
      'building block': () =>
        world.buildingBlocks.update(owner, here.sbb.id, {
          ...blockInput(here.enterprise),
          enterpriseId,
        }),
      capability: () =>
        world.capabilities.update(owner, here.capability.id, {
          enterpriseId,
          name: 'Sell',
        }),
      'information object': () =>
        world.informationObjects.update(owner, here.informationObject.id, {
          enterpriseId,
          name: 'Order',
        }),
      actor: () =>
        world.actors.update(owner, here.actor.id, {
          enterpriseId,
          kind: ActorKind.ROLE,
          name: 'Sales clerk',
        }),
      'value stream': () =>
        world.valueStreams.update(owner, here.valueStream.id, {
          enterpriseId,
          name: 'Order to cash',
          stages: [],
        }),
    };

    for (const [what, edit] of Object.entries(edits)) {
      expect((await edit()).enterpriseId, what).toBe(home);
    }
  });
});

describe('INV-10: ids are globally unique, not unique per enterprise', () => {
  it("is refused by Postgres when another enterprise's id is reused", async ({ world }) => {
    const here = await smallModel(world, await world.enterprise());
    const elsewhere = await world.enterprise();
    const insertBlock = (id: string | undefined) =>
      world.constraintViolatedBy((db) =>
        db
          .insert(schema.buildingBlocks)
          .values({ id, enterpriseId: elsewhere.id, kind: 'solution', name: 'Same id' }),
      );

    expect(await insertBlock(here.sbb.id)).toBe('building_blocks_pkey');
    expect(await insertBlock(undefined)).toBeNull();
  });
});
