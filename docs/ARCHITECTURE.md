# Architecture

How OpenEAM is built, for someone about to change it. [VISION.md](VISION.md) says
what it is for; this says where things are and which rules must hold.

If you only read one section, read [Invariants](#invariants). They are the rules
the model would silently lie about if broken, and they are what automated checks
exist to protect.

## Shape

A pnpm workspace, three packages, ~21,000 lines.

| Package | What it is | Size |
| --- | --- | --- |
| `packages/db` | Drizzle schema, migrations, client, startup migrator. The metamodel lives here. | ~1,100 lines |
| `apps/api` | NestJS + Apollo. Code-first GraphQL, three REST controllers (export/import, icons, branding), sessions, admin. | ~6,300 lines |
| `apps/web` | React 19 + Vite + TanStack Router SPA. | ~13,900 lines |

For development, Postgres runs in Compose and both apps run from `pnpm dev`.
For self-hosting, `docker compose --profile app up` adds an API container
(applies migrations, then starts) and a web container (nginx serving the SPA and
proxying `/graphql`, `/health` and `/api` to the API, so the browser sees one
origin). A public instance runs the same two images, published by CI, from
`deploy/compose.yml` behind Caddy. See [Deploying](#deploying).

## The metamodel (`packages/db`)

25 tables and 12 enums across eleven schema files, one per subject area.
[DATABASE.md](DATABASE.md) lists every table, column, constraint and index, and
which invariants the database enforces itself. Read the comments in
`packages/db/src/schema/` before changing anything there — they explain *why*
each shape was chosen, and several of them encode decisions recorded in
[DECISIONS.md](DECISIONS.md).

The vocabulary — ABB, SBB, realization, value stream, architecture domain — is
defined in [GLOSSARY.md](GLOSSARY.md). It is TOGAF's, used deliberately; getting
a term wrong in code is a real defect here, not a style preference.

Three structural things worth knowing up front:

**One table for both building block kinds.** `building_blocks` holds ABBs and
SBBs, discriminated by `kind`, so every relationship table has a single foreign
key target. `architecture_level` is meaningful only for `kind = 'architecture'`.

**Temporal relationships are append-and-close, not update.** When an assignment
changes, the existing row is closed by setting `valid_to` and a new row is
inserted. That is what lets the landscape be reconstructed for any date. It
applies to `building_block_organization_units`, `building_block_realizations`,
`building_block_capabilities`, `building_block_relationships`,
`capability_information` and `capability_actors`.

**Classification is not history.** `building_block_architecture_domains`
deliberately has no validity interval — it is a replace-all set. Whether that is
the right call is an open question; see [DECISIONS.md](DECISIONS.md).

Migrations are generated with `pnpm db:generate` and applied with
`pnpm db:migrate`. One baseline is committed (D-18); every change from the
first release on is a new one. The API container applies them on startup
through `packages/db/src/migrate.ts` (drizzle-orm's runtime migrator, same
files, no drizzle-kit in the image). Generated files under
`packages/db/drizzle/meta/` are formatted by drizzle-kit and still have to pass
repo-wide Biome — run `pnpm lint` at the root, never a scoped check.

## The API (`apps/api`)

Eleven feature modules, each `*.module.ts` / `*.service.ts` / `*.resolver.ts` /
`*.model.ts`, plus `auth/` (sessions, guard), `admin/` (instance administration,
branding) and `icons/` (the icon endpoint, REST, below). Services own the business rules;
resolvers are thin.

Environment is read once, in `config.ts`, through a zod schema; a wrong or
missing variable fails at startup with the offending name, not at the first
request. GraphiQL and introspection are on only outside `NODE_ENV=production`.

### Who is asking

Every resolver and controller sits behind a global guard (`auth/auth.guard.ts`)
unless marked `@Public()` — that is `ping`, `/health`, `authStatus`, `me`, and
the sign-in/sign-up mutations. The guard resolves the session once per request
and attaches a **Principal** (`auth/principal.ts`) to it: the user plus the ids
of every enterprise they are a member of.

Accounts are local (email + scrypt-hashed password, no external identity
provider yet — [DECISIONS.md](DECISIONS.md) D-15) and carry an **instance
role**: the first account ever created is `admin`, everyone after is `user`
until an admin says otherwise (D-17). `admin/` holds what admins can do:
accounts (create, deactivate, promote, delete, issue a setup link) and the
runtime sign-up switch and the instance name in `instance_settings`, the
branding images in `instance_assets` (D-23; `admin/branding.controller.ts`
serves them at `GET /api/branding/{logo,logo-dark,icon}` and takes `PUT`
uploads, bytes in the body; `authStatus` carries name and image versions, so
the sign-in page is branded before anyone signs in). Inside enterprises an admin is
an implicit owner of every one (D-21) — the session resolver adds those
memberships, so the rest of the code sees an ordinary owner. An admin never
sets or sees a password: a new account has none
until its person opens the one-time **setup link** (`/setup?token=…`, public,
seven days, single use) and chooses one, and a forgotten password is recovered
the same way (D-19, `password_setup_tokens`). Admin-only resolvers are marked `@AdminOnly()`, checked by the
same guard. An admin does *not* read an enterprise's model by virtue of the
role; they grant themselves membership, which every member of that enterprise
can see. A session is a random token
whose SHA-256 is stored in `sessions`; the token travels in an httpOnly,
SameSite=Lax cookie for the browser, or as `Authorization: Bearer …` for
scripts. Sign-out deletes the row. Sign-in and sign-up are rate-limited per
client address.

Services take the principal as their first argument and scope every read by
`principal.enterpriseIds` (INV-16). List queries that name an enterprise call
`assertEnterpriseAccess()` and get a 403; lookups by id fold the membership
check into the where clause, so an id from someone else's enterprise reads as
not found rather than as forbidden. Rows without an `enterprise_id` of their
own (links, relationships) are scoped through their parent.

Writes go one step further (D-20). `auth/policy.ts` holds the **permission
catalogue** — `model.read`, `model.write`, `data.export`, `data.import`,
`enterprise.update`, `enterprise.delete`, `members.manage` — and the three
**roles** that bundle it: owner (all), editor (read, write, export), viewer
(read, export). A membership carries a role; every mutation calls
`assertCan(principal, permission, enterpriseId)` and never asks about a role,
so the bundles are the only place a role means anything. The web reads the
caller's `myPermissions` off the enterprise and hides what would fail.

GraphQL is **code-first**: models carry decorators and Nest generates the SDL at
runtime into `apps/api/schema.gql` (~640 lines), which is committed so schema
changes are visible in a diff. If you change a model, the SDL changes — commit it.

`data-exchange` is the odd module out: a REST controller (`GET /api/data-exchange/export`,
`POST /api/data-exchange/import`; "Export & Import" in the UI) for the data
bundle, a snapshot of whole enterprises (D-24). A bundle carries a
`formatVersion`; import brings an older bundle up to the current version
through the migration chain in `data-bundle.format.ts`, refuses one written by
a newer OpenEAM, and only then validates it against the zod schema in
`data-bundle.schema.ts`, which therefore describes exactly one shape. Export
stamps `exportedAt` and `generator` on the bundle. Export without a parameter
returns the caller's enterprises, not the whole database, and every query is
scoped in the database (child and link rows through subqueries on their
parents), so an export reads only what it returns. Import replaces exactly the
enterprises carried in the bundle and touches nothing else; an enterprise that
already exists may only be replaced by one of its members, and memberships
survive the replace (they describe the instance, not the model, so they are not
in the bundle).

`icons` is the other REST module, public like `/health`:
`GET /api/icons/collections`, `/api/icons/search?q=…` for the picker, and
`/api/icons/{prefix}.json?icons=a,b` in the Iconify API's format, so
`@iconify/react` treats this API as its icon server. The sets live in memory;
`icons/icon-id.ts` holds the allowlist that mutations and the importer check
(D-22).

### Where the rules live

Service methods enforce the invariants below, one row at a time. The importer
does not go through the services — a bundle is a snapshot, and replaying it as
edits would lose ids and timestamps ([DECISIONS.md](DECISIONS.md) D-16) — so it
runs `data-bundle.validator.ts` over the whole bundle before the transaction:
every row must belong to one of the bundle's own enterprises, every reference
must land inside the bundle and in the same enterprise, and the temporal and
structural invariants (INV-1 … INV-15) are checked with the same functions the
services use, from `common/invariants.ts`. All violations come back in one
response, each with table and id. Inside the transaction, after the bundle's
enterprises are deleted and before anything is inserted, ids are checked
against what remains in the database (INV-10): a collision with another
enterprise is a readable 400 naming the id, and the transaction rolls back.

### Security measures, and what each one is for

- **Sessions** — random 32-byte token, SHA-256 stored, 30-day expiry, deleted
  on sign-out and swept per account on sign-in. Cookie is httpOnly and
  SameSite=Lax; `AUTH_COOKIE_SECURE` adds Secure behind TLS.
- **CSRF** — three independent layers: the SameSite cookie, Apollo's
  preflight requirement (no `text/plain` or GET mutations, batching off), and
  `auth/origin-check.ts`, which refuses any state-changing request whose
  `Origin` is neither `WEB_ORIGIN` nor the API's own host.
- **Brute force** — `@nestjs/throttler` per client address on sign-in and
  sign-up (10/min), plus an in-memory per-account lockout (10 failures in 15
  minutes) that does not depend on the address, because `X-Forwarded-For` can
  be forged by a client on a trusted network. `TRUST_PROXY` says how many
  proxy hops to believe; 0 ignores the header.
- **Enumeration** — wrong password and unknown account produce the same
  message and comparable timing (a throwaway hash is verified when the account
  does not exist). Sign-up does reveal whether an email is taken, but only
  while sign-up is open.
- **Headers** — `helmet` on the API (CSP only in production, GraphiQL needs
  a CDN in dev), and nosniff / frame-deny / referrer / permissions headers on
  the nginx in front of the SPA. The SPA has no CSP yet; see BACKLOG.
- **Production** — GraphiQL and introspection off, stack traces out of error
  responses, body limit 5 MB, the API not published outside the Compose
  network. In the `deploy/` shape nothing but Caddy is published at all: it
  terminates TLS, sets HSTS for the SPA (helmet sets it for the API), and the
  API runs with `TRUST_PROXY=2` (Caddy, then nginx).

What is deliberately *not* done, and why, is in [DECISIONS.md](DECISIONS.md)
D-15. Tests for these measures are the point of roadmap T1.3/T1.4; until then
the checks are a script run by hand (see the commit that introduced them).


## The web app (`apps/web`)

- **Routing** — TanStack Router, file-based in `src/routes/`. `$param` files are
  detail routes; `$param_.model.tsx` is the BPMN modeller. The route tree is
  generated (`pnpm --filter @openeam/web exec tsr generate`), so a new file is a
  new route.
- **Index + detail + form sheet** is the shape every entity follows: a list page
  with a create button, a detail page, and one shared `*-form-sheet.tsx` the list
  opens in create mode and the detail page opens in edit mode. `actors` and
  `information-objects` are the most recent pair to copy from.
- **Every detail page reads the same way**: `PageHeader` (back link, title,
  badge, Edit/Delete), description, a row of `Fact` chips, then `TitledCard`s
  with rows in the shared item style and an `EmptyState` when empty. The
  pieces live in `components/ui/page-header.tsx`; a new page composes them.
- **Deleting** evicts the row from the Apollo cache in the mutation's `update`,
  then `cache.gc()` — without it, navigating back shows a list still containing
  the deleted row.
- **Data** — Apollo Client against `/graphql`, proxied by Vite in dev, with
  `credentials: 'include'` so the session cookie travels. An `UNAUTHENTICATED`
  error from any operation other than sign-in tells `lib/auth.tsx` the session
  is gone, which re-reads `me` and drops back to the sign-in page.
- **Session gate** — `routes/__root.tsx` renders the sign-in page until `me`
  returns a user, then the shell. No redirect, so the URL someone opened
  survives signing in. `EnterpriseProvider` lives below the gate.
- **Feedback and navigation** — `lib/toast.tsx` (bottom-right toasts for
  saves, deletes and the errors of button-triggered mutations, fed by the
  Apollo error link), `lib/confirm.tsx` (one promise-based confirmation dialog
  for everything destructive; nothing calls the browser's own `confirm`), and
  `components/command-palette.tsx` (⌘K / Ctrl+K: pages and every object of
  the current enterprise, fuzzy-matched). Lists load as skeletons
  (`ui/skeletons.tsx`) and show an `EmptyCard` with the first step when empty.
- **Enterprise scope** — `src/lib/enterprise.tsx` holds the selected enterprise in
  a context, persisted in `localStorage` under `enterpriseId`. Every scoped page
  reads it.
- **Landscape diagram** — React Flow (`@xyflow/react`) as the canvas, elkjs
  for the layout (D-25). `components/landscape/landscape-graph.ts` is the
  data side: viewpoint filtering, `hosted_on` as containment, the elk layout
  and its orthogonal edge routes, no DOM. `landscape-flow.tsx` draws it:
  nodes are React components (model icons, tooltips and theme tokens are the
  app's own), edges follow elk's route until an endpoint is dragged, then the
  node handles. Recomputed on every load; positions are not persisted.
- **Process diagrams** — bpmn-js. Here the diagram *is* the source of truth:
  `bpmn_xml` is stored, and `process_steps` are re-synced from it on every save.
- **Branding** — `components/brand/brand.tsx`: `Brand` (the uploaded logo,
  its dark variant on a dark page, or the product's mark and name),
  `BrandIcon` (the collapsed sidebar's trigger), `BrandLoader` (the mark
  animated, for the splash and lazily loaded diagrams), `PoweredBy`, and
  `useDocumentBranding` for tab title and favicon. `lib/auth.tsx` derives
  `branding` from `authStatus` (D-23). No page spells out "OpenEAM" itself.
- **Icons** — UI icons from `lucide-react` only (D-7). Model icons, the icon a
  person picks for a building block, are Iconify ids drawn by
  `components/icons/model-icon.tsx` and chosen in `icon-picker.tsx`;
  `lib/icons.ts` points `@iconify/react` at `/api/icons` and gives the
  landscape renderer raw SVG from the same cache (D-22).
- **Sidebar** — defaults to collapsed/icon-only. That is the primary state, not a
  small-screen fallback; design nav for icon+tooltip wayfinding first.

## Invariants

Rules the service layer enforces, or that the model depends on. Each has an id so
a test, a review comment or a commit message can point at one. Where Postgres
can express a rule it does, as a CHECK, a partial unique index or a composite
foreign key — the table in [DATABASE.md](DATABASE.md) says which; the service
layer still checks first so the user gets a message, not a constraint name.
Turning them into tests is roadmap T1.4.

| Id | Rule | Enforced where |
| --- | --- | --- |
| **INV-1** | Validity intervals are half-open: `validFrom` inclusive, `validTo` exclusive, `null` unbounded on that side. ISO `YYYY-MM-DD` strings compare correctly, so comparison is string comparison. | `isValidAt()` in `building-blocks.service.ts` |
| **INV-2** | A building block belongs to at least one architecture domain. | `validateInput()` |
| **INV-3** | `architectureLevel` applies only to `kind = 'architecture'`; it is forced to `null` for solution blocks. | `validateInput()` and both write paths |
| **INV-4** | A building block cannot relate to itself. | `createRelationship()` |
| **INV-5** | A block has at most one *active* `hosted_on` edge — containment, not a peer relationship. | `createRelationship()` |
| **INV-6** | A business process's `capabilityId` must exist, and its `enterpriseId` is kept in sync with the owning capability's enterprise. | `business-processes.service.ts` |
| **INV-7** | `bpmnXml` must parse as BPMN 2.0; `process_steps` are replaced from the diagram on every save. | `business-processes.service.ts` |
| **INV-8** | Architecture-domain and organization-unit assignment are replace-all sets with no validity interval. | `replaceAssignments()` |
| **INV-9** | Every row belongs to exactly one enterprise. Overlap between enterprises is expressed with links between their models, never by sharing rows. | Schema design; see [VISION.md](VISION.md) |
| **INV-10** | Ids are globally unique. `id` is a plain primary key, *not* composite with `enterprise_id`, so two enterprises sharing a database cannot reuse an id. | Postgres primary key |
| **INV-11** | A capability and an information object linked together belong to the same enterprise. Both ids are valid alone; the pair is what is wrong. | `information-objects.service.ts` |
| **INV-12** | A capability has at most one *open* link to the same information object &mdash; the same close-before-you-open rule as INV-5. | `information-objects.service.ts` |
| **INV-13** | An actor's `organizationUnitId` is set only when `kind = 'team'`, and the unit belongs to the same enterprise. Without it, teams end up modelled twice under two names. | `actors.service.ts` |
| **INV-14** | A capability and an actor linked together belong to the same enterprise. | `actors.service.ts` |
| **INV-15** | A capability has at most one *open* link to the same actor. | `actors.service.ts` |
| **INV-16** | A request reads only enterprises its principal is a member of, and writes only what the member's role permits (D-20). A non-member sees nothing of an enterprise; instance admins are implicit owners of all of them (D-21). Creating an enterprise makes the creator its first member; the last member cannot be removed, and an account that is the last member of any enterprise cannot be deleted. | Every service, via `principal.enterpriseIds`; `AuthGuard`; `admin.service.ts` |
| **INV-17** | There is always at least one active instance admin. The last one cannot be demoted, deactivated or deleted; nobody can deactivate or delete themselves. | `admin.service.ts` |
| **INV-18** | Every enterprise has at least one explicit owner (an admin's implicit ownership does not count). The last owner cannot be demoted or removed; delete the enterprise instead. | `enterprises.service.ts` |

Two sharp edges in the current implementations, so you are not surprised by them:

- **INV-5 checks less than it claims.** It rejects a second `hosted_on` edge only
  when an existing one is *unbounded* (`validTo` null). It does not check full
  interval overlap. Closing the old edge before opening a new one is the caller's
  responsibility, as with every temporal link here.
- **INV-10 is enforced by Postgres, not by us.** The bundle validator reports
  an id collision as a 400 naming the id; if a constraint fires anyway,
  `common/pg-error.filter.ts` turns it into a 409. Example bundles avoid
  collisions by deriving ids as UUIDv5 from a readable key; see
  [DECISIONS.md](DECISIONS.md).

## Example bundles

`examples/*.json` are data-exchange bundles that import through the same endpoint
a user would use.

- **`household.json`** — the smallest possible model, a family household. The only
  bundle that may be named in committed docs.
- **`kestrel.json`** — Kestrel Coffee Roasters, a fictional 32-person roastery
  with two cafés, an online shop and wholesale customers: 36 building blocks,
  nearly all SaaS, one custom portal, spreadsheets being replaced by an ERP that
  is still `planned`. What a small company's architecture actually looks like.
- **`alderbrook.json`** — a fictional B2B SaaS, ~58 building blocks. Sized so the
  metamodel is legible to a stranger: ABB/SBB splits, three-deep hosting nesting,
  dated realizations, and a runtime migration in flight so the `asOf` date visibly
  changes the picture.
- **`meridian.json`** — Meridian Mutual, a fictional insurer of 2,800 people:
  105 building blocks, 24 capabilities, 29 organization units, five domains. A
  mainframe policy system being replaced line by line, a data warehouse in
  parallel run, a Data Office that took data out of IT in 2025, and a named
  individual as a key-person risk. The bundle to test anything at scale against.

Ids are UUIDv5 of `openeam:examples:<bundle>:<table>:<key>` in the URL
namespace (D-8), where the key is the readable slug the bundle was authored
with; regenerating a bundle from the same source gives byte-identical output.
Every bundle must pass `pnpm check:examples` (icon ids resolve) and import
cleanly alongside the others into one database.

Real, non-public enterprises are modelled in `examples/private/`, which is
gitignored, and are never named in any tracked file. See [CLAUDE.md](../CLAUDE.md).

## Working on it

```bash
pnpm install
cp .env.example .env
docker compose up postgres -d
pnpm db:migrate
pnpm dev                 # web :3000, api :4000
```

Before calling anything done: `pnpm lint` (repo-wide), `pnpm -r typecheck`,
`pnpm -r build`. There is no test suite yet — that is roadmap T1.3, and it is why
those three currently prove that the code compiles, not that it works.

`.claude/skills/verify/SKILL.md` has the details for driving the running app
headlessly.

## Deploying

Two shapes, same images.

**Local build, plain HTTP** — for a LAN box or a first look:

```bash
cp .env.example .env               # set POSTGRES_PASSWORD, OPENEAM_PORT, OPENEAM_ORIGIN
docker compose --profile app up -d --build
```

Three containers: Postgres, the API (`apps/api/Dockerfile`: multi-stage,
production dependencies only, runs migrations then `node dist/main.js` as an
unprivileged user) and the web server (`apps/web/Dockerfile`: Vite build served
by nginx, `apps/web/nginx.conf` proxies the API paths). Only the web container
publishes a port.

**Published images, TLS, two environments** — for an instance on the
internet, from [deploy/](../deploy/). CI builds both images on every push and
PR (so a broken Dockerfile fails there) and publishes them to GHCR on `main`
and on `v*` tags, as `main`, an immutable `sha-…`, `v1.2.3` and `latest`.
`deploy/compose.yml` is one environment from those images: no published
ports, joined to an external `edge` network where the shared Caddy
(`deploy/proxy`) reaches its web container by name. Prod and staging are two
copies of it with different `.env` files on one host:

```
/srv/openeam/proxy/     deploy/proxy, Caddy: TLS for both hostnames, 80/443
             prod/      deploy/compose.yml + .env    tag v…
             staging/   deploy/compose.yml + .env    tag sha-…
             bin/       deploy.sh, backup.sh, root-owned
             backups/   nightly dumps, age-encrypted, rclone'd off-host
```

Each file's header says what it expects: the `.env` variables in the two
compose files, the server layout and the forced-command key in `deploy.sh`,
backup settings, cron line and the restore pipeline in `backup.sh`, the
GitHub environments, variables and secret in `ci.yml`. The workflow deploys
staging on every push to `main` and production on a tag after a reviewer
approves; `deploy.sh` pins the tag, pulls, dumps prod, and waits for health.
Create the first account right after the first production deploy — it is the
instance admin, and anyone reaching the hostname could create it first. The
reasoning is D-26 in [DECISIONS.md](DECISIONS.md).

Open the instance and create the first account. It can always be created, it
is the instance admin, and it inherits every enterprise already in the
database. From the Administration page the admin creates further accounts (or
opens sign-up), and members add colleagues to an enterprise by email from the
enterprise's edit sheet. Set `AUTH_COOKIE_SECURE=true` once the instance is
behind TLS. `AUTH_ALLOW_SIGNUP` only seeds the sign-up switch on first start;
afterwards the Administration page owns it.
