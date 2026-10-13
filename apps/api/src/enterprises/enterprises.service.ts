import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, schema } from '@openeam/db';
import { assertCan, type EnterpriseRole } from '../auth/policy';
import { assertEnterpriseAccess, grantMembership, type Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type {
  AccountSummary,
  Enterprise,
  EnterpriseInput,
  EnterpriseMember,
} from './enterprise.model';

// The four TOGAF BDAT domains, seeded into every new enterprise so building
// blocks always have domains to be classified into.
const DEFAULT_DOMAINS = [
  {
    name: 'Business Architecture',
    description: 'Business strategy, governance, organization, and key business processes.',
  },
  {
    name: 'Data Architecture',
    description: 'Structure of logical and physical data assets and data management resources.',
  },
  {
    name: 'Application Architecture',
    description:
      'Individual applications, their interactions, and their relationships to business processes.',
  },
  {
    name: 'Technology Architecture',
    description:
      'Software and hardware capabilities required to support business, data, and application services.',
  },
];

@Injectable()
export class EnterprisesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Only the enterprises the caller is a member of (INV-16).
  findAll(principal: Principal): Promise<Enterprise[]> {
    return this.db.query.enterprises.findMany({
      where: (t, { inArray }) => inArray(t.id, principal.enterpriseIds),
      orderBy: (t, { asc }) => [asc(t.name)],
    });
  }

  findOne(principal: Principal, id: string): Promise<Enterprise | undefined> {
    return this.db.query.enterprises.findFirst({
      where: (t, { and, eq, inArray }) => and(eq(t.id, id), inArray(t.id, principal.enterpriseIds)),
    });
  }

  // The creator becomes the first owner; otherwise nobody could see the
  // enterprise they just created.
  async create(principal: Principal, input: EnterpriseInput): Promise<Enterprise> {
    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(schema.enterprises)
        .values({
          name: input.name,
          description: input.description ?? null,
          goal: input.goal ?? null,
          avatarBgColor: input.avatarBgColor ?? null,
          avatarTextColor: input.avatarTextColor ?? null,
        })
        .returning();

      if (!inserted) throw new NotFoundException('Enterprise insert returned no row');

      await tx.insert(schema.architectureDomains).values(
        DEFAULT_DOMAINS.map((domain) => ({
          enterpriseId: inserted.id,
          name: domain.name,
          description: domain.description,
          isDefault: true,
        })),
      );

      await tx
        .insert(schema.enterpriseMembers)
        .values({ enterpriseId: inserted.id, userId: principal.userId, role: 'owner' });

      // The principal was resolved before this enterprise existed; widen it
      // so the rest of the same request (e.g. a `members` sub-selection on
      // the returned enterprise) can see what was just created.
      grantMembership(principal, inserted.id, 'owner');

      return inserted;
    });
  }

  async update(principal: Principal, id: string, input: EnterpriseInput): Promise<Enterprise> {
    assertCan(principal, 'enterprise.update', id);
    const [updated] = await this.db
      .update(schema.enterprises)
      .set({
        name: input.name,
        description: input.description ?? null,
        goal: input.goal ?? null,
        avatarBgColor: input.avatarBgColor ?? null,
        avatarTextColor: input.avatarTextColor ?? null,
      })
      .where(eq(schema.enterprises.id, id))
      .returning();

    if (!updated) throw new NotFoundException(`Enterprise ${id} not found`);
    return updated;
  }

  // Deleting an enterprise cascades to every entity modeled within it.
  async delete(principal: Principal, id: string): Promise<boolean> {
    assertCan(principal, 'enterprise.delete', id);
    const [deleted] = await this.db
      .delete(schema.enterprises)
      .where(eq(schema.enterprises.id, id))
      .returning({ id: schema.enterprises.id });
    return Boolean(deleted);
  }

  // Who can be added: every active account, visible to anyone who owns at
  // least one enterprise. Owners need to find colleagues by name; a member
  // who owns nothing has no use for the list and does not get it.
  async accounts(principal: Principal): Promise<AccountSummary[]> {
    const owner =
      principal.instanceRole === 'admin' ||
      Object.values(principal.memberships).some((role) => role === 'owner');
    if (!owner) throw new ForbiddenException('Only an owner can look up accounts');
    const rows = await this.db.query.users.findMany({
      where: (t, { isNull }) => isNull(t.disabledAt),
      columns: { id: true, email: true, displayName: true },
      orderBy: (t, { asc }) => [asc(t.displayName)],
    });
    return rows;
  }

  // Every member may see who else is in. Instance admins are not listed:
  // their ownership is implicit (D-21).
  async members(principal: Principal, enterpriseId: string): Promise<EnterpriseMember[]> {
    assertEnterpriseAccess(principal, enterpriseId);
    const rows = await this.db.query.enterpriseMembers.findMany({
      where: (t, { eq }) => eq(t.enterpriseId, enterpriseId),
      with: { user: { columns: { id: true, email: true, displayName: true } } },
    });
    return rows
      .map((row) => ({
        userId: row.user.id,
        email: row.user.email,
        displayName: row.user.displayName,
        role: row.role as EnterpriseMember['role'],
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Owners manage membership (instance admins are owners everywhere). The
  // account has to exist already; there are no invitations for people
  // without one.
  async addMember(
    principal: Principal,
    enterpriseId: string,
    email: string,
    role: EnterpriseRole,
  ): Promise<EnterpriseMember[]> {
    this.assertManagesMembers(principal, enterpriseId);
    const user = await this.db.query.users.findFirst({
      where: (t, { eq }) => eq(t.email, email.trim().toLowerCase()),
      columns: { id: true },
    });
    if (!user) throw new NotFoundException(`No account with the email ${email.trim()}`);

    await this.db
      .insert(schema.enterpriseMembers)
      .values({ enterpriseId, userId: user.id, role })
      .onConflictDoUpdate({
        target: [schema.enterpriseMembers.enterpriseId, schema.enterpriseMembers.userId],
        set: { role },
      });
    return this.members(principal, enterpriseId);
  }

  async setMemberRole(
    principal: Principal,
    enterpriseId: string,
    userId: string,
    role: EnterpriseRole,
  ): Promise<EnterpriseMember[]> {
    this.assertManagesMembers(principal, enterpriseId);
    const current = await this.members(principal, enterpriseId);
    const member = current.find((m) => m.userId === userId);
    if (!member) throw new NotFoundException('Not a member of this enterprise');
    if (member.role === 'owner' && role !== 'owner') this.assertNotLastOwner(current, userId);
    await this.db
      .update(schema.enterpriseMembers)
      .set({ role })
      .where(
        and(
          eq(schema.enterpriseMembers.enterpriseId, enterpriseId),
          eq(schema.enterpriseMembers.userId, userId),
        ),
      );
    return this.members(principal, enterpriseId);
  }

  // Anyone may leave; owners (and admins) may remove others. Removing the
  // last owner would strand the enterprise — nobody could manage it again.
  async removeMember(
    principal: Principal,
    enterpriseId: string,
    userId: string,
  ): Promise<EnterpriseMember[]> {
    if (userId !== principal.userId) this.assertManagesMembers(principal, enterpriseId);
    else assertEnterpriseAccess(principal, enterpriseId);
    const current = await this.members(principal, enterpriseId);
    const member = current.find((m) => m.userId === userId);
    if (!member) return current;
    if (member.role === 'owner') this.assertNotLastOwner(current, userId);
    await this.db
      .delete(schema.enterpriseMembers)
      .where(
        and(
          eq(schema.enterpriseMembers.enterpriseId, enterpriseId),
          eq(schema.enterpriseMembers.userId, userId),
        ),
      );
    // The caller may have just removed themselves; list with what they had.
    return current.filter((m) => m.userId !== userId);
  }

  private assertManagesMembers(principal: Principal, enterpriseId: string): void {
    assertCan(principal, 'members.manage', enterpriseId);
  }

  // INV-18: an enterprise always has an explicit owner; an admin's implicit
  // ownership does not count, or an admin could strand one by stepping down.
  private assertNotLastOwner(members: EnterpriseMember[], userId: string): void {
    const otherOwner = members.some((m) => m.role === 'owner' && m.userId !== userId);
    if (!otherOwner) {
      throw new BadRequestException(
        'An enterprise needs at least one owner — make someone else an owner first, or delete the enterprise',
      );
    }
  }
}
