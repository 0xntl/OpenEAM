// A second OpenEAM next to the one `pnpm dev` runs: its own database, a known
// account and the public example enterprises. It is where anything that
// writes — a manual check, a script, later the browser tests — can run
// without touching the data of the development instance.
//
//   node scripts/test-stack.mjs reset   (pnpm db:test)   drop, create, migrate, seed
//   node scripts/test-stack.mjs start   (pnpm dev:test)  serve it, seeding first if needed
//
// The database is the one in DATABASE_URL with `_test` appended to its name
// (or TEST_DATABASE_URL). The stack listens on 127.0.0.1, not localhost:
// cookies ignore ports, so on localhost signing in here would replace the
// development instance's session in the same browser.
//
// Seeding goes through the API the way a person would — the first account
// signs up and becomes the instance admin, then imports examples/*.json — so
// the seed cannot drift from the rules the API enforces.
//
// Run from anywhere; needs Postgres running and Node 24.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
// Also loads .env.
import { root, testDatabaseUrl } from './test-database.mjs';

const dbRequire = createRequire(join(root, 'packages/db/package.json'));
const webRequire = createRequire(join(root, 'apps/web/package.json'));

const HOST = '127.0.0.1';
const API_PORT = Number(process.env.TEST_API_PORT ?? 4010);
const WEB_PORT = Number(process.env.TEST_WEB_PORT ?? 3010);
const API_URL = `http://${HOST}:${API_PORT}`;
const WEB_URL = `http://${HOST}:${WEB_PORT}`;

// Known on purpose: this account only ever exists in a database this script
// created, and the script refuses any database whose name lacks `_test`.
const ACCOUNT = {
  email: 'admin@openeam.test',
  displayName: 'Test Admin',
  password: 'openeam-test',
};

const API_ENTRY = join(root, 'apps/api/dist/main.js');
const MIGRATE_ENTRY = join(root, 'packages/db/dist/migrate.js');

function fail(message) {
  console.error(`test-stack: ${message}`);
  process.exit(1);
}

// The name and the guard on it live in test-database.mjs, which the test
// suite shares: `reset` drops this database, the suite writes to it.
function guardedDatabaseUrl() {
  try {
    return testDatabaseUrl();
  } catch (error) {
    return fail(error.message);
  }
}

const databaseUrl = guardedDatabaseUrl();
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));

// Connected to the server's maintenance database, since the test database
// may not exist yet and cannot be dropped from within.
async function withMaintenanceClient(run) {
  const { Client } = dbRequire('pg');
  const maintenance = new URL(databaseUrl);
  maintenance.pathname = '/postgres';
  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function databaseExists() {
  return withMaintenanceClient(async (client) => {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    return result.rowCount > 0;
  });
}

async function isUp(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

// The API and the migration runner are used as built. `pnpm dev` keeps both
// current; without it they are built here, once. An existing apps/api/dist is
// never rebuilt: nest clears the folder first, which would pull the files out
// from under a running `pnpm dev`.
function ensureBuilt() {
  const run = (filter) => {
    const result = spawnSync('pnpm', ['--filter', filter, 'build'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    });
    if (result.status !== 0) fail(`building ${filter} failed.`);
  };
  if (!existsSync(MIGRATE_ENTRY)) run('@openeam/db');
  if (!existsSync(API_ENTRY)) run('@openeam/api');
}

// `quiet` drops the start-up log while seeding; errors still come through.
function startApi({ quiet = false } = {}) {
  return spawn(process.execPath, [API_ENTRY], {
    cwd: join(root, 'apps/api'),
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      API_PORT: String(API_PORT),
      WEB_ORIGIN: WEB_URL,
      AUTH_ALLOW_SIGNUP: 'false',
      AUTH_COOKIE_SECURE: 'false',
      TRUST_PROXY: '0',
    },
  });
}

function startWeb() {
  const vite = join(dirname(webRequire.resolve('vite/package.json')), 'bin/vite.js');
  return spawn(
    process.execPath,
    [vite, '--host', HOST, '--port', String(WEB_PORT), '--strictPort'],
    {
      cwd: join(root, 'apps/web'),
      stdio: 'inherit',
      // VITE_API_URL stays empty so the SPA talks to its own origin and the
      // dev server proxies to the test API, as in `pnpm dev`.
      env: { ...process.env, VITE_DEV_API_ORIGIN: API_URL, VITE_API_URL: '' },
    },
  );
}

async function waitForApi(api) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (api.exitCode !== null) fail('the API exited before it became healthy.');
    if (await isUp(`${API_URL}/health`)) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  fail(`the API did not become healthy on ${API_URL}.`);
}

async function seed() {
  const response = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation ($input: SignUpInput!) { signUp(input: $input) { token } }',
      variables: { input: ACCOUNT },
    }),
  });
  const body = await response.json();
  const token = body.data?.signUp?.token;
  if (!token) fail(`creating the account failed: ${JSON.stringify(body.errors ?? body)}`);

  // Top-level files only: examples/private/ holds real enterprises and is
  // never seeded.
  const examples = join(root, 'examples');
  const bundles = readdirSync(examples)
    .filter((name) => name.endsWith('.json'))
    .sort();
  for (const name of bundles) {
    const result = await fetch(`${API_URL}/api/data-exchange/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: readFileSync(join(examples, name)),
    });
    if (!result.ok) fail(`importing ${name} failed: ${result.status} ${await result.text()}`);
    console.log(`test-stack: imported examples/${name}`);
  }
}

async function reset() {
  if (await isUp(`${API_URL}/health`)) {
    fail(`something is serving ${API_URL} — stop \`pnpm dev:test\` first.`);
  }
  ensureBuilt();

  await withMaintenanceClient(async (client) => {
    // Identifiers cannot be bound as parameters; the name is quoted here and
    // was checked above.
    const quoted = `"${databaseName.replaceAll('"', '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
  });
  console.log(`test-stack: created database ${databaseName}`);

  const migrated = spawnSync(process.execPath, [MIGRATE_ENTRY], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
  });
  if (migrated.status !== 0) fail('applying the migrations failed.');

  const api = startApi({ quiet: true });
  try {
    await waitForApi(api);
    await seed();
  } finally {
    api.kill();
  }
  console.log(`test-stack: ${databaseName} is ready — ${ACCOUNT.email} / ${ACCOUNT.password}`);
}

async function start() {
  if (!(await databaseExists())) await reset();
  ensureBuilt();

  const children = [startApi(), startWeb()];
  const stop = () => {
    for (const child of children) child.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // One of them going down takes the other with it, so a failed start does
  // not leave half a stack behind.
  for (const child of children) {
    child.on('exit', (code) => {
      stop();
      process.exitCode ||= code ?? 0;
    });
  }

  await waitForApi(children[0]);
  console.log(
    `\ntest-stack: ${WEB_URL} — sign in as ${ACCOUNT.email} / ${ACCOUNT.password}\n` +
      `            database ${databaseName}; \`pnpm db:test\` resets it.\n`,
  );
}

const command = process.argv[2];
if (command === 'reset') await reset();
else if (command === 'start') await start();
else fail('usage: node scripts/test-stack.mjs reset|start');
