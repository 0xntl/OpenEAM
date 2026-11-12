// The harness's own promises, tested: every other test relies on them, and a
// harness that committed by mistake would wear the seeded database down
// without any test failing.
import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { config } from '../src/config';
import { describe, expect, it } from './harness';

describe('the test harness', () => {
  it('only ever connects to a database whose name ends in _test', () => {
    expect(new URL(inject('databaseUrl')).pathname).toMatch(/_test$/);
    // What the API's own config sees is the same database, not the one in .env.
    expect(config.DATABASE_URL).toBe(inject('databaseUrl'));
  });

  const marker = `rollback-probe-${randomUUID()}`;
  let accountsBefore: number;

  it.beforeAll(async ({ database }) => {
    accountsBefore = (await database.query.users.findMany({ columns: { id: true } })).length;
  });

  it('starts each test without accounts and lets it write', async ({ world }) => {
    expect(await world.db.query.users.findMany()).toEqual([]);

    const enterprise = await world.enterprise();
    await world.enterprises.update(enterprise.owner, enterprise.id, { name: marker });

    const found = await world.db.query.enterprises.findFirst({
      where: (t, { eq }) => eq(t.name, marker),
    });
    expect(found?.id).toBe(enterprise.id);
  });

  it.afterAll(async ({ database }) => {
    // Outside the test's transaction: what it wrote is gone, what it deleted
    // is back.
    const left = await database.query.enterprises.findFirst({
      where: (t, { eq }) => eq(t.name, marker),
    });
    expect(left).toBeUndefined();
    const accountsAfter = await database.query.users.findMany({ columns: { id: true } });
    expect(accountsAfter).toHaveLength(accountsBefore);
  });
});
