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
  `X-Forwarded-For`). Cross-tenant reads and writes and the roles are now
  tested at the service level (INV-16, `apps/api/test/invariants/access.test.ts`).
  Everything in the HTTP layer is not: the guard, `@AdminOnly()` on the
  admin resolvers (which is all that protects `AdminService.setRole`), CSRF,
  lockout. Those need the harness to boot the app and send requests, which
  the rolled-back transaction of D-28 does not stretch to.


## Foundation

- **Rules without a constraint can be raced** — INV-17 and INV-18 are a
  read followed by a write, with nothing in Postgres behind them: two
  requests at once can each see "another admin exists" and both proceed.
  INV-5, INV-12 and INV-15 have a unique index as the last line; these two
  have none. Needs a lock on the rows read (`SELECT … FOR UPDATE`), and a
  test with two connections, which the harness does not have (D-28).

- **Browser tests** — Playwright against the test stack (D-27), after T1.3.
  Three projects (phone, tablet, desktop) and to begin with only what a unit
  test cannot see: every route renders without an error, no page is wider
  than its viewport, the navigation is reachable at every size, and one
  create–edit–delete flow per entity type. The checks that found the phone
  layout defects were run by hand; this is them, kept. Accessibility checks
  (axe) ride on the same runs once they exist. Not screenshot comparison yet:
  the interface still moves too much for the diffs to mean anything.

- **Generated GraphQL types on the web** — every route hand-writes the
  interfaces for its query results, so renaming a field in the API breaks
  nothing at compile time and the page fails at runtime instead. graphql-codegen
  from the committed `apps/api/schema.gql`; typecheck then catches it. This
  sat in IDEAS "for when the first real operations land", and they have. The
  shared `@openeam/graphql` package from that note waits for a second consumer.

- **A second seeded account** — the test stack has one instance admin. The
  read-only paths (a viewer who must not see Edit, a member of one enterprise
  who must not see another) need a viewer and an outsider seeded beside it,
  created the way the Administration page creates them. Add with the first
  test that needs one.

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

- **Process steps and the diagram need thinking through as a whole** — the
  importer now refuses a bundle whose steps contradict its diagram (D-30).
  That closes a hole; it is not a design. What is unsettled:
  - *A step has no identity.* Every diagram save deletes a process's steps
    and inserts them again, so a step's id lasts until the next save and
    nothing can point at one: no actor on a step, no building block that
    supports it, no information object it reads.
  - *There are two kinds of step and the app knows one.* Steps derived from
    a diagram, and steps listed in a bundle for a process nobody has drawn
    (ten processes in the example bundles). The second kind cannot be made
    or edited in the app, and the first diagram saved for such a process
    replaces them without a word.
  - *A bundle says the same thing twice.* `bpmnXml` and `processSteps`
    both describe the steps of a drawn process, which is what made the
    contradiction possible. Whether a bundle should carry steps for a
    process that has a diagram at all is open.
  - *Import depends on how steps are derived.* A change to `bpmn-steps.ts`
    makes earlier exports unimportable unless a format migration derives
    their steps again (D-30).
  - *"Position" is an artefact for anything but a straight line.* The order
    is a breadth-first walk from the start events; through a gateway or
    parallel branches it means little, and unnamed tasks are dropped.

  Decide what a step is for first (a list to read, or something the rest of
  the model links to), then which of these follow.

- **Editing a building block erases its dated organization-unit history** —
  `replaceAssignments()` deletes every `building_block_organization_units`
  row of the block and writes the submitted units back without dates
  (INV-8). A model imported from a bundle can carry dated assignments
  ("this moved from IT to the Data Office in 2025"); renaming such a block
  in the UI is enough to lose them, silently. The INV-8 test pins the
  behaviour as it is. ARCHITECTURE.md contradicts itself on which this
  table should be: the append-and-close list includes it, INV-8 excludes
  it. Decide, then either keep dated rows on edit or say plainly that the
  form flattens them.

- **A temporal link cannot be closed through the API** — a second open
  `hosted_on` edge, capability–information link or capability–actor link is
  refused with "close it (set validTo) before adding another" (INV-5, 12,
  15), but relationships and links have only create and delete mutations.
  The one way to follow the advice is to delete the link, which removes the
  history it was for, or to import a bundle. An update mutation that sets
  `validTo`, and the same from the detail pages.

- **Reading a capability takes about 60 ms** — measured in the test suite
  against the test database, on an enterprise with almost nothing in it:
  `BusinessCapabilitiesService.findOne` (and `create` and `update`, which
  read back through it) took 60–80 ms per call where a building block took
  7 ms. Not investigated. The query nests every link of every linked
  building block, so planning time is the first thing to look at;
  `findAll` runs the same shape for a whole enterprise.

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

## Phones and touch

What is settled. A phone is for looking something up, reviewing and a light
edit; the modelling canvases are for viewing there. The layout follows the
width (below `md` is the phone layout), the size of what you press follows
the pointer (`pointer: coarse`), not the device. The dense sizing is a
choice: this is a tool where seeing much at once and reaching things in few
clicks is the point, and it stays as it is for mouse and trackpad.

The first pass made a phone usable: no page scrolls sideways any more, a
floating control at the bottom opens the menu and search, detail pages are
one column, sheets take the full width, tables scroll instead of clipping,
the collapsed rail scrolls on a short window. What remains:

- **Touch layer** — under `pointer-coarse:` only: at least 44 px to press on
  buttons and navigation rows (the hit area can grow without the visual
  growing, as the `after:-inset-2` in `ui/sidebar.tsx` already does), 16 px
  text in inputs (below that iOS zooms the page on focus, sign-in included),
  and the edit controls that are `opacity-0` until hover — the pencil on the
  cards of five list pages, Edit and Delete on building-block rows — always
  visible. Separately, for every pointer: nothing below 12 px; the list cards
  use 10 px for chips and counts.

- **Phone navigation** — the two-button control becomes the pill, three
  slots: Menu, Search, and one that depends on the page — back to the list on
  a detail page, "New …" on a list. No slot for the overview: a home button
  is a reset for when you are lost, and the menu does that better (it shows
  every destination and where you are); it earns one when the overview is
  somewhere you go for something. Menu opens a bottom sheet: enterprise
  switcher, the destinations as labelled icon tiles in their groups, theme
  and account. Needs one navigation definition first, a
  list the rail, the drawer, the pill and the command palette all read;
  today it is eleven hand-written blocks in `app-shell.tsx`. A narrow window
  with a mouse should keep the rail instead of getting the pill — the
  sidebar's phone switch (`useIsMobile`) looks at width alone. Edit and
  Delete stay in the page header, in a "⋯" menu. The pill hides while a
  sheet or the keyboard is open.

- **One way to edit an item** — there are four: a pencil on hover (cards),
  Edit and Delete on hover (table rows), text buttons (detail pages) and a
  "⋯" menu (Administration). Settle on one per surface with the navigation
  above, since the "⋯" menu is what the phone header needs anyway.

- **Canvases on a phone** — the landscape fits itself to 7% zoom, a tap on a
  node navigates away at once (highlighting is hover-only), the filter bar
  wraps to three lines over a canvas that reserves one, and the legend sits
  under the menu control and over the minimap. Wanted: filters behind one
  chip that opens a sheet, a tap that selects and shows a card with "Open",
  no minimap, the legend folded away. The BPMN modeler becomes the viewer
  below `md`, with a note that editing wants a larger screen.

- **Tables on a phone** — building blocks (seven columns) and the landscape
  table now scroll sideways. Readable, not good: either rows as cards or a
  first column that stays put.

- **Value stream stages clip at 320 px** — the stage strip is
  `overflow-hidden` and the last stage is cut on the narrowest phones. Let it
  scroll.

- **Web app manifest** — so "Add to Home Screen" opens OpenEAM full-screen,
  without the browser's bars, which is what gives the pill and the canvases
  their room. Name and icons are instance branding (D-23), so the API serves
  it rather than a static file; with it `theme-color`, an Apple touch icon
  and `viewport-fit=cover` with safe-area insets. No service worker and no
  offline mode: the model is behind a session and has to be current, and a
  cache in front of it buys little for the invalidation bugs it brings. Goes
  in with the phone navigation.

- **The search hint says ⌘K everywhere** — Ctrl K off Apple platforms, and
  no hint where there is no keyboard.

## Project hygiene

- **Releases mean nothing yet** (T4.4) — every package is `0.0.0`, there are no
  tags and no CHANGELOG. A `v*` tag now builds and deploys production (D-26),
  so the mechanics exist; what is missing is the practice — a version bump,
  a changelog entry and a GitHub release per tag.

- **No SECURITY.md** (T4.4) — an Apache-2.0 public repository that now ships
  its own authentication needs a disclosure path. Issue templates belong here
  too.

- **Say where AI assistance stands** — [CONTRIBUTING.md](../CONTRIBUTING.md)
  is silent on it, in a repository that is itself mostly written with an AI
  assistant. A short paragraph: using one is welcome; a person has read the
  change and answers for it; the pull request says how it was checked, not
  only what it does. No ban and no disclosure ritual beyond that — what
  protects the project is the checks a change has to pass, not who typed it.
  Worth having before the first outside pull request, since that is when the
  volume question arrives.

- **`AGENTS.md` beside `CLAUDE.md`** — the operating notes for assistants
  (private data, the icon rules, docs order, dense on purpose) sit in a file
  one tool reads. `AGENTS.md` is the tool-neutral name other coding agents
  look for. One file holds the notes and the other points at it, so a
  contributor's assistant gets the same rules whichever it is, and they are
  never maintained twice.

- **UC-7 conflates two different things** — "access restriction" (infrastructure,
  needed in weeks) and "users and permissions" (a product feature for next year)
  both live under one use case in [USE-CASES.md](USE-CASES.md). They should be
  separated.
