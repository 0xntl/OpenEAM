import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ActorKind } from '../../src/actors/actor.model';
import type { Principal } from '../../src/auth/principal';
import { BuildingBlockRelationshipType } from '../../src/building-blocks/building-block.model';
import { EnterpriseRole } from '../../src/enterprises/enterprise.model';
import { describe, expect, it, type World } from '../harness';
import { blockInput, diagram, expectRefusal, type SmallModel, smallModel } from '../model';

type Call = [what: string, call: (who: Principal) => Promise<unknown>];

// Some services check access before they return a promise and so throw
// rather than reject; a caller awaiting them cannot tell, and neither
// should these tests.
const calls = (list: Call[]): Call[] =>
  list.map(([what, call]) => [what, async (who) => call(who)]);

// Every read the services offer, of the model in `m`.
function reads(world: World, m: SmallModel): { lists: Call[]; byId: Call[] } {
  const id = m.enterprise.id;
  const [domainId] = m.enterprise.domainIds;
  if (!domainId) throw new Error('fixture');
  return {
    lists: calls([
      ['members', (who) => world.enterprises.members(who, id)],
      ['architecture domains', (who) => world.architectureDomains.findAll(who, id)],
      ['organization units', (who) => world.organizationUnits.findAll(who, id)],
      ['building blocks', (who) => world.buildingBlocks.findAll(who, id)],
      [
        'architecture landscape',
        (who) => world.buildingBlocks.architectureLandscape(who, { enterpriseId: id }),
      ],
      [
        'solutions landscape',
        (who) => world.buildingBlocks.solutionsLandscape(who, { enterpriseId: id }),
      ],
      ['capabilities', (who) => world.capabilities.findAll(who, id)],
      ['processes', (who) => world.processes.findAll(who, id)],
      ['information objects', (who) => world.informationObjects.findAll(who, id)],
      ['actors', (who) => world.actors.findAll(who, id)],
      ['value streams', (who) => world.valueStreams.findAll(who, id)],
      ['export', async (who) => (await world.dataExchange.export(who, id)).buildingBlocks],
    ]),
    byId: calls([
      ['enterprise', (who) => world.enterprises.findOne(who, id)],
      ['architecture domain', (who) => world.architectureDomains.findOne(who, domainId)],
      ['organization unit', (who) => world.organizationUnits.findOne(who, m.organizationUnitId)],
      ['building block', (who) => world.buildingBlocks.findOne(who, m.sbb.id)],
      ['capability', (who) => world.capabilities.findOne(who, m.capability.id)],
      ['process', (who) => world.processes.findOne(who, m.process.id)],
      [
        'information object',
        (who) => world.informationObjects.findOne(who, m.informationObject.id),
      ],
      ['actor', (who) => world.actors.findOne(who, m.actor.id)],
      ['value stream', (who) => world.valueStreams.findOne(who, m.valueStream.id)],
    ]),
  };
}

// Every change to a model the services offer, each a valid one for `m`.
// In an order an editor can run from top to bottom: deletions last, links
// before the rows they hang on.
async function modelWrites(world: World, m: SmallModel): Promise<Call[]> {
  const { owner, id: enterpriseId } = m.enterprise;
  const capabilityId = m.capability.id;
  // Something to delete. The links are closed ones, so that opening another
  // is not refused for a reason of its own (INV-12, INV-15).
  const closed = { validFrom: '2020-01-01', validTo: '2021-01-01' };
  const relationship = await world.buildingBlocks.createRelationship(owner, {
    sourceBuildingBlockId: m.sbb.id,
    targetBuildingBlockId: m.abb.id,
    type: BuildingBlockRelationshipType.DEPENDS_ON,
  });
  const information = await world.informationObjects.link(owner, {
    capabilityId,
    informationObjectId: m.informationObject.id,
    ...closed,
  });
  const actor = await world.actors.link(owner, { capabilityId, actorId: m.actor.id, ...closed });
  const informationLinkId = information.capabilities[0]?.linkId;
  const actorLinkId = actor.capabilities[0]?.linkId;
  if (!informationLinkId || !actorLinkId) throw new Error('fixture');

  const block = blockInput(m.enterprise, { name: 'Changed' });
  const named = { enterpriseId, name: 'Changed' };
  const actorInput = { ...named, kind: ActorKind.ROLE };
  const stream = { ...named, stages: [{ name: 'Stage', capabilityIds: [capabilityId] }] };
  const process = { capabilityId, name: 'Changed' };
  return calls([
    ['create building block', (who) => world.buildingBlocks.create(who, block)],
    ['update building block', (who) => world.buildingBlocks.update(who, m.sbb.id, block)],
    [
      'relate building blocks',
      (who) =>
        world.buildingBlocks.createRelationship(who, {
          sourceBuildingBlockId: m.abb.id,
          targetBuildingBlockId: m.sbb.id,
          type: BuildingBlockRelationshipType.DATA_FLOW,
        }),
    ],
    ['create capability', (who) => world.capabilities.create(who, named)],
    ['update capability', (who) => world.capabilities.update(who, capabilityId, named)],
    ['create process', (who) => world.processes.create(who, process)],
    ['update process', (who) => world.processes.update(who, m.process.id, process)],
    [
      'save process diagram',
      (who) => world.processes.updateDiagram(who, m.process.id, diagram('Changed')),
    ],
    ['create information object', (who) => world.informationObjects.create(who, named)],
    [
      'update information object',
      (who) => world.informationObjects.update(who, m.informationObject.id, named),
    ],
    [
      'link information object',
      (who) =>
        world.informationObjects.link(who, {
          capabilityId,
          informationObjectId: m.informationObject.id,
        }),
    ],
    ['create actor', (who) => world.actors.create(who, actorInput)],
    ['update actor', (who) => world.actors.update(who, m.actor.id, actorInput)],
    ['link actor', (who) => world.actors.link(who, { capabilityId, actorId: m.actor.id })],
    ['create value stream', (who) => world.valueStreams.create(who, stream)],
    ['update value stream', (who) => world.valueStreams.update(who, m.valueStream.id, stream)],
    ['unlink information object', (who) => world.informationObjects.unlink(who, informationLinkId)],
    ['unlink actor', (who) => world.actors.unlink(who, actorLinkId)],
    ['delete relationship', (who) => world.buildingBlocks.deleteRelationship(who, relationship.id)],
    ['delete process', (who) => world.processes.delete(who, m.process.id)],
    ['delete value stream', (who) => world.valueStreams.delete(who, m.valueStream.id)],
    ['delete actor', (who) => world.actors.delete(who, m.actor.id)],
    [
      'delete information object',
      (who) => world.informationObjects.delete(who, m.informationObject.id),
    ],
    ['delete building block', (who) => world.buildingBlocks.delete(who, m.sbb.id)],
    ['delete capability', (who) => world.capabilities.delete(who, capabilityId)],
  ]);
}

// The whole model of the enterprise as its owner would export it, for
// "nothing changed" — every table, timestamps included.
async function snapshot(world: World, m: SmallModel) {
  const { exportedAt: _, ...model } = await world.dataExchange.export(
    m.enterprise.owner,
    m.enterprise.id,
  );
  return model;
}

const settled = (call: Promise<unknown>) =>
  call.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

describe('INV-16: a request reads only the enterprises its principal is a member of', () => {
  it('shows a non-member nothing of an enterprise, and a viewer all of it', async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const viewer = await world.member(m.enterprise, 'viewer');
    // Owner of an enterprise of their own, so not merely someone without any.
    const outsider = (await world.enterprise()).owner;
    const { lists, byId } = reads(world, m);

    for (const [what, read] of lists) {
      await expectRefusal(read(outsider), ForbiddenException, /not a member of this enterprise/);
      expect(await read(viewer), what).not.toHaveLength(0);
    }
    for (const [what, read] of byId) {
      // Not found rather than forbidden: an id from elsewhere does not exist.
      expect(await read(outsider), what).toBeUndefined();
      expect(await read(viewer), what).toBeDefined();
    }
  });

  it('leaves other enterprises out of what is listed or exported without naming one', async ({
    world,
  }) => {
    const m = await smallModel(world, await world.enterprise());
    const own = await smallModel(world, await world.enterprise());
    const outsider = own.enterprise.owner;

    const listed = await world.enterprises.findAll(outsider);
    expect(listed.map((e) => e.id)).toEqual([own.enterprise.id]);

    const exported = JSON.stringify(await world.dataExchange.export(outsider));
    expect(exported).toContain(own.sbb.id);
    for (const row of [m.enterprise, m.abb, m.sbb, m.capability, m.process, m.actor]) {
      expect(exported).not.toContain(row.id);
    }
  });
});

describe('INV-16: a request writes only what the member’s role permits', () => {
  it('lets an editor make every change to the model', async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const editor = await world.member(m.enterprise, 'editor');

    for (const [what, write] of await modelWrites(world, m)) {
      // Deletions answer true; everything else returns what it wrote.
      expect(await write(editor), what).toBeTruthy();
    }
  });

  it('refuses a viewer every one of those changes', async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const viewer = await world.member(m.enterprise, 'viewer');
    const writes = await modelWrites(world, m);
    const before = await snapshot(world, m);

    for (const [, write] of writes) {
      await expectRefusal(write(viewer), ForbiddenException, /Viewers cannot change the model/);
    }
    expect(await snapshot(world, m)).toEqual(before);
  });

  it('refuses a non-member every one of those changes, as if the rows did not exist', async ({
    world,
  }) => {
    const m = await smallModel(world, await world.enterprise());
    const outsider = (await world.enterprise()).owner;
    const writes = await modelWrites(world, m);
    const before = await snapshot(world, m);

    // A write that names the enterprise is told so. One that names a row of
    // it is told the row does not exist, never that it is someone else's.
    const namesTheEnterprise = [
      'create building block',
      'create capability',
      'create information object',
      'create actor',
      'create value stream',
    ];

    for (const [what, write] of writes) {
      const outcome = await settled(write(outsider));
      if (namesTheEnterprise.includes(what)) {
        expect('error' in outcome && outcome.error, what).toBeInstanceOf(ForbiddenException);
      } else if ('value' in outcome) {
        // Deleting what cannot be seen deletes nothing.
        expect(outcome.value, what).toBe(false);
      } else if (outcome.error instanceof BadRequestException) {
        // A link, relationship or process naming a row from elsewhere.
        expect(outcome.error.message, what).toMatch(/not found/);
      } else {
        expect(outcome.error, what).toBeInstanceOf(NotFoundException);
      }
    }
    expect(await snapshot(world, m)).toEqual(before);
  });

  it('keeps the enterprise itself, its members and import for owners', async ({ world }) => {
    const m = await smallModel(world, await world.enterprise());
    const { owner, id } = m.enterprise;
    const editor = await world.member(m.enterprise, 'editor');
    const viewer = await world.member(m.enterprise, 'viewer');
    const outsider = (await world.enterprise()).owner;
    const newcomer = await world.account();
    const bundle = await world.dataExchange.export(owner, id);

    // Deleting the enterprise comes last, for the owner's sake.
    const ownerOnly: Array<[...Call, denied: RegExp]> = [
      [
        'rename',
        (who) => world.enterprises.update(who, id, { name: 'Renamed' }),
        /Only an owner can change the enterprise itself/,
      ],
      [
        'add member',
        (who) => world.enterprises.addMember(who, id, newcomer.email, 'viewer'),
        /Only an owner can manage members/,
      ],
      [
        'change a role',
        (who) => world.enterprises.setMemberRole(who, id, viewer.userId, 'editor'),
        /Only an owner can manage members/,
      ],
      [
        'remove someone else',
        (who) => world.enterprises.removeMember(who, id, newcomer.userId),
        /Only an owner can manage members/,
      ],
      [
        'import',
        (who) => world.dataExchange.import(who, bundle),
        /Only an owner can replace an enterprise from a bundle/,
      ],
      [
        'delete',
        (who) => world.enterprises.delete(who, id),
        /Only an owner can delete an enterprise/,
      ],
    ];
    const membersBefore = await world.enterprises.members(owner, id);
    const before = await snapshot(world, m);

    for (const [, attempt, denied] of ownerOnly) {
      await expectRefusal(attempt(editor), ForbiddenException, denied);
      await expectRefusal(attempt(viewer), ForbiddenException, denied);
      await expectRefusal(attempt(outsider), ForbiddenException, /not a member/);
    }
    expect(await world.enterprises.members(owner, id)).toEqual(membersBefore);
    expect(await snapshot(world, m)).toEqual(before);

    for (const [what, attempt] of ownerOnly) {
      // Import answers nothing; all that matters is that the owner may.
      await expect(attempt(owner), what).resolves.not.toBe(false);
    }
  });
});

describe('INV-16: instance admins are implicit owners of every enterprise (D-21)', () => {
  it('lets an admin read and manage an enterprise without being listed as a member', async ({
    world,
  }) => {
    const m = await smallModel(world, await world.enterprise());
    const { owner, id } = m.enterprise;
    const admin = await world.account('admin');
    const otherAdmin = await world.account('admin');

    expect(admin.memberships[id]).toBe('owner');
    expect(await world.buildingBlocks.findOne(admin, m.sbb.id)).toBeDefined();
    await expect(world.enterprises.update(admin, id, { name: 'Renamed' })).resolves.toBeDefined();
    const members = await world.enterprises.members(admin, id);
    expect(members.map((member) => member.userId)).toEqual([owner.userId]);

    // The ownership is the role's, not the person's: it ends with the role.
    await world.admin.setRole(admin.userId, 'user');
    const demoted = await world.nextRequest(admin);
    expect(demoted.enterpriseIds).toEqual([]);
    expect(await world.buildingBlocks.findOne(demoted, m.sbb.id)).toBeUndefined();
    expect(otherAdmin.memberships[id]).toBe('owner');
  });
});

describe('INV-16: an enterprise is never left without a member', () => {
  it('makes whoever creates an enterprise its first member, as owner', async ({ world }) => {
    const creator = await world.account();
    expect(creator.enterpriseIds).toEqual([]);

    const created = await world.enterprises.create(creator, { name: 'New' });

    // Read from the stored membership on the next request, not from what
    // the creating request granted itself.
    const next = await world.nextRequest(creator);
    expect(next.memberships).toEqual({ [created.id]: 'owner' });
    expect(await world.enterprises.members(next, created.id)).toEqual([
      expect.objectContaining({ userId: creator.userId, role: 'owner' }),
    ]);
  });

  it('refuses to remove the last member, whoever asks', async ({ world }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;
    const admin = await world.account('admin');
    const message = /An enterprise needs at least one owner/;

    await expectRefusal(
      world.enterprises.removeMember(owner, id, owner.userId),
      BadRequestException,
      message,
    );
    await expectRefusal(
      world.enterprises.removeMember(admin, id, owner.userId),
      BadRequestException,
      message,
    );

    // Someone who is not the last may leave.
    const editor = await world.member(enterprise, 'editor');
    const left = await world.enterprises.removeMember(editor, id, editor.userId);
    expect(left.map((member) => member.userId)).toEqual([owner.userId]);
  });

  it('refuses to delete an account that is the last member of an enterprise', async ({ world }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;
    const admin = await world.account('admin');

    await expectRefusal(
      world.admin.deleteUser(admin, owner.userId),
      BadRequestException,
      /This account is the only member of/,
    );

    const successor = await world.member(enterprise, 'owner');
    expect(await world.admin.deleteUser(admin, owner.userId)).toBe(true);
    const members = await world.enterprises.members(successor, id);
    expect(members.map((member) => member.userId)).toEqual([successor.userId]);
  });
});

// The harness writes accounts and sessions as rows (see harness.ts). This is
// the one place that goes the whole way a person does, so that the shortcut
// is known to end in the same principal.
describe('accounts made the way people make them', () => {
  it('gives the first sign-up the instance and everyone after a setup link', async ({ world }) => {
    const signedUp = await world.auth.signUp({
      email: 'First@Example.test',
      displayName: 'First',
      password: 'correct horse battery',
    });
    const admin = await world.auth.resolveSession(signedUp.session.token);
    if (!admin) throw new Error('the first account has no session');
    expect(admin).toMatchObject({ email: 'first@example.test', instanceRole: 'admin' });
    const enterprise = await world.enterprises.create(admin, { name: 'New' });

    const link = await world.admin.createUser(admin, {
      email: 'second@example.test',
      displayName: 'Second',
      memberships: [{ enterpriseId: enterprise.id, role: EnterpriseRole.VIEWER }],
    });
    // No password until the link is used, so no way in.
    const credentials = { email: 'second@example.test', password: 'staple battery horse' };
    await expectRefusal(world.auth.signIn(credentials), HttpException, /Wrong email or password/);

    const setUp = await world.auth.completeSetup(link.token, credentials.password);
    const expected = { instanceRole: 'user', memberships: { [enterprise.id]: 'viewer' } };
    expect(await world.auth.resolveSession(setUp.session.token)).toMatchObject(expected);
    // The link works once.
    await expectRefusal(
      world.auth.completeSetup(link.token, credentials.password),
      BadRequestException,
      /invalid, used up, or expired/,
    );

    const signedIn = await world.auth.signIn(credentials);
    expect(await world.auth.resolveSession(signedIn.session.token)).toMatchObject(expected);
  });
});
