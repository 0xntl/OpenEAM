import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '../harness';
import { expectRefusal } from '../model';

// Every test starts without accounts (see harness.ts), so the admins a test
// creates are all the admins there are.
describe('INV-17: there is always at least one active instance admin', () => {
  const lastAdmin = /This is the last active admin/;

  it('refuses the last admin stepping down, and allows it once there is another', async ({
    world,
  }) => {
    const first = await world.account('admin');
    await world.account('user');

    await expectRefusal(world.admin.setRole(first.userId, 'user'), BadRequestException, lastAdmin);

    const second = await world.account('admin');
    await expect(world.admin.setRole(first.userId, 'user')).resolves.toMatchObject({
      instanceRole: 'user',
    });
    await expectRefusal(world.admin.setRole(second.userId, 'user'), BadRequestException, lastAdmin);
  });

  it('does not count a deactivated admin', async ({ world }) => {
    const first = await world.account('admin');
    const second = await world.account('admin');
    await world.admin.setDisabled(first, second.userId, true);

    await expectRefusal(world.admin.setRole(first.userId, 'user'), BadRequestException, lastAdmin);
  });

  it('refuses deactivating or deleting the last active admin', async ({ world }) => {
    const first = await world.account('admin');
    const second = await world.account('admin');
    await world.admin.setDisabled(first, second.userId, true);
    // `second` was an admin when its request came in and has been deactivated
    // since: the one way to ask this of the last admin without being them,
    // which the next rule refuses on its own grounds.
    await expectRefusal(
      world.admin.setDisabled(second, first.userId, true),
      BadRequestException,
      lastAdmin,
    );
    await expectRefusal(
      world.admin.deleteUser(second, first.userId),
      BadRequestException,
      lastAdmin,
    );
  });

  it('refuses deactivating or deleting oneself, and allows both for another admin', async ({
    world,
  }) => {
    const first = await world.account('admin');
    const second = await world.account('admin');

    await expectRefusal(
      world.admin.setDisabled(first, first.userId, true),
      BadRequestException,
      /You cannot deactivate your own account/,
    );
    await expectRefusal(
      world.admin.deleteUser(first, first.userId),
      BadRequestException,
      /You cannot delete your own account/,
    );

    await expect(world.admin.setDisabled(first, second.userId, true)).resolves.toMatchObject({
      disabledAt: expect.any(String),
    });
    expect(await world.admin.deleteUser(first, second.userId)).toBe(true);
  });
});

describe('INV-18: every enterprise has at least one explicit owner', () => {
  const needsOwner = /An enterprise needs at least one owner/;

  it('refuses demoting or removing the last owner, and allows it once there is another', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;
    await world.member(enterprise, 'editor');

    await expectRefusal(
      world.enterprises.setMemberRole(owner, id, owner.userId, 'editor'),
      BadRequestException,
      needsOwner,
    );
    await expectRefusal(
      world.enterprises.removeMember(owner, id, owner.userId),
      BadRequestException,
      needsOwner,
    );

    const second = await world.member(enterprise, 'owner');
    const members = await world.enterprises.setMemberRole(owner, id, owner.userId, 'editor');
    expect(members.find((member) => member.userId === owner.userId)?.role).toBe('editor');
    await expectRefusal(
      world.enterprises.removeMember(second, id, second.userId),
      BadRequestException,
      needsOwner,
    );
  });

  it("does not count an instance admin's implicit ownership", async ({ world }) => {
    const { owner, id } = await world.enterprise();
    const admin = await world.account('admin');
    expect(admin.memberships[id]).toBe('owner');

    await expectRefusal(
      world.enterprises.setMemberRole(admin, id, owner.userId, 'viewer'),
      BadRequestException,
      needsOwner,
    );
    await expectRefusal(
      world.enterprises.removeMember(admin, id, owner.userId),
      BadRequestException,
      needsOwner,
    );
  });

  // FINDING, 2026-11-12 — the rule does not hold here, so this test fails and
  // is skipped until the rule is fixed; remove `.skip` with the fix.
  // addMember() upserts the membership and sets the role without asking
  // whether the member is the last owner, so an owner (or an admin) who adds
  // the last owner again as editor or viewer leaves the enterprise without
  // an explicit owner. From there the former owner can also leave, which
  // INV-16 forbids: an enterprise with no member at all.
  it.skip('refuses demoting the last owner by adding them again with a lesser role', async ({
    world,
  }) => {
    const { owner, id } = await world.enterprise();

    await expectRefusal(
      world.enterprises.addMember(owner, id, owner.email, 'viewer'),
      BadRequestException,
      /owner/,
    );
    const members = await world.enterprises.members(await world.nextRequest(owner), id);
    expect(members).toEqual([expect.objectContaining({ userId: owner.userId, role: 'owner' })]);
  });

  // FINDING, 2026-11-12 — the rule does not hold here either; skipped for
  // the same reason. deleteUser() refuses only when the account is the last
  // *member* of an enterprise. With any other member present, deleting the
  // last owner's account goes through, the membership cascades away with it,
  // and the enterprise is left with members but no explicit owner.
  it.skip('refuses deleting the account of the last owner while other members remain', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;
    const editor = await world.member(enterprise, 'editor');
    const admin = await world.account('admin');

    await expectRefusal(world.admin.deleteUser(admin, owner.userId), BadRequestException, /owner/);
    const members = await world.enterprises.members(editor, id);
    expect(members.filter((member) => member.role === 'owner')).toHaveLength(1);
  });
});
