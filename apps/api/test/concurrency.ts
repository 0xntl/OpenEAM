// What a test of two requests at once gets: the real services over a
// database of its own, where what they write is committed.
//
// The harness (harness.ts) cannot do this. It runs a test inside one
// transaction on one connection, and two requests on one connection are
// never at the same time; on two connections, the second could not see the
// accounts the test made in the first. So a file built on this one creates
// a scratch database next to the test database, applies the migrations to
// it, and drops it when the file is done. Its name ends in `_test` like the
// test database's, and it starts empty: no seed, no accounts. The test
// database itself is not touched.
//
//   const scratch = useScratchDatabase();
//   it('…', async () => { const world = scratch.world(); … });
//
// Each test starts by emptying the scratch database, so tests in one file
// stay independent of each other and of their order.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { applyMigrations, createDatabase, type Database, schema } from '@openeam/db';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { AdminService } from '../src/admin/admin.service';
import { AuthService } from '../src/auth/auth.service';
import type { EnterpriseRole } from '../src/auth/policy';
import type { InstanceRole, Principal } from '../src/auth/principal';
import { EnterprisesService } from '../src/enterprises/enterprises.service';

type Pool = ReturnType<typeof createDatabase>['pool'];

export class ScratchWorld {
  readonly auth: AuthService;
  readonly admin: AdminService;
  readonly enterprises: EnterprisesService;
  private readonly tokens = new Map<string, string>();

  constructor(
    readonly db: Database,
    private readonly pool: Pool,
  ) {
    this.auth = new AuthService(db);
    this.admin = new AdminService(db, this.auth);
    this.enterprises = new EnterprisesService(db);
  }

  // A new account, signed in, as in the harness. The password hash is not a
  // real one: nobody signs in with it, it only has to be there, because an
  // account without a password is not an active admin (INV-17).
  async account(instanceRole: InstanceRole = 'user'): Promise<Principal> {
    const email = `${randomUUID()}@example.test`;
    const token = randomBytes(32).toString('base64url');
    const [user] = await this.db
      .insert(schema.users)
      .values({ email, displayName: email, instanceRole, passwordHash: 'not-a-real-hash' })
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

  async nextRequest(who: Pick<Principal, 'userId'>): Promise<Principal> {
    const token = this.tokens.get(who.userId);
    const principal = token ? await this.auth.resolveSession(token) : null;
    if (!principal) throw new Error(`account ${who.userId} has no valid session`);
    return principal;
  }

  // An enterprise owned by a new account, with further members in the given
  // roles. Returns the principals as they are after everyone was added.
  async enterprise(...roles: EnterpriseRole[]): Promise<{ id: string; members: Principal[] }> {
    const owner = await this.account();
    const { id } = await this.enterprises.create(owner, { name: `Enterprise ${randomUUID()}` });
    const members = [owner];
    for (const role of roles) {
      const account = await this.account();
      await this.enterprises.addMember(owner, id, account.email, role);
      members.push(account);
    }
    return { id, members: await Promise.all(members.map((m) => this.nextRequest(m))) };
  }

  // Starts every request at once while another connection holds `lock`
  // (a SELECT … FOR UPDATE on the rows the rule in question is about), and
  // lets go only when each of them is waiting on a lock. Each has then read
  // whatever it reads before it writes; nothing has been written yet. Then
  // they go on, in whatever order Postgres lets them, and the outcomes come
  // back in the order the requests were given.
  //
  // This is what makes the race certain rather than likely. A service that
  // checks without a lock reads past the held rows and stops only at its
  // write, after deciding on what it read; one that locks stops at the read
  // and decides once the other request is done.
  async race(
    lock: { sql: string; params?: unknown[] },
    requests: Array<() => Promise<unknown>>,
  ): Promise<PromiseSettledResult<unknown>[]> {
    const holder = await this.pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(lock.sql, lock.params);
      const outcomes = Promise.allSettled(requests.map((request) => request()));
      try {
        await this.untilWaiting(requests.length);
      } finally {
        await holder.query('COMMIT');
      }
      return await outcomes;
    } finally {
      holder.release();
    }
  }

  private async untilWaiting(count: number): Promise<void> {
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await this.pool.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      const waiting = rows[0]?.waiting ?? 0;
      if (waiting >= count) return;
      if (Date.now() > deadline) {
        throw new Error(`only ${waiting} of ${count} requests came to wait on the held rows`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

// Creates the scratch database before the file's tests, empties it before
// each one, and drops it after the last. The returned object hands out the
// world of the test that is running.
export function useScratchDatabase(): { world(): ScratchWorld } {
  const url = new URL(inject('databaseUrl'));
  // `openeam_test` becomes `openeam_concurrency_test`: still `_test`, so the
  // guard in scripts/test-database.mjs would accept it, and never the
  // database `pnpm db:test` seeds.
  const name = `${decodeURIComponent(url.pathname.slice(1)).replace(/_test$/, '')}_concurrency_test`;
  const quoted = `"${name.replaceAll('"', '""')}"`;
  url.pathname = `/${encodeURIComponent(name)}`;
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';

  async function onServer(sql: string): Promise<void> {
    const { pool: server } = createDatabase({ connectionString: maintenance.toString(), max: 1 });
    try {
      await server.query(sql);
    } finally {
      await server.end();
    }
  }

  let world: ScratchWorld | undefined;
  let pool: Pool | undefined;

  beforeAll(async () => {
    // A run that was killed may have left one behind.
    await onServer(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await onServer(`CREATE DATABASE ${quoted}`);
    const created = createDatabase({ connectionString: url.toString(), max: 6 });
    pool = created.pool;
    await applyMigrations(created.db);
    world = new ScratchWorld(created.db, created.pool);
  });

  beforeEach(async () => {
    await pool?.query('TRUNCATE users, enterprises CASCADE');
  });

  afterAll(async () => {
    await pool?.end();
    await onServer(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
  });

  return {
    world() {
      if (!world) throw new Error('the scratch database is not set up');
      return world;
    },
  };
}
