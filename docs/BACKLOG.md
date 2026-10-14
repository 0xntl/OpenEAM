# Backlog

Work that is **decided** — known defects and committed next steps. Unlike
[IDEAS.md](IDEAS.md), nothing here is waiting on a decision; it is waiting on
someone doing it.

The split matters: four security defects previously sat among forty entries in
the ideas list, which is where urgent things go to be camouflaged. Anything in
this file has a reason to be done and, where relevant, a reason it is done *now*.

`T…` ids refer to initiatives in the project's transition roadmap, which is
tracked outside the repository. Entries without one are not on that plan.

---

## Before this is reachable from outside localhost

Accounts, sessions, membership scoping (INV-16), env validation, GraphiQL
gating, rate-limited sign-in with per-account lockout, an Origin check, helmet,
the closed data-exchange endpoints, and the validating importer have landed
(T2.1 … T2.6; D-15 and D-16 in [DECISIONS.md](DECISIONS.md), the measures and
their purpose in [ARCHITECTURE.md](ARCHITECTURE.md)). What remains:

- **Content Security Policy for the SPA** — nginx sets nosniff, frame-deny,
  referrer and permissions headers but no CSP: `index.html` carries an inline
  theme script and bpmn-js injects styles. Needs a build step that hashes the
  inline script (or moves it to a file) and a policy that allows the style
  injection. (`Strict-Transport-Security` is set by Caddy in the `deploy/`
  shape; the root Compose shape serves plain HTTP and should not set it.)

- **Security tests in CI** — the measures above were verified with a hand-run
  script (41 checks: session handling, CSRF vectors, cross-tenant reads and
  writes through GraphQL and the importer, lockout with forged
  `X-Forwarded-For`). That script should become the first integration tests
  once T1.3 lands; until then nothing guards against a regression.


## Foundation

- **Test harness** (T1.3) — there is no test infrastructure at all. Vitest plus a
  Postgres service container in CI. Everything below that needs a test depends on
  this existing. Tool choice stays Vitest; the `test` / `test:watch` scripts and
  the CI step go in with it.

- **Invariant tests** (T1.4) — turn INV-1 … INV-17 in
  [ARCHITECTURE.md](ARCHITECTURE.md) into tests. They are already written down as
  rules; this is the cheapest test anyone will ever write, and the current
  Definition of Done (lint, typecheck, build) proves only that the code compiles.

- **Round-trip test on export and import** (T1.5) — export, import into an
  empty database, export again, compare. One test covering the widest surface
  in the codebase, and it guards the exact path private models are restored
  from. Include a version-0 bundle (no `formatVersion`) so the migration chain
  in `data-bundle.format.ts` is exercised, a newer version being refused, and
  an export by a member of one enterprise while another exists (D-24). The
  2026-10-13 hand-run of exactly these checks is the script to start from.

- **Drift checks** (T1.6) — fail CI when the committed `schema.gql` differs from
  the generated one, or when `drizzle-kit generate` would produce a migration.
  Catches "forgot to regenerate" in both directions for about twenty lines of
  workflow.

- **Secret scanning** (T1.7) — gitleaks as a pre-commit hook and CI job, plus
  GitHub push protection. Credentials are the leak that actually hurts a
  self-hosted tool. A maintainer's own private names belong in a local, untracked
  gitleaks rule file — personal risk, personal config. See D-9 in
  [DECISIONS.md](DECISIONS.md).

- **Renovate and CodeQL** (T1.8) — both are switched on by the owner, not by
  a file: install the Renovate GitHub App (its onboarding PR brings the
  config; group the container images and pin the GitHub Actions to digests
  in it) and enable CodeQL's default setup under Settings → Code security. A
  manual `pnpm -r outdated` pass in 2026-08 had found 31
  stale packages, including a stale peer-dependency ghost in `node_modules`
  that silently broke a typecheck — the reason the bot exists.

- **Multi-architecture images** — CI publishes amd64 images to GHCR (T3.4
  landed with D-26). An arm64 build would let a Mac or a Raspberry Pi
  self-host from the registry instead of `--build`; QEMU roughly triples the
  image job, so it wants a native arm64 runner or a nightly schedule rather
  than every push.

## Model and data

- **No mutation to link a building block to a business capability** —
  `buildingBlockCapabilities` (which ABBs realize which capability) can only be set
  by the importer; there is no GraphQL mutation and no UI, on either detail page.
  Found while modelling ABBs by hand through the running app: linking them required
  a direct DB insert mirroring what the importer does. Small slice — a
  `linkBuildingBlockCapability` / `unlinkBuildingBlockCapability` pair plus a way to
  add and remove links from one of the two detail pages.

- **The detail pages ignore `asOf`** — both the building block and the capability
  page list every link the entity ever had, with closed and live ones visually
  identical apart from their dates (and on the capability page, without dates at
  all). Two examples from `alderbrook.json`: the Self-Managed VM Fleet's three
  live `hosted_on` edges sit below seven historical ones, and Subscription
  Billing's People quadrant shows both the Integrations Squad and the Platform
  Team as performing it, though the first hand-off closed in June 2026. These are
  the pages that answer "who owns this now?" and "what still runs on this?", and
  they are the ones that do not honour the time dimension the rest of the app is
  built around — which makes a current-looking answer quietly wrong. At minimum:
  separate live from closed; better, respect the landscape's `asOf`.

- **External identifier and source on rows** — nothing records where a row
  came from. Every importer short of the snapshot (CSV, `package.json`, a CMDB)
  must therefore match on names, and a second run cannot tell "renamed" from
  "new". Nullable `externalId` plus `source` on the entity tables (building
  blocks, capabilities, actors, organization units, information objects, value
  streams, processes), unique per enterprise and source, in GraphQL, the
  bundle and the forms. Decided in D-24; built with the first importer below.

- **Tabular import per entity type, with review** (UC-2) — a CSV or Excel
  sheet of building blocks (then capabilities, actors, …) into one existing
  enterprise: upsert by external id or name, a diff the user accepts or
  rejects before anything is written, never a replace. This is the integration
  path; the bundle is not (D-24). Needs the external id above.

## Project hygiene

- **Releases mean nothing yet** (T4.4) — every package is `0.0.0`, there are no
  tags and no CHANGELOG. A `v*` tag now builds and deploys production (D-26),
  so the mechanics exist; what is missing is the practice — a version bump,
  a changelog entry and a GitHub release per tag.

- **No SECURITY.md** (T4.4) — an Apache-2.0 public repository that now ships
  its own authentication needs a disclosure path. Issue templates belong here
  too.

- **The Definition of Done has no test criterion** — [CONTRIBUTING.md](../CONTRIBUTING.md)
  requires lint, typecheck and build. For code that is not reviewed line by line,
  those three prove it compiles, not that it works. Add the test step once T1.3
  lands.

- **UC-7 conflates two different things** — "access restriction" (infrastructure,
  needed in weeks) and "users and permissions" (a product feature for next year)
  both live under one use case in [USE-CASES.md](USE-CASES.md). They should be
  separated.
