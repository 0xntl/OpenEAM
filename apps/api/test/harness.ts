// What a test of the API gets: the real services over a real Postgres, in a
// transaction that is rolled back when the test ends.
//
//   import { expect, it } from '../harness';
//   it('…', async ({ world }) => { … world.buildingBlocks.create(…) … });
//
// Nothing a test writes is ever committed. That is what makes tests
// independent of each other and of their order, lets them rearrange things
// that are instance-wide (who the admins are), and leaves the seeded test
// database exactly as `pnpm db:test` made it — also when a run is killed
// half way. The services are built by hand around the transaction, not by
// Nest: their own `db.transaction()` calls become savepoints inside it, which
// roll back the same way. The reasoning is D-28 in docs/DECISIONS.md.
//
// Each test starts on an instance that has no accounts but still holds the
// seeded example enterprises. They are bystanders on purpose: other people's
// data that a test's own accounts must never see or touch.
//
// Not reached from here, and so not tested by anything built on this:
// resolvers, the AuthGuard and everything else that needs an HTTP request;
// behaviour that depends on two connections (races between requests); and
// DbModule's own wiring, which `pnpm db:test` exercises by booting the API.
//
// One connection also means one query at a time. Await service calls one
// after the other in a test; started together, their savepoints interleave.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createDatabase, type Database, schema } from '@openeam/db';
import { test as base, inject } from 'vitest';
import { ActorsService } from '../src/actors/actors.service';
import { AdminService } from '../src/admin/admin.service';
import { ArchitectureDomainsService } from '../src/architecture-domains/architecture-domains.service';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/auth/password';
import type { EnterpriseRole } from '../src/auth/policy';
import type { InstanceRole, Principal } from '../src/auth/principal';
import { BuildingBlocksService } from '../src/building-blocks/building-blocks.service';
import { BusinessCapabilitiesService } from '../src/business-capabilities/business-capabilities.service';
import { BusinessProcessesService } from '../src/business-processes/business-processes.service';
import { DataExchangeService } from '../src/data-exchange/data-exchange.service';
import { EnterprisesService } from '../src/enterprises/enterprises.service';
import { InformationObjectsService } from '../src/information-objects/information-objects.service';
import { OrganizationUnitsService } from '../src/organization-units/organization-units.service';
import { ValueStreamsService } from '../src/value-streams/value-streams.service';

export { describe, expect } from 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    // Set in vitest.config.mts from scripts/test-database.mjs, whose guard
    // refuses any database whose name does not end in `_test`.
    databaseUrl: string;
  }
}

// One hash for every account the tests create; see World.account().
let hashed: Promise<string> | undefined;
function somePassword(): Promise<string> {
  hashed ??= hashPassword(randomBytes(24).toString('base64url'));
  return hashed;
}

// An enterprise as a test needs it: its id, who owns it, and the four
// default architecture domains every new enterprise is seeded with.
export interface TestEnterprise {
  id: string;
  owner: Principal;
  domainIds: string[];
}

export class World {
  readonly auth: AuthService;
  readonly admin: AdminService;
  readonly enterprises: EnterprisesService;
  readonly architectureDomains: ArchitectureDomainsService;
  readonly organizationUnits: OrganizationUnitsService;
  readonly buildingBlocks: BuildingBlocksService;
  readonly capabilities: BusinessCapabilitiesService;
  readonly processes: BusinessProcessesService;
  readonly informationObjects: InformationObjectsService;
  readonly actors: ActorsService;
  readonly valueStreams: ValueStreamsService;
  readonly dataExchange: DataExchangeService;
  // Session tokens by account id: what each account's browser would hold.
  private readonly tokens = new Map<string, string>();

  // `db` is the open transaction. Tests use it directly for two things only:
  // rows the API has no way to write (organization units, say), and going
  // around a service to ask Postgres itself.
  constructor(readonly db: Database) {
    this.auth = new AuthService(db);
    this.admin = new AdminService(db, this.auth);
    this.enterprises = new EnterprisesService(db);
    this.architectureDomains = new ArchitectureDomainsService(db);
    this.organizationUnits = new OrganizationUnitsService(db);
    this.buildingBlocks = new BuildingBlocksService(db);
    this.capabilities = new BusinessCapabilitiesService(db);
    this.processes = new BusinessProcessesService(db);
    this.informationObjects = new InformationObjectsService(db);
    this.actors = new ActorsService(db);
    this.valueStreams = new ValueStreamsService(db);
    this.dataExchange = new DataExchangeService(db);
  }

  // A new account, signed in. The account and its session are written as
  // rows: going through sign-up or a setup link would cost a password hash
  // (scrypt, ~100 ms) per account in every test, and how an account comes to
  // exist is tested where that is the subject. What the account may do is
  // real — the principal comes out of the session the way AuthGuard gets it.
  // It has a password, hashed once for all of them, because an account
  // without one is not an active admin (INV-17).
  async account(instanceRole: InstanceRole = 'user'): Promise<Principal> {
    const email = `${randomUUID()}@example.test`;
    const token = randomBytes(32).toString('base64url');
    const [user] = await this.db
      .insert(schema.users)
      .values({ email, displayName: email, instanceRole, passwordHash: await somePassword() })
      .returning({ id: schema.users.id });
    if (!user) throw new Error('user insert returned no row');
    await this.db.insert(schema.sessions).values({
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    this.tokens.set(user.id, token);
    return this.nextRequest({ userId: user.id });
  }

  // The same account on its next request. A principal is a snapshot taken
  // when the request came in; after a membership or a role has changed, this
  // is how a test sees what the account is allowed from then on.
  async nextRequest(who: Pick<Principal, 'userId'>): Promise<Principal> {
    const token = this.tokens.get(who.userId);
    const principal = token ? await this.auth.resolveSession(token) : null;
    if (!principal) throw new Error(`account ${who.userId} has no valid session`);
    return principal;
  }

  // An enterprise created the way the UI creates one, by a new account or by
  // `owner`. Pass the owner of another enterprise to get one principal who
  // is a member of both, for rules about links that would cross between them.
  async enterprise(owner?: Principal): Promise<TestEnterprise> {
    const principal = owner ?? (await this.account());
    const created = await this.enterprises.create(principal, {
      name: `Enterprise ${randomUUID()}`,
    });
    const domains = await this.architectureDomains.findAll(principal, created.id);
    return { id: created.id, owner: principal, domainIds: domains.map((d) => d.id) };
  }

  // A new account that the enterprise's owner adds as a member.
  async member(enterprise: TestEnterprise, role: EnterpriseRole): Promise<Principal> {
    const account = await this.account();
    await this.enterprises.addMember(enterprise.owner, enterprise.id, account.email, role);
    return this.nextRequest(account);
  }

  // Organization units come in through a bundle only; the API has no
  // mutation for them, so a test that needs one writes the row.
  async organizationUnit(enterpriseId: string): Promise<string> {
    const [unit] = await this.db
      .insert(schema.organizationUnits)
      .values({ enterpriseId, name: `Unit ${randomUUID()}` })
      .returning({ id: schema.organizationUnits.id });
    if (!unit) throw new Error('organization unit insert returned no row');
    return unit.id;
  }

  // Runs `statement` in a savepoint and returns the name of the constraint
  // Postgres refused it with, or null if it went through. Without the
  // savepoint a refused statement would abort the whole test transaction.
  async constraintViolatedBy(
    statement: (db: Database) => Promise<unknown>,
  ): Promise<string | null> {
    try {
      await this.db.transaction((savepoint) => statement(savepoint as unknown as Database));
      return null;
    } catch (error) {
      for (let e = error as PgError | undefined; e; e = e.cause) {
        if (e.constraint) return e.constraint;
      }
      throw error;
    }
  }
}

interface PgError {
  constraint?: string;
  cause?: PgError;
}

class Rollback extends Error {}

export const it = base.extend<{
  $file: { database: Database };
  $test: { world: World };
}>({
  // One connection per test file: a transaction lives on one connection, and
  // a second one could not see what the test has written.
  database: [
    // biome-ignore lint/correctness/noEmptyPattern: Vitest requires the destructuring pattern.
    async ({}, use) => {
      const { db, pool } = createDatabase({ connectionString: inject('databaseUrl'), max: 1 });
      await use(db);
      await pool.end();
    },
    { scope: 'file' },
  ],
  world: async ({ database }, use) => {
    try {
      await database.transaction(async (tx) => {
        // A transaction handle is a Database in everything the services use.
        const db = tx as unknown as Database;
        // No accounts to begin with, whatever the seed or a person put there;
        // sessions, memberships and setup links go with them.
        await db.delete(schema.users);
        await use(new World(db));
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  },
});
