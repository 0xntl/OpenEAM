// INV-17 and INV-18 when two requests come at once. Each rule is a check
// followed by a write, with no constraint in Postgres behind it; the
// services hold a lock on the rows they check until they have written.
// admins-and-owners.test.ts has the rules one request at a time.
import { BadRequestException } from '@nestjs/common';
import { schema } from '@openeam/db';
import { describe, expect, it } from 'vitest';
import type { Principal } from '../../src/auth/principal';
import { useScratchDatabase } from '../concurrency';

const scratch = useScratchDatabase();

// Of requests that would each be allowed alone, exactly one goes through and
// the other is refused for the rule's reason.
function expectOneRefused(outcomes: PromiseSettledResult<unknown>[], message: RegExp): void {
  const refused = outcomes.filter((o) => o.status === 'rejected');
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  expect(refused).toHaveLength(1);
  const reason = (refused[0] as PromiseRejectedResult).reason as Error;
  expect(reason).toBeInstanceOf(BadRequestException);
  expect(reason.message).toMatch(message);
}

describe('INV-17 holds when two requests come at once', () => {
  const lastAdmin = /This is the last active admin/;
  // What every way of taking away an admin reads and then writes.
  const admins = { sql: `SELECT id FROM users WHERE instance_role = 'admin' FOR UPDATE` };

  async function activeAdmins(): Promise<number> {
    const users = await scratch.world().db.select().from(schema.users);
    return users.filter((u) => u.instanceRole === 'admin' && u.disabledAt === null).length;
  }

  it('lets only one of two admins step the other down', async () => {
    const world = scratch.world();
    const first = await world.account('admin');
    const second = await world.account('admin');

    const outcomes = await world.race(admins, [
      () => world.admin.setRole(first.userId, 'user'),
      () => world.admin.setRole(second.userId, 'user'),
    ]);

    expectOneRefused(outcomes, lastAdmin);
    expect(await activeAdmins()).toBe(1);
  });

  it('refuses one of deactivating the other admin and stepping down oneself', async () => {
    const world = scratch.world();
    const first = await world.account('admin');
    const second = await world.account('admin');

    const outcomes = await world.race(admins, [
      () => world.admin.setDisabled(first, second.userId, true),
      () => world.admin.setRole(first.userId, 'user'),
    ]);

    expectOneRefused(outcomes, lastAdmin);
    expect(await activeAdmins()).toBe(1);
  });

  it('refuses one of deleting the other admin and stepping down oneself', async () => {
    const world = scratch.world();
    const first = await world.account('admin');
    const second = await world.account('admin');

    const outcomes = await world.race(admins, [
      () => world.admin.deleteUser(first, second.userId),
      () => world.admin.setRole(first.userId, 'user'),
    ]);

    expectOneRefused(outcomes, lastAdmin);
    expect(await activeAdmins()).toBe(1);
  });
});

describe('INV-18 holds when two requests come at once', () => {
  // Either refusal is right, depending on which request Postgres lets go
  // first: the enterprise's own, or the one for deleting an account.
  const lastOwner = /An enterprise needs at least one owner|This account is the only owner of/;
  const membersOf = (enterpriseId: string) => ({
    sql: 'SELECT 1 FROM enterprise_members WHERE enterprise_id = $1 FOR UPDATE',
    params: [enterpriseId],
  });

  async function owners(enterpriseId: string): Promise<number> {
    const members = await scratch.world().db.select().from(schema.enterpriseMembers);
    return members.filter((m) => m.enterpriseId === enterpriseId && m.role === 'owner').length;
  }

  it('lets only one of two owners demote the other', async () => {
    const world = scratch.world();
    const { id, members } = await world.enterprise('owner');
    const [first, second] = members as [Principal, Principal];

    const outcomes = await world.race(membersOf(id), [
      () => world.enterprises.setMemberRole(first, id, second.userId, 'editor'),
      () => world.enterprises.setMemberRole(second, id, first.userId, 'editor'),
    ]);

    expectOneRefused(outcomes, lastOwner);
    expect(await owners(id)).toBe(1);
  });

  it('lets only one of two owners leave', async () => {
    const world = scratch.world();
    const { id, members } = await world.enterprise('owner', 'editor');
    const [first, second] = members as [Principal, Principal];

    const outcomes = await world.race(membersOf(id), [
      () => world.enterprises.removeMember(first, id, first.userId),
      () => world.enterprises.removeMember(second, id, second.userId),
    ]);

    expectOneRefused(outcomes, lastOwner);
    expect(await owners(id)).toBe(1);
  });

  it("refuses one of deleting an owner's account and the other owner leaving", async () => {
    const world = scratch.world();
    const admin = await world.account('admin');
    const { id, members } = await world.enterprise('owner', 'editor');
    const [first, second] = members as [Principal, Principal];

    const outcomes = await world.race(membersOf(id), [
      () => world.admin.deleteUser(admin, first.userId),
      () => world.enterprises.removeMember(second, id, second.userId),
    ]);

    expectOneRefused(outcomes, lastOwner);
    expect(await owners(id)).toBe(1);
  });
});
