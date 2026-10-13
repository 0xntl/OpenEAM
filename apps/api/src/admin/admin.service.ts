// What an instance admin can do (D-17): accounts, the sign-up switch and
// the instance branding (D-23).
// Enterprises are managed from the enterprise itself — an admin is an
// implicit owner of every one (D-21).
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Database } from '@openeam/db';
import { eq, schema } from '@openeam/db';
import {
  AuthService,
  assetVersionOf,
  INSTANCE_SETTINGS_ID,
  type InstanceAssetKind,
} from '../auth/auth.service';
import type { EnterpriseRole } from '../auth/policy';
import type { InstanceRole, Principal } from '../auth/principal';
import { DATABASE } from '../db.module';
import type {
  AdminUser,
  CreateUserInput,
  InstanceSettings,
  InstanceSettingsInput,
  SetupLink,
} from './admin.model';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Branding limits (D-23). An image is only ever embedded as an <img>, which
// runs no script; the SVG checks below are belt and braces on top of that.
const INSTANCE_NAME_MAX_LENGTH = 60;
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_MIME_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'];
const SVG_FORBIDDEN = /<script|javascript:|\son[a-z]+\s*=|<foreignObject|<iframe|<embed|<object/i;

// The declared type is checked against the bytes, not trusted: a file is
// what its signature says it is.
function matchesSignature(bytes: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/png':
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/webp':
      return (
        bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
        bytes.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    case 'image/svg+xml': {
      const text = bytes.toString('utf8');
      return /<svg[\s>]/i.test(text) && !SVG_FORBIDDEN.test(text);
    }
    default:
      return false;
  }
}

export interface StoredAsset {
  bytes: Buffer;
  mime: string;
  version: string;
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly auth: AuthService,
  ) {}

  async users(): Promise<AdminUser[]> {
    const now = new Date().toISOString();
    const rows = await this.db.query.users.findMany({
      orderBy: (t, { asc }) => [asc(t.createdAt)],
      with: {
        memberships: {
          with: { enterprise: { columns: { id: true, name: true } } },
        },
        setupTokens: {
          where: (t, { and, gt, isNull }) => and(isNull(t.usedAt), gt(t.expiresAt, now)),
          columns: { expiresAt: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      instanceRole: row.instanceRole as AdminUser['instanceRole'],
      disabledAt: row.disabledAt,
      createdAt: row.createdAt,
      hasPassword: row.passwordHash !== null,
      setupLinkExpiresAt:
        row.setupTokens.map((t) => t.expiresAt).sort((a, b) => b.localeCompare(a))[0] ?? null,
      memberships: row.memberships
        .map((m) => ({
          enterpriseId: m.enterprise.id,
          enterpriseName: m.enterprise.name,
          role: m.role as AdminUser['memberships'][number]['role'],
        }))
        .sort((a, b) => a.enterpriseName.localeCompare(b.enterpriseName)),
    }));
  }

  async updateSettings(input: InstanceSettingsInput): Promise<InstanceSettings> {
    const set: Partial<typeof schema.instanceSettings.$inferInsert> = {};
    if (input.signUpOpen !== undefined && input.signUpOpen !== null) {
      set.signUpOpen = input.signUpOpen;
    }
    if (input.name !== undefined) {
      const name = input.name?.trim() ?? '';
      if (name.length > INSTANCE_NAME_MAX_LENGTH) {
        throw new BadRequestException(
          `The instance name can be at most ${INSTANCE_NAME_MAX_LENGTH} characters`,
        );
      }
      set.name = name === '' ? null : name;
    }
    await this.auth.instanceSettings(); // seeds the row if it does not exist yet
    if (Object.keys(set).length > 0) {
      await this.db
        .update(schema.instanceSettings)
        .set(set)
        .where(eq(schema.instanceSettings.id, INSTANCE_SETTINGS_ID));
    }
    return this.auth.instanceSettings();
  }

  async asset(kind: InstanceAssetKind): Promise<StoredAsset | null> {
    const row = await this.db.query.instanceAssets.findFirst({
      where: (t, { eq: equals }) => equals(t.kind, kind),
    });
    if (!row) return null;
    return { bytes: row.bytes, mime: row.mime, version: assetVersionOf(row.updatedAt) ?? '0' };
  }

  async setAsset(kind: InstanceAssetKind, bytes: Buffer, mime: string): Promise<InstanceSettings> {
    if (!LOGO_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(`The image must be one of: ${LOGO_MIME_TYPES.join(', ')}`);
    }
    if (bytes.length === 0) throw new BadRequestException('The image file is empty');
    if (bytes.length > LOGO_MAX_BYTES) {
      throw new BadRequestException(`The image must be at most ${LOGO_MAX_BYTES / 1024} KB`);
    }
    if (!matchesSignature(bytes, mime)) {
      throw new BadRequestException(
        mime === 'image/svg+xml'
          ? 'The file is not an SVG, or it contains scripts, handlers or embeds'
          : `The file is not a ${mime.slice('image/'.length).toUpperCase()} image`,
      );
    }
    const updatedAt = new Date().toISOString();
    await this.db
      .insert(schema.instanceAssets)
      .values({ kind, bytes, mime, updatedAt })
      .onConflictDoUpdate({ target: schema.instanceAssets.kind, set: { bytes, mime, updatedAt } });
    return this.auth.instanceSettings();
  }

  async clearAsset(kind: InstanceAssetKind): Promise<InstanceSettings> {
    await this.db.delete(schema.instanceAssets).where(eq(schema.instanceAssets.kind, kind));
    return this.auth.instanceSettings();
  }

  // Admin-created accounts are the way in while sign-up is closed. The
  // account starts without a password; the setup link returned here is what
  // the admin hands over, and the person sets the password themselves (D-19).
  async createUser(principal: Principal, input: CreateUserInput): Promise<SetupLink> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!EMAIL_PATTERN.test(email)) throw new BadRequestException('Enter a valid email address');
    if (!displayName) throw new BadRequestException('A display name is required');

    const existing = await this.db.query.users.findFirst({
      where: (t, { eq: equals }) => equals(t.email, email),
      columns: { id: true },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    const memberships = new Map(
      (input.memberships ?? []).map((m) => [
        m.enterpriseId,
        (m.role ?? 'editor') as EnterpriseRole,
      ]),
    );
    const enterpriseIds = [...memberships.keys()];
    if (enterpriseIds.length > 0) {
      const found = await this.db.query.enterprises.findMany({
        where: (t, { inArray }) => inArray(t.id, enterpriseIds),
        columns: { id: true },
      });
      if (found.length !== enterpriseIds.length) {
        throw new BadRequestException('One of the enterprises does not exist');
      }
    }

    const inserted = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({
          email,
          displayName,
          passwordHash: null,
          instanceRole: (input.instanceRole ?? 'user') as InstanceRole,
        })
        .returning({ id: schema.users.id });
      if (!user) throw new ConflictException('User insert returned no row');
      if (enterpriseIds.length > 0) {
        await tx.insert(schema.enterpriseMembers).values(
          enterpriseIds.map((enterpriseId) => ({
            enterpriseId,
            userId: user.id,
            role: memberships.get(enterpriseId) ?? 'editor',
          })),
        );
      }
      return user;
    });
    return this.setupLink(principal, inserted.id, 'setup');
  }

  // A forgotten password, or a first link that expired: the admin issues a
  // new link rather than setting a password. Earlier links stop working.
  async createSetupLink(principal: Principal, userId: string): Promise<SetupLink> {
    const user = await this.requireUser(userId);
    return this.setupLink(principal, userId, user.passwordHash ? 'reset' : 'setup');
  }

  private async setupLink(
    principal: Principal,
    userId: string,
    purpose: 'setup' | 'reset',
  ): Promise<SetupLink> {
    const issued = await this.auth.issueSetupToken(userId, purpose, principal.userId);
    return {
      user: await this.user(userId),
      token: issued.token,
      expiresAt: issued.expiresAt,
      purpose: issued.purpose as SetupLink['purpose'],
    };
  }

  // The last admin cannot step down, otherwise nobody could run the instance.
  async setRole(userId: string, role: InstanceRole): Promise<AdminUser> {
    const user = await this.requireUser(userId);
    if (user.instanceRole === 'admin' && role !== 'admin') await this.assertNotLastAdmin(userId);
    await this.db
      .update(schema.users)
      .set({ instanceRole: role })
      .where(eq(schema.users.id, userId));
    return this.user(userId);
  }

  // Deactivating ends every session at once; the account, its memberships and
  // its history stay. An admin cannot deactivate themselves or the last admin.
  async setDisabled(principal: Principal, userId: string, disabled: boolean): Promise<AdminUser> {
    if (userId === principal.userId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.requireUser(userId);
    if (disabled && user.instanceRole === 'admin') await this.assertNotLastAdmin(userId);
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ disabledAt: disabled ? new Date().toISOString() : null })
        .where(eq(schema.users.id, userId));
      if (disabled) await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    });
    return this.user(userId);
  }

  // Deletion is for accounts that should not exist; deactivation is the
  // normal off-boarding. Refused while the account is the last member of any
  // enterprise, which would otherwise be stranded (INV-16).
  async deleteUser(principal: Principal, userId: string): Promise<boolean> {
    if (userId === principal.userId)
      throw new BadRequestException('You cannot delete your own account');
    const user = await this.requireUser(userId);
    if (user.instanceRole === 'admin') await this.assertNotLastAdmin(userId);

    const memberships = await this.db.query.enterpriseMembers.findMany({
      where: (t, { eq: equals }) => equals(t.userId, userId),
      with: {
        enterprise: { columns: { name: true }, with: { members: { columns: { userId: true } } } },
      },
    });
    const stranded = memberships.filter((m) => m.enterprise.members.length === 1);
    if (stranded.length > 0) {
      throw new BadRequestException(
        `This account is the only member of ${stranded.map((m) => `"${m.enterprise.name}"`).join(', ')} — add another member or delete the enterprise first`,
      );
    }

    const [deleted] = await this.db
      .delete(schema.users)
      .where(eq(schema.users.id, userId))
      .returning({ id: schema.users.id });
    return Boolean(deleted);
  }

  private async user(id: string): Promise<AdminUser> {
    const user = (await this.users()).find((u) => u.id === id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private async requireUser(id: string) {
    const user = await this.db.query.users.findFirst({
      where: (t, { eq: equals }) => equals(t.id, id),
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  private async assertNotLastAdmin(userId: string): Promise<void> {
    const other = await this.db.query.users.findFirst({
      where: (t, { and, eq: equals, isNull, ne: notEq }) =>
        and(equals(t.instanceRole, 'admin'), notEq(t.id, userId), isNull(t.disabledAt)),
      columns: { id: true },
    });
    if (!other)
      throw new BadRequestException('This is the last active admin — appoint another one first');
  }
}
