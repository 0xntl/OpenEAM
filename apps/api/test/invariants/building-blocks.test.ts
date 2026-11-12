import { BadRequestException } from '@nestjs/common';
import { eq, schema } from '@openeam/db';
import {
  ArchitectureLevel,
  BuildingBlockKind,
  BuildingBlockRelationshipType,
} from '../../src/building-blocks/building-block.model';
import { describe, expect, it } from '../harness';
import { blockInput, expectRefusal, smallModel } from '../model';

describe('INV-2: a building block belongs to at least one architecture domain', () => {
  it('refuses a building block without a domain, new or edited', async ({ world }) => {
    const enterprise = await world.enterprise();
    const message = /at least one architecture domain/;

    await expectRefusal(
      world.buildingBlocks.create(
        enterprise.owner,
        blockInput(enterprise, { architectureDomainIds: [] }),
      ),
      BadRequestException,
      message,
    );

    const block = await world.buildingBlocks.create(enterprise.owner, blockInput(enterprise));
    await expectRefusal(
      world.buildingBlocks.update(
        enterprise.owner,
        block.id,
        blockInput(enterprise, { architectureDomainIds: [] }),
      ),
      BadRequestException,
      message,
    );
    const after = await world.buildingBlocks.findOne(enterprise.owner, block.id);
    expect(after?.architectureDomainIds).toEqual(block.architectureDomainIds);
  });
});

describe('INV-3: architectureLevel applies only to architecture building blocks', () => {
  it('refuses a level on a solution building block, new or edited', async ({ world }) => {
    const enterprise = await world.enterprise();
    const withLevel = (kind: BuildingBlockKind) =>
      blockInput(enterprise, { kind, architectureLevel: ArchitectureLevel.SEGMENT });
    const message = /architectureLevel only applies to architecture building blocks/;

    await expectRefusal(
      world.buildingBlocks.create(enterprise.owner, withLevel(BuildingBlockKind.SOLUTION)),
      BadRequestException,
      message,
    );
    const abb = await world.buildingBlocks.create(
      enterprise.owner,
      withLevel(BuildingBlockKind.ARCHITECTURE),
    );
    expect(abb).toMatchObject({ kind: 'architecture', architectureLevel: 'segment' });
    await expectRefusal(
      world.buildingBlocks.update(enterprise.owner, abb.id, withLevel(BuildingBlockKind.SOLUTION)),
      BadRequestException,
      message,
    );
  });

  it('drops the level when an architecture building block becomes a solution one', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const abb = await world.buildingBlocks.create(
      enterprise.owner,
      blockInput(enterprise, {
        kind: BuildingBlockKind.ARCHITECTURE,
        architectureLevel: ArchitectureLevel.STRATEGIC,
      }),
    );

    const sbb = await world.buildingBlocks.update(
      enterprise.owner,
      abb.id,
      blockInput(enterprise, { kind: BuildingBlockKind.SOLUTION }),
    );

    expect(sbb.kind).toBe('solution');
    // The stored row: a solution block's type has no such field to read.
    const row = await world.db.query.buildingBlocks.findFirst({
      where: (t, { eq: equals }) => equals(t.id, abb.id),
    });
    expect(row).toMatchObject({ kind: 'solution', architectureLevel: null });
  });

  it('is refused by Postgres, whatever wrote the row', async ({ world }) => {
    const { sbb, abb } = await smallModel(world, await world.enterprise());
    const setLevel = (id: string) =>
      world.constraintViolatedBy((db) =>
        db
          .update(schema.buildingBlocks)
          .set({ architectureLevel: 'strategic' })
          .where(eq(schema.buildingBlocks.id, id)),
      );

    expect(await setLevel(sbb.id)).toBe('building_blocks_level_only_for_architecture_check');
    expect(await setLevel(abb.id)).toBeNull();
  });
});

describe('INV-4: a building block cannot relate to itself', () => {
  it('refuses a relationship from a block to itself', async ({ world }) => {
    const { enterprise, abb, sbb } = await smallModel(world, await world.enterprise());
    const relate = (targetBuildingBlockId: string) =>
      world.buildingBlocks.createRelationship(enterprise.owner, {
        sourceBuildingBlockId: sbb.id,
        targetBuildingBlockId,
        type: BuildingBlockRelationshipType.DEPENDS_ON,
      });

    await expectRefusal(relate(sbb.id), BadRequestException, /cannot relate to itself/);
    await expect(relate(abb.id)).resolves.toMatchObject({ targetBuildingBlockId: abb.id });
  });

  it('is refused by Postgres, whatever wrote the row', async ({ world }) => {
    const { abb, sbb } = await smallModel(world, await world.enterprise());
    const insert = (targetBuildingBlockId: string) =>
      world.constraintViolatedBy((db) =>
        db
          .insert(schema.buildingBlockRelationships)
          .values({ sourceBuildingBlockId: sbb.id, targetBuildingBlockId }),
      );

    expect(await insert(sbb.id)).toBe('building_block_relationships_no_self_check');
    expect(await insert(abb.id)).toBeNull();
  });
});

// As ARCHITECTURE.md says of this rule: only a second *open* edge is refused.
// Overlap between bounded intervals is not checked, and is not tested here.
describe('INV-5: a block has at most one open hosted_on edge', () => {
  it('refuses a second open hosted_on edge from the same block', async ({ world }) => {
    const enterprise = await world.enterprise();
    const { owner } = enterprise;
    // One after the other: the test's transaction is a single connection.
    const block = (name: string) =>
      world.buildingBlocks.create(owner, blockInput(enterprise, { name }));
    const app = await block('App');
    const oldHost = await block('Old host');
    const newHost = await block('New host');
    const otherApp = await block('Other app');
    const relate = (
      source: { id: string },
      target: { id: string },
      type: BuildingBlockRelationshipType,
      validTo?: string,
    ) =>
      world.buildingBlocks.createRelationship(owner, {
        sourceBuildingBlockId: source.id,
        targetBuildingBlockId: target.id,
        type,
        validFrom: '2020-01-01',
        validTo,
      });
    const { HOSTED_ON, DEPENDS_ON } = BuildingBlockRelationshipType;

    // A closed edge is history and stands beside the open one.
    await relate(app, oldHost, HOSTED_ON, '2026-01-01');
    await relate(app, newHost, HOSTED_ON);

    await expectRefusal(
      relate(app, oldHost, HOSTED_ON),
      BadRequestException,
      /already has an active hosted_on relationship/,
    );

    // The limit is per hosted block and for hosted_on only.
    await expect(relate(otherApp, newHost, HOSTED_ON)).resolves.toBeDefined();
    await expect(relate(app, oldHost, DEPENDS_ON)).resolves.toBeDefined();
    await expect(relate(app, newHost, DEPENDS_ON)).resolves.toBeDefined();
  });

  it('is refused by Postgres, whatever wrote the row', async ({ world }) => {
    const { abb, sbb } = await smallModel(world, await world.enterprise());
    const insert = (type: 'hosted_on' | 'depends_on') =>
      world.constraintViolatedBy((db) =>
        db
          .insert(schema.buildingBlockRelationships)
          .values({ sourceBuildingBlockId: sbb.id, targetBuildingBlockId: abb.id, type }),
      );

    expect(await insert('hosted_on')).toBeNull();
    expect(await insert('hosted_on')).toBe('building_block_relationships_one_open_host_idx');
    expect(await insert('depends_on')).toBeNull();
  });
});

describe('INV-8: domain and organization-unit assignment are replace-all sets without validity', () => {
  it('replaces both sets with what an edit sends, and writes no interval', async ({ world }) => {
    const enterprise = await world.enterprise();
    const [firstDomain, secondDomain, thirdDomain] = enterprise.domainIds;
    if (!firstDomain || !secondDomain || !thirdDomain) throw new Error('fixture');
    const firstUnit = await world.organizationUnit(enterprise.id);
    const secondUnit = await world.organizationUnit(enterprise.id);

    const block = await world.buildingBlocks.create(
      enterprise.owner,
      blockInput(enterprise, {
        architectureDomainIds: [firstDomain, secondDomain],
        organizationUnitIds: [firstUnit],
      }),
    );
    expect([...block.architectureDomainIds].sort()).toEqual([firstDomain, secondDomain].sort());
    // A dated assignment, as only an imported bundle can carry one.
    await world.db
      .update(schema.buildingBlockOrganizationUnits)
      .set({ validFrom: '2024-01-01', validTo: '2025-01-01' })
      .where(eq(schema.buildingBlockOrganizationUnits.buildingBlockId, block.id));

    const edited = await world.buildingBlocks.update(
      enterprise.owner,
      block.id,
      blockInput(enterprise, {
        architectureDomainIds: [thirdDomain],
        organizationUnitIds: [secondUnit],
      }),
    );

    expect(edited.architectureDomainIds).toEqual([thirdDomain]);
    expect(edited.organizationUnitLinks).toEqual([
      expect.objectContaining({ organizationUnitId: secondUnit, validFrom: null, validTo: null }),
    ]);
  });
});
