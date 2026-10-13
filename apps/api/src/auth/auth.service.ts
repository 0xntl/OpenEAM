// Local accounts and server-side sessions. A session is a random token whose
// SHA-256 is stored; the token itself only ever lives in the user's cookie
// (or a script's bearer header). Deleting the row is logout, and a database
// dump does not contain anything that signs in. See docs/DECISIONS.md D-15.
import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Database } from '@openeam/db';
import { and, eq, isNull, lt, ne, schema } from '@openeam/db';
import { config } from '../config';
import { DATABASE } from '../db.module';
import type { AuthStatus, ChangePasswordInput, SignInInput, SignUpInput, User } from './auth.model';
import { hashPassword, verifyPassword } from './password';
import type { EnterpriseRole } from './policy';
import type { InstanceRole, Principal } from './principal';

export const INSTANCE_SETTINGS_ID = 'instance';
const DISABLED_MESSAGE = 'This account has been deactivated';
// A setup link is handed over by a person, not a machine; a week is long
// enough for that and short enough that a forgotten one is not a standing door.
const SETUP_TOKEN_DAYS = 7;

export type SetupTokenPurpose = 'setup' | 'reset';

export interface SetupToken {
  token: string;
  expiresAt: string;
  purpose: SetupTokenPurpose;
}

export interface SetupTokenStatus {
  valid: boolean;
  purpose: SetupTokenPurpose | null;
  email: string | null;
  displayName: string | null;
}

const SESSION_DAYS = 30;
const MIN_PASSWORD_LENGTH = 8;
// scrypt's cost grows with input length; nobody needs more than this.
const MAX_PASSWORD_LENGTH = 256;
const MAX_EMAIL_LENGTH = 254;
const MAX_DISPLAY_NAME_LENGTH = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Failed sign-ins per account, independent of client address: the per-IP
// throttle can be sidestepped on a LAN by forging X-Forwarded-For, this
// cannot. In memory, so a restart clears it; that is acceptable for a
// brute-force brake.
const LOCKOUT_ATTEMPTS = 10;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

interface FailureRecord {
  count: number;
  windowStartedAt: number;
}

export interface Session {
  token: string;
  expiresAt: string;
}

// What everyone may know about the instance: the sign-up switch and the
// branding (D-23). A version is null while the slot is empty and changes
// with every upload, so the web can use it as a cache-busting parameter.
export type InstanceAssetKind = 'logo' | 'logo_dark' | 'icon';

export interface InstanceSettingsView {
  signUpOpen: boolean;
  name: string | null;
  logoVersion: string | null;
  logoDarkVersion: string | null;
  iconVersion: string | null;
}

export function assetVersionOf(updatedAt: string | null): string | null {
  return updatedAt ? String(new Date(updatedAt).getTime()) : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Timestamps come back from Postgres as `2026-10-13 13:55:42.459156+00`
// (mode 'string'), not ISO; compared as strings against toISOString() the
// space sorts before the `T` and a row expiring later today reads as
// already expired. Parse both sides instead.
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `The password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `The password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
    );
  }
}

function validateCredentialShape(email: string, password: string): void {
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new BadRequestException('Enter a valid email address');
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `The password must be at most ${MAX_PASSWORD_LENGTH} characters long`,
    );
  }
}

@Injectable()
export class AuthService {
  private readonly failures = new Map<string, FailureRecord>();

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async status(): Promise<AuthStatus> {
    const [signUpAllowed, settings] = await Promise.all([
      this.signUpAllowed(),
      this.instanceSettings(),
    ]);
    return {
      signUpAllowed,
      instanceName: settings.name,
      logoVersion: settings.logoVersion,
      logoDarkVersion: settings.logoDarkVersion,
      iconVersion: settings.iconVersion,
    };
  }

  // The first account can always be created — an instance with no users is
  // unusable otherwise. After that, sign-up is open only while an admin has
  // switched it on (instance settings; AUTH_ALLOW_SIGNUP seeds the switch).
  private async signUpAllowed(): Promise<boolean> {
    const anyUser = await this.db.query.users.findFirst({ columns: { id: true } });
    if (!anyUser) return true;
    return (await this.instanceSettings()).signUpOpen;
  }

  // The settings row plus the versions of the branding images (never their
  // bytes); seeds the row on first use.
  async instanceSettings(): Promise<InstanceSettingsView> {
    const [row, assets] = await Promise.all([
      this.db.query.instanceSettings.findFirst({
        where: (t, { eq: equals }) => equals(t.id, INSTANCE_SETTINGS_ID),
        columns: { signUpOpen: true, name: true },
      }),
      this.db.query.instanceAssets.findMany({ columns: { kind: true, updatedAt: true } }),
    ]);
    const settings =
      row ??
      (
        await this.db
          .insert(schema.instanceSettings)
          .values({ id: INSTANCE_SETTINGS_ID, signUpOpen: config.AUTH_ALLOW_SIGNUP })
          .onConflictDoNothing()
          .returning()
      )[0] ??
      ({ signUpOpen: config.AUTH_ALLOW_SIGNUP, name: null } as const);
    const version = (kind: InstanceAssetKind) =>
      assetVersionOf(assets.find((a) => a.kind === kind)?.updatedAt ?? null);
    return {
      signUpOpen: settings.signUpOpen,
      name: settings.name,
      logoVersion: version('logo'),
      logoDarkVersion: version('logo_dark'),
      iconVersion: version('icon'),
    };
  }

  async signUp(input: SignUpInput): Promise<{ user: User; session: Session }> {
    if (!(await this.signUpAllowed())) {
      throw new ForbiddenException(
        'Sign-up is closed on this instance. Ask a member to add you to their enterprise.',
      );
    }

    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    validateCredentialShape(email, input.password);
    if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new BadRequestException(
        `A display name of at most ${MAX_DISPLAY_NAME_LENGTH} characters is required`,
      );
    }
    validateNewPassword(input.password);

    const existing = await this.db.query.users.findFirst({
      where: (t, { eq: equals }) => equals(t.email, email),
      columns: { id: true },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const user = await this.db.transaction(async (tx) => {
      const firstAccount = !(await tx.query.users.findFirst({ columns: { id: true } }));
      // The first account runs the instance (D-17); everyone after is a user
      // until an admin says otherwise.
      const [inserted] = await tx
        .insert(schema.users)
        .values({
          email,
          displayName,
          passwordHash,
          instanceRole: firstAccount ? 'admin' : 'user',
        })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
          instanceRole: schema.users.instanceRole,
        });
      if (!inserted) throw new ConflictException('User insert returned no row');

      // The first account inherits every enterprise already on the instance.
      // This is the upgrade path for an instance modelled before accounts
      // existed; without it, that data would be orphaned with no member.
      if (firstAccount) {
        const existing = await tx.query.enterprises.findMany({ columns: { id: true } });
        if (existing.length > 0) {
          await tx.insert(schema.enterpriseMembers).values(
            existing.map((e) => ({
              enterpriseId: e.id,
              userId: inserted.id,
              role: 'owner' as const,
            })),
          );
        }
      }
      return inserted;
    });

    return {
      user: { ...user, instanceRole: user.instanceRole as User['instanceRole'] },
      session: await this.createSession(user.id),
    };
  }

  async signIn(input: SignInInput): Promise<{ user: User; session: Session }> {
    const email = normalizeEmail(input.email);
    validateCredentialShape(email, input.password);
    this.assertNotLockedOut(email);

    const user = await this.db.query.users.findFirst({
      where: (t, { eq: equals }) => equals(t.email, email),
    });
    // Verify against a throwaway hash when the account does not exist or has
    // no password yet, so the response time does not reveal which emails are
    // registered. An account awaiting its setup link reads as "wrong
    // password" for the same reason.
    const valid = user?.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, await hashPassword('no-such-account'));
    if (!user || !valid) {
      this.recordFailure(email);
      throw new UnauthorizedException('Wrong email or password');
    }
    if (user.disabledAt) throw new UnauthorizedException(DISABLED_MESSAGE);

    this.failures.delete(email);
    // Expired sessions are swept per account on sign-in; cheap, and it keeps
    // the table from growing with abandoned browsers.
    await this.db
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, user.id),
          lt(schema.sessions.expiresAt, new Date().toISOString()),
        ),
      );

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        instanceRole: user.instanceRole as User['instanceRole'],
      },
      session: await this.createSession(user.id),
    };
  }

  // Signing out everywhere else is part of changing a password: whoever
  // prompted the change may be holding one of those sessions.
  async changePassword(principal: Principal, input: ChangePasswordInput, currentToken: string) {
    const user = await this.db.query.users.findFirst({
      where: (t, { eq: equals }) => equals(t.id, principal.userId),
    });
    if (!user?.passwordHash) throw new UnauthorizedException('Sign in required');
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('The current password is wrong');
    }
    validateNewPassword(input.newPassword);
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(schema.users.id, user.id));
      await tx
        .delete(schema.sessions)
        .where(
          and(
            eq(schema.sessions.userId, user.id),
            ne(schema.sessions.tokenHash, hashToken(currentToken)),
          ),
        );
    });
  }

  private assertNotLockedOut(email: string): void {
    const record = this.failures.get(email);
    if (!record) return;
    if (Date.now() - record.windowStartedAt > LOCKOUT_WINDOW_MS) {
      this.failures.delete(email);
      return;
    }
    if (record.count >= LOCKOUT_ATTEMPTS) {
      const minutes = Math.ceil(
        (LOCKOUT_WINDOW_MS - (Date.now() - record.windowStartedAt)) / 60_000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many failed sign-ins for this account — try again in ${minutes} minutes`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(email: string): void {
    const now = Date.now();
    const record = this.failures.get(email);
    if (!record || now - record.windowStartedAt > LOCKOUT_WINDOW_MS) {
      this.failures.set(email, { count: 1, windowStartedAt: now });
      return;
    }
    record.count += 1;
  }

  async signOut(token: string): Promise<void> {
    await this.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  }

  // Null for an unknown or expired token. Expired rows are removed as they
  // are met rather than by a sweeper; the table stays small either way.
  async resolveSession(token: string): Promise<Principal | null> {
    const session = await this.db.query.sessions.findFirst({
      where: (t, { eq: equals }) => equals(t.tokenHash, hashToken(token)),
      with: { user: { with: { memberships: { columns: { enterpriseId: true, role: true } } } } },
    });
    if (!session) return null;
    // Deactivation deletes the sessions too; this is belt and braces for a
    // session created in between.
    if (isExpired(session.expiresAt) || session.user.disabledAt) {
      await this.db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
      return null;
    }
    const memberships: Record<string, EnterpriseRole> = Object.fromEntries(
      session.user.memberships.map((m) => [m.enterpriseId, m.role as EnterpriseRole]),
    );
    // An instance admin is an implicit owner of every enterprise (D-21):
    // the scope and the permissions come out of the same map, so nothing
    // downstream has to know the difference.
    if (session.user.instanceRole === 'admin') {
      const all = await this.db.query.enterprises.findMany({ columns: { id: true } });
      for (const e of all) memberships[e.id] ??= 'owner';
    }
    return {
      userId: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      instanceRole: session.user.instanceRole as InstanceRole,
      memberships,
      enterpriseIds: Object.keys(memberships),
    };
  }

  // Issues a one-time link token (D-19). Earlier unused tokens of the same
  // account are revoked: only the newest link works, which is what an admin
  // expects after clicking "new link".
  async issueSetupToken(
    userId: string,
    purpose: SetupTokenPurpose,
    issuedBy: string | null,
  ): Promise<SetupToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.passwordSetupTokens)
        .set({ usedAt: new Date().toISOString() })
        .where(
          and(
            eq(schema.passwordSetupTokens.userId, userId),
            isNull(schema.passwordSetupTokens.usedAt),
          ),
        );
      await tx.insert(schema.passwordSetupTokens).values({
        userId,
        tokenHash: hashToken(token),
        purpose,
        expiresAt,
        issuedBy,
      });
    });
    return { token, expiresAt, purpose };
  }

  // What the setup page shows before asking for a password. Says who the
  // link is for; anything a holder of the link could not already know is
  // not revealed.
  async setupTokenStatus(token: string): Promise<SetupTokenStatus> {
    const row = await this.findUsableSetupToken(token);
    if (!row) return { valid: false, purpose: null, email: null, displayName: null };
    return {
      valid: true,
      purpose: row.purpose as SetupTokenPurpose,
      email: row.user.email,
      displayName: row.user.displayName,
    };
  }

  // Sets the password, burns the token, ends every existing session of the
  // account (whoever prompted the reset may hold one), and signs in.
  async completeSetup(token: string, password: string): Promise<{ user: User; session: Session }> {
    const row = await this.findUsableSetupToken(token);
    if (!row) throw new BadRequestException('This link is invalid, used up, or expired');
    if (row.user.disabledAt) throw new UnauthorizedException(DISABLED_MESSAGE);
    validateNewPassword(password);

    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, row.userId));
      await tx
        .update(schema.passwordSetupTokens)
        .set({ usedAt: new Date().toISOString() })
        .where(eq(schema.passwordSetupTokens.id, row.id));
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, row.userId));
    });
    this.failures.delete(row.user.email);

    return {
      user: {
        id: row.user.id,
        email: row.user.email,
        displayName: row.user.displayName,
        instanceRole: row.user.instanceRole as User['instanceRole'],
      },
      session: await this.createSession(row.userId),
    };
  }

  private async findUsableSetupToken(token: string) {
    if (!token) return null;
    const row = await this.db.query.passwordSetupTokens.findFirst({
      where: (t, { eq: equals }) => equals(t.tokenHash, hashToken(token)),
      with: { user: true },
    });
    if (!row || row.usedAt || isExpired(row.expiresAt)) return null;
    return row;
  }

  private async createSession(userId: string): Promise<Session> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await this.db
      .insert(schema.sessions)
      .values({ tokenHash: hashToken(token), userId, expiresAt });
    return { token, expiresAt };
  }
}
