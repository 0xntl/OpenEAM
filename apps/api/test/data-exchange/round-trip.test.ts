// Export and import, the path a model is backed up, moved and restored by
// (D-16, D-24). Every test here goes through the endpoints' own code; see
// `exchange()` in ../bundles.ts for what that includes.
import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { schema } from '@openeam/db';
import { CURRENT_FORMAT_VERSION } from '../../src/data-exchange/data-bundle.format';
import {
  example,
  exampleNames,
  exchange,
  overTheWire,
  tablesOf,
  withoutTimeOfExport,
} from '../bundles';
import { describe, expect, it, type World } from '../harness';
import { expectRefusal, smallModel } from '../model';

// The seeded examples carry the ids of the files these tests import, so an
// import "into an empty instance" starts by making it one. Rolled back with
// everything else.
const emptyInstance = (world: World) => world.db.delete(schema.enterprises);

describe('a bundle survives export, import and export again', () => {
  it.for(exampleNames())('examples/%s, into an empty instance', async (name, { world }) => {
    const file = example(name);
    const endpoint = exchange(world);
    const importer = await world.account();
    await emptyInstance(world);

    await endpoint.import(importer, file);
    const first = await endpoint.export(importer);

    // The export holds what the file holds: every row of every table, with
    // every field the file spells out.
    expect(first.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(first.generator?.name).toBe('openeam');
    for (const [table, rows] of tablesOf(first)) {
      const written = (file[table] ?? []) as object[];
      expect(rows, table).toHaveLength(written.length);
      expect(rows, table).toEqual(
        expect.arrayContaining(written.map((row) => expect.objectContaining(row))),
      );
    }
    expect(first.buildingBlocks.length).toBeGreaterThan(0);

    await emptyInstance(world);
    const restorer = await world.account();
    expect((await endpoint.export(restorer)).enterprises).toEqual([]);
    await endpoint.import(restorer, overTheWire(first));
    const second = await endpoint.export(restorer);

    // Identical, down to the order of rows and the timestamps of each.
    expect(withoutTimeOfExport(second)).toEqual(withoutTimeOfExport(first));
    expect(JSON.stringify(withoutTimeOfExport(second))).toBe(
      JSON.stringify(withoutTimeOfExport(first)),
    );
  });

  it('every example beside the others, in one instance', async ({ world }) => {
    const endpoint = exchange(world);
    const importer = await world.account();
    await emptyInstance(world);

    for (const name of exampleNames()) await endpoint.import(importer, example(name));

    const exported = await endpoint.export(importer);
    expect(exported.enterprises).toHaveLength(exampleNames().length);
  });
});

describe('the bundle format version (D-24)', () => {
  it('reads a bundle written before the version field existed', async ({ world }) => {
    const { formatVersion: _, ...versionZero } = example('household.json');
    const endpoint = exchange(world);
    const importer = await world.account();
    await emptyInstance(world);

    await endpoint.import(importer, versionZero);

    const exported = await endpoint.export(importer);
    expect(exported.formatVersion).toBe(CURRENT_FORMAT_VERSION);
    expect(exported.enterprises).toEqual([
      expect.objectContaining((versionZero.enterprises as object[])[0]),
    ]);
    expect(exported.buildingBlocks).toHaveLength((versionZero.buildingBlocks as object[]).length);
  });

  it('refuses a bundle from a newer version, naming both, and writes nothing', async ({
    world,
  }) => {
    const endpoint = exchange(world);
    const importer = await world.account();
    await emptyInstance(world);
    const newer = { ...example('household.json'), formatVersion: CURRENT_FORMAT_VERSION + 1 };

    await expectRefusal(
      endpoint.import(importer, newer),
      HttpException,
      new RegExp(
        `format version ${CURRENT_FORMAT_VERSION + 1}, written by a newer OpenEAM; this instance reads up to version ${CURRENT_FORMAT_VERSION}`,
      ),
    );
    expect(await world.db.query.enterprises.findMany()).toEqual([]);
  });

  const malformed: Array<[what: string, body: unknown, message: RegExp]> = [
    ['a list', [example('household.json')], /A data bundle is a JSON object/],
    ['text', 'household', /A data bundle is a JSON object/],
    [
      'a version that is not a number',
      { ...example('household.json'), formatVersion: '1' },
      /formatVersion must be a non-negative integer/,
    ],
    [
      'a negative version',
      { ...example('household.json'), formatVersion: -1 },
      /formatVersion must be a non-negative integer/,
    ],
    ['no enterprises', { formatVersion: CURRENT_FORMAT_VERSION }, /Invalid data bundle/],
    [
      'an id that is not a UUID',
      {
        formatVersion: CURRENT_FORMAT_VERSION,
        enterprises: [{ id: 'household', name: 'Household', description: null }],
      },
      /Invalid data bundle/,
    ],
  ];

  it.for(malformed)('refuses %s', async ([, body, message], { world }) => {
    const before = await world.db.query.enterprises.findMany();

    await expectRefusal(
      exchange(world).import(await world.account(), body),
      HttpException,
      message,
    );
    expect(await world.db.query.enterprises.findMany()).toEqual(before);
  });
});

describe('import replaces the enterprises in the bundle and nothing else', () => {
  it("gives a member only their own enterprises' model, with another one beside it", async ({
    world,
  }) => {
    const mine = await smallModel(world, await world.enterprise());
    const theirs = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);

    const exported = await endpoint.export(mine.enterprise.owner);

    expect(exported.enterprises.map((e) => e.id)).toEqual([mine.enterprise.id]);
    const text = JSON.stringify(exported);
    expect(text).toContain(mine.sbb.id);
    for (const row of [theirs.enterprise, theirs.sbb, theirs.capability, theirs.actor]) {
      expect(text).not.toContain(row.id);
    }
  });

  it('leaves every other enterprise exactly as it was', async ({ world }) => {
    const mine = await smallModel(world, await world.enterprise());
    const theirs = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    const theirsBefore = withoutTimeOfExport(await endpoint.export(theirs.enterprise.owner));

    const bundle = await endpoint.export(mine.enterprise.owner);
    // The model has moved on since the export; the import puts it back.
    await world.buildingBlocks.delete(mine.enterprise.owner, mine.sbb.id);
    await endpoint.import(mine.enterprise.owner, overTheWire(bundle));

    expect(withoutTimeOfExport(await endpoint.export(mine.enterprise.owner))).toEqual(
      withoutTimeOfExport(bundle),
    );
    expect(withoutTimeOfExport(await endpoint.export(theirs.enterprise.owner))).toEqual(
      theirsBefore,
    );
  });

  it('keeps who had access, and makes whoever imports a new enterprise its owner', async ({
    world,
  }) => {
    const { enterprise } = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    await world.member(enterprise, 'editor');
    await world.member(enterprise, 'viewer');
    const membersBefore = await world.enterprises.members(enterprise.owner, enterprise.id);
    const bundle = overTheWire(await endpoint.export(enterprise.owner));

    await endpoint.import(enterprise.owner, bundle);
    expect(await world.enterprises.members(enterprise.owner, enterprise.id)).toEqual(membersBefore);

    // The same bundle on an instance that does not have the enterprise.
    await emptyInstance(world);
    const newcomer = await world.account();
    await endpoint.import(newcomer, bundle);
    const afterwards = await world.nextRequest(newcomer);
    expect(afterwards.memberships).toEqual({ [enterprise.id]: 'owner' });
  });

  it('refuses a bundle that reuses ids of another enterprise, by table and id, and rolls back (INV-10)', async ({
    world,
  }) => {
    const theirs = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    const theirsBefore = withoutTimeOfExport(await endpoint.export(theirs.enterprise.owner));
    // Their model under a new enterprise id: a different enterprise, the
    // same row ids.
    const cloneId = randomUUID();
    const clone = JSON.parse(
      JSON.stringify(theirsBefore).replaceAll(theirs.enterprise.id, cloneId),
    ) as object;
    const importer = await world.account();

    const outcome = await endpoint.import(importer, clone).then(
      () => 'it went through',
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(BadRequestException);
    expect((outcome as BadRequestException).getResponse()).toMatchObject({
      message: 'The bundle reuses ids that already exist in another enterprise',
      issues: expect.arrayContaining([
        { table: 'buildingBlocks', id: theirs.sbb.id, message: expect.any(String) },
        { table: 'businessCapabilities', id: theirs.capability.id, message: expect.any(String) },
      ]),
    });
    // Rolled back whole: the clone is not there, the original is untouched.
    expect(
      await world.db.query.enterprises.findFirst({ where: (t, { eq }) => eq(t.id, cloneId) }),
    ).toBeUndefined();
    expect(withoutTimeOfExport(await endpoint.export(theirs.enterprise.owner))).toEqual(
      theirsBefore,
    );
  });

  it('refuses replacing an enterprise the importer is not an owner of', async ({ world }) => {
    const { enterprise } = await smallModel(world, await world.enterprise());
    const endpoint = exchange(world);
    const bundle = overTheWire(await endpoint.export(enterprise.owner));
    const editor = await world.member(enterprise, 'editor');
    const outsider = (await world.enterprise()).owner;

    await expectRefusal(
      endpoint.import(editor, bundle),
      ForbiddenException,
      /Only an owner can replace an enterprise from a bundle/,
    );
    await expectRefusal(
      endpoint.import(outsider, bundle),
      ForbiddenException,
      /exists and you are not a member of it/,
    );
  });
});
