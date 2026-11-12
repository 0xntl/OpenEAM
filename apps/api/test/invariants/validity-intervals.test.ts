import { BadRequestException } from '@nestjs/common';
import { schema } from '@openeam/db';
import { BuildingBlockRelationshipType } from '../../src/building-blocks/building-block.model';
import { describe, expect, it, type World } from '../harness';
import { blockInput, expectRefusal, type SmallModel, smallModel } from '../model';

describe('INV-1: validity intervals are half-open — validFrom inclusive, validTo exclusive, null unbounded', () => {
  it('shows a building block from its validFrom up to, but not on, its validTo', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const create = (validFrom: string | null, validTo: string | null) =>
      world.buildingBlocks.create(enterprise.owner, blockInput(enterprise, { validFrom, validTo }));
    const bounded = await create('2026-03-01', '2026-09-01');
    const openEnded = await create('2026-03-01', null);
    const openStart = await create(null, '2026-09-01');
    const unbounded = await create(null, null);

    const visibleOn = async (asOf: string) => {
      const landscape = await world.buildingBlocks.solutionsLandscape(enterprise.owner, {
        enterpriseId: enterprise.id,
        asOf,
      });
      return landscape.map((block) => block.id).sort();
    };
    const ids = (...blocks: Array<{ id: string }>) => blocks.map((block) => block.id).sort();

    expect(await visibleOn('2026-02-28')).toEqual(ids(openStart, unbounded));
    // The first day counts …
    expect(await visibleOn('2026-03-01')).toEqual(ids(bounded, openEnded, openStart, unbounded));
    expect(await visibleOn('2026-08-31')).toEqual(ids(bounded, openEnded, openStart, unbounded));
    // … the validTo day does not.
    expect(await visibleOn('2026-09-01')).toEqual(ids(openEnded, unbounded));
  });

  it('shows a relationship between two blocks by the same rule', async ({ world }) => {
    const { enterprise, abb, sbb } = await smallModel(world, await world.enterprise());
    await world.buildingBlocks.createRelationship(enterprise.owner, {
      sourceBuildingBlockId: sbb.id,
      targetBuildingBlockId: abb.id,
      type: BuildingBlockRelationshipType.DEPENDS_ON,
      validFrom: '2026-03-01',
      validTo: '2026-09-01',
    });

    const relationshipsOn = async (asOf: string) => {
      const landscape = await world.buildingBlocks.solutionsLandscape(enterprise.owner, {
        enterpriseId: enterprise.id,
        asOf,
      });
      return landscape.find((block) => block.id === sbb.id)?.outgoingRelationships.length;
    };

    expect(await relationshipsOn('2026-02-28')).toBe(0);
    expect(await relationshipsOn('2026-03-01')).toBe(1);
    expect(await relationshipsOn('2026-08-31')).toBe(1);
    expect(await relationshipsOn('2026-09-01')).toBe(0);
  });

  // Every service call that takes an interval. Each gets a fresh model.
  const writes: Array<
    [string, (world: World, model: SmallModel, from: string, to: string) => Promise<unknown>]
  > = [
    [
      'a new building block',
      (world, { enterprise }, validFrom, validTo) =>
        world.buildingBlocks.create(
          enterprise.owner,
          blockInput(enterprise, { validFrom, validTo }),
        ),
    ],
    [
      'an edited building block',
      (world, { enterprise, sbb }, validFrom, validTo) =>
        world.buildingBlocks.update(
          enterprise.owner,
          sbb.id,
          blockInput(enterprise, { validFrom, validTo }),
        ),
    ],
    [
      'a relationship between building blocks',
      (world, { enterprise, abb, sbb }, validFrom, validTo) =>
        world.buildingBlocks.createRelationship(enterprise.owner, {
          sourceBuildingBlockId: sbb.id,
          targetBuildingBlockId: abb.id,
          type: BuildingBlockRelationshipType.DATA_FLOW,
          validFrom,
          validTo,
        }),
    ],
    [
      'a capability–information link',
      (world, { enterprise, capability, informationObject }, validFrom, validTo) =>
        world.informationObjects.link(enterprise.owner, {
          capabilityId: capability.id,
          informationObjectId: informationObject.id,
          validFrom,
          validTo,
        }),
    ],
    [
      'a capability–actor link',
      (world, { enterprise, capability, actor }, validFrom, validTo) =>
        world.actors.link(enterprise.owner, {
          capabilityId: capability.id,
          actorId: actor.id,
          validFrom,
          validTo,
        }),
    ],
  ];

  it.for(writes)('refuses an empty or backwards interval on %s', async ([, write], { world }) => {
    const model = await smallModel(world, await world.enterprise());
    const message = /validFrom must be earlier than validTo/;

    await expectRefusal(
      write(world, model, '2026-05-01', '2026-05-01'),
      BadRequestException,
      message,
    );
    await expectRefusal(
      write(world, model, '2026-05-02', '2026-05-01'),
      BadRequestException,
      message,
    );
    // One day is the shortest interval there is.
    await expect(write(world, model, '2026-05-01', '2026-05-02')).resolves.toBeDefined();
  });

  it('is refused by Postgres on all seven temporal tables, whatever wrote the row', async ({
    world,
  }) => {
    const m = await smallModel(world, await world.enterprise());
    const tables = [
      [
        'building_blocks',
        schema.buildingBlocks,
        { enterpriseId: m.enterprise.id, kind: 'solution', name: 'Dated' },
      ],
      [
        'building_block_organization_units',
        schema.buildingBlockOrganizationUnits,
        { buildingBlockId: m.sbb.id, organizationUnitId: m.organizationUnitId },
      ],
      [
        'building_block_realizations',
        schema.buildingBlockRealizations,
        { architectureBuildingBlockId: m.abb.id, solutionBuildingBlockId: m.sbb.id },
      ],
      [
        'building_block_capabilities',
        schema.buildingBlockCapabilities,
        { buildingBlockId: m.sbb.id, capabilityId: m.capability.id },
      ],
      [
        'building_block_relationships',
        schema.buildingBlockRelationships,
        { sourceBuildingBlockId: m.sbb.id, targetBuildingBlockId: m.abb.id },
      ],
      [
        'capability_information',
        schema.capabilityInformation,
        { capabilityId: m.capability.id, informationObjectId: m.informationObject.id },
      ],
      [
        'capability_actors',
        schema.capabilityActors,
        { capabilityId: m.capability.id, actorId: m.actor.id },
      ],
    ] as const;

    for (const [name, table, row] of tables) {
      const insert = (validFrom: string, validTo: string) =>
        world.constraintViolatedBy((db) =>
          // The seven tables share nothing but the two columns under test.
          db.insert(table).values({ ...row, validFrom, validTo } as never),
        );
      expect(await insert('2026-05-01', '2026-05-01'), name).toBe(`${name}_validity_check`);
      expect(await insert('2026-05-02', '2026-05-01'), name).toBe(`${name}_validity_check`);
      expect(await insert('2026-05-01', '2026-05-02'), name).toBeNull();
    }
  });
});
