import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { enterprises } from './enterprises';
import { bytea, timestamps } from './helpers';

// Instance-level role, separate from anything inside an enterprise. An admin
// runs the instance — accounts, sign-up, who may reach which enterprise — but
// reads an enterprise's model only as a visible member of it (D-17). The
// first account ever created is an admin.
export const instanceRole = pgEnum('instance_role', ['admin', 'user']);

// Who can sign in. Local accounts with a password hash, deliberately not an
// external identity provider yet — see docs/DECISIONS.md D-15. The email is
// stored lowercased and is the login name; displayName is what the UI shows.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    // scrypt, self-describing (`scrypt$N$r$p$salt$hash`) so parameters can be
    // raised later without a migration — see apps/api/src/auth/password.ts.
    // Null until the person has set one through a setup link (D-19); such an
    // account cannot sign in yet.
    passwordHash: text('password_hash'),
    instanceRole: instanceRole('instance_role').notNull().default('user'),
    // Set when an admin deactivates the account: it keeps its memberships and
    // history but cannot sign in. Deactivation is the normal way to off-board;
    // deletion is for accounts that should never have existed.
    disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    // The login name is compared case-insensitively by storing it lowercased;
    // the database makes sure nothing else ever gets in.
    check('users_email_lowercase_check', sql`${t.email} = lower(${t.email})`),
  ],
);

// Why a token exists: `setup` for a new account that has no password yet,
// `reset` for one whose password is being replaced. Both end the same way —
// the person sets a password through the link — but the admin page words
// them differently.
export const setupTokenPurpose = pgEnum('setup_token_purpose', ['setup', 'reset']);

// One-time links through which a person sets their own password (D-19).
// Issued by an admin (or, later, by an email flow), handed over out of band,
// valid for a few days, usable once. Only the token's hash is stored, like
// sessions. Using the link ends every other session of the account.
export const passwordSetupTokens = pgTable(
  'password_setup_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: setupTokenPurpose('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    issuedBy: uuid('issued_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index('password_setup_tokens_user_id_idx').on(t.userId)],
);

// Instance-wide settings an admin changes at runtime. One row, id
// 'instance'; AUTH_ALLOW_SIGNUP only seeds it the first time.
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: text('id').primaryKey(),
    // Whether anyone with the URL may create an account. The first account can
    // always be created regardless.
    signUpOpen: boolean('sign_up_open').notNull().default(false),
    // Instance branding (D-23): the name people see on this instance; null
    // means the product's own. The images are in instance_assets.
    name: text('name'),
    ...timestamps,
  },
  // A singleton: the check is what makes it one.
  (t) => [check('instance_settings_singleton_check', sql`${t.id} = 'instance'`)],
);

// The images of the instance branding (D-23), one row per slot: the logo,
// an optional variant for dark backgrounds, and a square icon for the
// favicon and the collapsed sidebar. Stored here rather than on disk so a
// database backup carries them and the API container stays stateless; each
// is at most 512 KB and the browser caches it by version (updated_at).
export const instanceAssetKind = pgEnum('instance_asset_kind', ['logo', 'logo_dark', 'icon']);

export const instanceAssets = pgTable('instance_assets', {
  kind: instanceAssetKind('kind').primaryKey(),
  bytes: bytea('bytes').notNull(),
  mime: text('mime').notNull(),
  ...timestamps,
});

// Server-side sessions. The browser cookie (or a script's bearer header)
// carries a random token; only its SHA-256 is stored here, so a leaked
// database dump does not hand out live sessions. Deleting the row is logout.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

// What a member may do inside an enterprise (D-20). Three fixed roles,
// each a bundle of permissions from the catalogue in
// apps/api/src/auth/policy.ts: owner (everything, including members and
// deletion), editor (models), viewer (reads). Fixed on purpose: a role
// builder is a complexity sink; the permission catalogue is what would make
// custom roles possible later without touching a service.
export const enterpriseRole = pgEnum('enterprise_role', ['owner', 'editor', 'viewer']);

// Which users may reach which enterprise, and as what. A non-member sees
// nothing of an enterprise (INV-16); a member's role says what they may
// change. There is always at least one owner (INV-18).
export const enterpriseMembers = pgTable(
  'enterprise_members',
  {
    enterpriseId: uuid('enterprise_id')
      .notNull()
      .references(() => enterprises.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: enterpriseRole('role').notNull().default('editor'),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.enterpriseId, t.userId] }),
    index('enterprise_members_user_id_idx').on(t.userId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(enterpriseMembers),
  setupTokens: many(passwordSetupTokens),
}));

export const passwordSetupTokensRelations = relations(passwordSetupTokens, ({ one }) => ({
  user: one(users, { fields: [passwordSetupTokens.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const enterprisesMembersRelations = relations(enterprises, ({ many }) => ({
  members: many(enterpriseMembers),
}));

export const enterpriseMembersRelations = relations(enterpriseMembers, ({ one }) => ({
  enterprise: one(enterprises, {
    fields: [enterpriseMembers.enterpriseId],
    references: [enterprises.id],
  }),
  user: one(users, { fields: [enterpriseMembers.userId], references: [users.id] }),
}));
