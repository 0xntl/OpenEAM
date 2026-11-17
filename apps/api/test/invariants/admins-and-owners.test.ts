import { BadRequestException } from '@nestjs/common';
import { InstanceRole } from '../../src/auth/auth.model';
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

  // Active means able to sign in (D-29). An admin created by another admin
  // has no password until the setup link is used; if they counted, the last
  // admin who can sign in could step down, and once the link had run out
  // after its seven days nobody would be left to issue another.
  it('does not count an admin who has never set a password', async ({ world }) => {
    const first = await world.account('admin');
    const { user: pending, token } = await world.admin.createUser(first, {
      email: 'pending@example.test',
      displayName: 'Pending',
      instanceRole: InstanceRole.ADMIN,
    });

    // The refusal says why appointing someone was not enough.
    await expectRefusal(
      world.admin.setRole(first.userId, 'user'),
      BadRequestException,
      /This is the last active admin — the other admin has not set a password yet/,
    );

    // From the moment the link is used, they count.
    await world.auth.completeSetup(token, 'a long enough password');
    await expect(world.admin.setRole(first.userId, 'user')).resolves.toMatchObject({
      instanceRole: 'user',
    });
    await expectRefusal(
      world.admin.setRole(pending.id, 'user'),
      BadRequestException,
      /This is the last active admin — appoint another one first/,
    );
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

  // addMember() sets the role of someone who is already a member, so it is
  // a second way to demote: without the rule here, the last owner added
  // again as editor or viewer left the enterprise with no explicit owner,
  // and could then leave it with no member at all (INV-16).
  it('refuses demoting the last owner by adding them again with a lesser role', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;

    await expectRefusal(
      world.enterprises.addMember(owner, id, owner.email, 'viewer'),
      BadRequestException,
      needsOwner,
    );
    const members = await world.enterprises.members(await world.nextRequest(owner), id);
    expect(members).toEqual([expect.objectContaining({ userId: owner.userId, role: 'owner' })]);

    // With a second owner it is an ordinary change of role, and adding a
    // member again with the role they have changes nothing.
    await world.member(enterprise, 'owner');
    await world.enterprises.addMember(owner, id, owner.email, 'owner');
    const after = await world.enterprises.addMember(owner, id, owner.email, 'viewer');
    expect(after.find((member) => member.userId === owner.userId)?.role).toBe('viewer');
  });

  // A membership goes with its account. Deleting the last owner's account
  // while others are members would leave an enterprise with members and no
  // explicit owner, so it is refused like removing them would be.
  it('refuses deleting the account of the last owner while other members remain', async ({
    world,
  }) => {
    const enterprise = await world.enterprise();
    const { owner, id } = enterprise;
    const editor = await world.member(enterprise, 'editor');
    const admin = await world.account('admin');

    await expectRefusal(
      world.admin.deleteUser(admin, owner.userId),
      BadRequestException,
      /This account is the only owner of/,
    );
    const members = await world.enterprises.members(editor, id);
    expect(members.filter((member) => member.role === 'owner')).toHaveLength(1);

    // An account that owns nothing alone can go.
    expect(await world.admin.deleteUser(admin, editor.userId)).toBe(true);
  });
});
