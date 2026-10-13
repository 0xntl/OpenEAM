# OpenEAM

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/brand/logo-white.svg">
    <img src="apps/web/public/brand/logo.svg" alt="OpenEAM" height="40">
  </picture>
</p>

Self-hosted, open-source Enterprise Architecture Management.

![The architecture landscape of a fictional SaaS company, showing services nested inside the platforms they run on](docs/images/landscape.png)

Enterprise architecture tools tend to be expensive, hosted by somebody else, and
shaped around a methodology you have to adopt whole. OpenEAM is a small
self-hosted alternative: model what your organization is able to do — its
capabilities, value streams and processes — map that to the systems actually
realizing it, and keep the two connected as both change. Everything is scoped to
an **enterprise**, the scope of one architecture effort, which can be a corporate
group, a single department, or a household.

## The part that makes it different

Every relationship in the model carries a validity interval. So the landscape is
not a picture of today that you edit over time — it is reconstructible for **any
date**, and the `as of` control in the screenshot above is not a filter. Set it to
last year and you see what ran where last year, including the systems that have
since been retired.

That turns questions architects normally answer from memory into questions the
model answers: *what is still running on the platform we are switching off, and
what breaks if we do?*

## What works today

Business capabilities, value streams with stages, and business processes with
real BPMN modelling. An architecture landscape of building blocks — split into
architecture building blocks (the need) and solution building blocks (the product
meeting it) — with typed relationships between them (*depends on*, *exchanges data
with*, *runs on*), automatic diagram layout, and export/import of a whole
enterprise as a JSON bundle. A building block can carry an icon, a product's
logo or a generic glyph, served by the instance itself.

Accounts and sign-in are built in: people sign in with an email and password,
each enterprise is visible only to its members, and the first account is the
instance admin who creates further accounts and decides who reaches which
enterprise. Within an enterprise, members are owners, editors or viewers. The
admin can give the instance its own name and logo. See
[docs/BACKLOG.md](docs/BACKLOG.md) for what else is known to be missing.

## Run it

### Self-hosted, with Docker

```bash
cp .env.example .env   # set POSTGRES_PASSWORD; OPENEAM_PORT if 8080 is taken
docker compose --profile app up -d --build
```

Open http://localhost:8080 and create the first account — it becomes the
instance admin. From its Administration page you create accounts for
colleagues (each gets a one-time setup link to choose their own password) or
open sign-up, and give each account its enterprises and roles. Owners can
also add people from the enterprise's edit sheet. Set
`AUTH_COOKIE_SECURE=true` once the instance is behind TLS.

### For development

Needs Node 24 and pnpm 12 (`.node-version` pins Node; we use
[fnm](https://github.com/Schniz/fnm)), plus Docker for Postgres.

```bash
cp .env.example .env
pnpm install
docker compose up -d   # Postgres only
pnpm db:migrate
pnpm dev
```

- Web: http://localhost:3000
- GraphQL: http://localhost:4000/graphql (GraphiQL is on outside production)

## See it with data

Two example models live in [examples/](examples/). Sign in once to get a token,
then `POST` either to `/api/data-exchange/import`:

```bash
TOKEN=$(curl -s http://localhost:4000/graphql -H "Content-Type: application/json" \
  -d '{"query":"mutation { signIn(input:{email:\"you@example.com\", password:\"…\"}) { token } }"}' \
  | jq -r .data.signIn.token)

curl -X POST http://localhost:4000/api/data-exchange/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @examples/alderbrook.json
```

The importing account becomes a member of every enterprise in the bundle; an
enterprise that already exists can only be replaced by one of its members.

[`household.json`](examples/household.json) is the smallest model that still
demonstrates the metamodel — a family household as an enterprise.
[`alderbrook.json`](examples/alderbrook.json) is a fictional SaaS company, large
enough to be worth navigating and mid-way through a platform migration, so moving
the `as of` date visibly changes what you see.

Import replaces only the enterprises a bundle contains; other enterprises are left
untouched.

## Documentation

**Why and what next** — [VISION.md](docs/VISION.md) for where this is headed,
[USE-CASES.md](docs/USE-CASES.md) for what's being built next and why that first,
broken into stories in [USER-STORIES.md](docs/USER-STORIES.md).

**How it's built** — [ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the codebase and
lists the invariants the model depends on; [DATABASE.md](docs/DATABASE.md) is the
schema, table by table. [GLOSSARY.md](docs/GLOSSARY.md) defines
every EAM term as this codebase uses it. [DECISIONS.md](docs/DECISIONS.md) records
the choices that are deliberate, and why.

**What's known and what's merely possible** — [BACKLOG.md](docs/BACKLOG.md) for
defects and committed work, [IDEAS.md](docs/IDEAS.md) for the parking lot.

Contributions welcome — start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

NestJS + GraphQL (Apollo Server) · React + Vite + TanStack Router · Postgres +
Drizzle · TypeScript · pnpm workspaces · Biome.

```
apps/api     NestJS backend — GraphQL, sessions, data exchange, icons, /health
apps/web     React + Vite SPA
packages/db  Drizzle schema, migrations, connection
examples/    Importable example models
```

## License

[Apache-2.0](LICENSE)

Bundled icon sets: [Lucide](https://lucide.dev) (ISC) and
[Simple Icons](https://simpleicons.org) (CC0 1.0). CC0 covers the SVGs, not
the trademarks; logos only identify the systems a model names.
