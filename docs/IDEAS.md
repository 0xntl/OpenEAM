# Ideas

A parking lot for things deliberately left out — possible directions, not a plan
or a commitment, in no particular order. Each line notes roughly when it might
become worth doing, so an idea isn't lost and the current scope stays small.

Nothing here is decided. Three neighbours hold the things that are:

- **[BACKLOG.md](BACKLOG.md)** — known defects and committed next steps. Work
  waiting on someone doing it, not on a decision.
- **[DECISIONS.md](DECISIONS.md)** — choices already made, with the reasoning, plus
  upgrades that are blocked upstream and why.
- **[USE-CASES.md](USE-CASES.md)** — what all of this is *for*: the stakeholder
  questions we intend to answer, ranked. An idea usually gets picked up because a
  use case pulls it in.

## Model and product

- **Links between enterprises** — when one enterprise's model needs to reference another's (same real-world system, data exchange, roll-up to a coarser scope), add link tables between their artifacts rather than sharing rows. Additive on top of the per-enterprise ownership already in place; see [VISION.md](VISION.md).
- **Outcome/health metrics on a capability or building block** — value streams only model *triggered* value (a stakeholder need, start to finish); they structurally can't represent the passive, ambient value of a capability just quietly working (e.g. a customer fully happy with the product who never contacts support). That value is real but currently invisible in the model — nothing captures it, not even as a number. A measured signal attached to a capability or ABB (e.g. "% of clients with zero support cases this quarter", churn rate) would surface it without forcing a fake trigger into a value stream just to have something to model. Surfaced while modelling value streams through the running app.
- **Capability-to-architecture drill-down view** — a small, focused diagram/list on the business capability detail page showing just its realizing building blocks (and maybe their dependency subgraph). Tried as a layer on the main landscape diagram first (pills + a `serves` edge) and taken back out — capability-to-architecture is a different question ("what fulfills this?") from whole-landscape ("what's the architecture of the whole thing?"), and answering both in one picture just added noise. Revisit once the main diagram is in good shape.
- **Diagram support for indirect/transitive dependencies** — "what depends on this, directly and indirectly" (US-3.2) needs a graph traversal the diagram doesn't do today; it only ever shows one hop.
- **Multi-enterprise landscape view** — an enterprise's own landscape is sometimes only part of the picture (e.g. a vendor's product plugged into each client's own IT architecture). Depends on the cross-enterprise link tables in [VISION.md](VISION.md)/UC-8, which aren't built yet.
- **Custom icon collection (`openeam`)** — SVGs in the repo on Lucide's grid, built into one Iconify JSON with `@iconify/tools` and added to the allowlist. For internal concepts no public set covers; worth doing the first time someone asks (D-22).
- **Per-enterprise icon uploads** — logos of internal systems. Needs server-side SVG sanitising, its own table, delivery as a collection per enterprise and a place in the bundle. After the custom collection, if internal logos turn out to matter.
- **Icon search by title** — the search matches names and aliases (`postgresql`), not display titles; those live in the `simple-icons` npm package. Add if name matching proves too blunt.
- **Audit log** — when there are real write operations.
- **Entity versioning** — when entity history needs preserving.

## Diagramming

- **Persisted, hand-editable diagram layout** — the landscape diagram (diagram-js + elkjs, shipped — see README) is read-only and recomputes layout from scratch every load. Turning it into an editable, persistable document (own notation: palette, connector tool, manual repositioning) — the same generate-then-hand-edit-then-keep workflow already solved for business processes via `bpmnXml` — is the natural next step, once someone actually wants to rearrange a diagram and keep it that way.
- **Cytoscape.js** — alternative to diagram-js if the landscape view turns out to be more "explore the dependency graph" than "author and keep a diagram": strong built-in layouts (cose, dagre, an elk extension), handles large graphs well, click-to-expand/collapse. Weaker as an authoring tool — no palette/connector UX — so only worth it if exploration ends up mattering more than persisted, hand-adjusted diagrams.

## Platform and interfaces

- **Per-enterprise feature toggles** — hide areas an enterprise does not use (a household has no value streams; a bank has no need to hide anything). GitLab's per-project features are the model. A list of enabled areas on the enterprise plus a navigation that honours it; a product setting, not a permission (D-20). Build when an enterprise asks.

- **OIDC sign-in** — as an *additional* way in next to local accounts (D-15), when a deployment needs SSO. OIDC on the API (JWKS validation of the id token, then a normal session), an OIDC client on the web, Keycloak or the company IdP as the provider. Accounts stay local; the provider only proves who is signing in.
- **Published JSON Schema for the data bundle** — generate it from the zod schema (`z.toJSONSchema`) and serve it publicly, versioned in the address (`/api/data-exchange/schema/v1.json`, `$id` per format version), so editors and scripts can check a bundle's shape before uploading. Shape only: the model rules in `data-bundle.validator.ts` and the migration of older bundles are not expressible in it, and the icon `refine` drops out, so a bundle that passes the schema can still be rejected. Nobody writes bundles by hand or by script today, and the format is not stable (D-24); a published schema is a promise to keep it current. Do it with the first release, when a stable project URL exists to point `$schema` at, or when the first outside script produces bundles.
- **REST facade** — only when a real third-party integrator needs it (CMDB sync, ServiceNow, iPaaS, scripts). REST + OpenAPI for core resources, sharing the service layer with GraphQL.
- **TanStack Query** — when the frontend calls a REST endpoint other than /health.
- **GraphQL Codegen + `packages/graphql`** — the API already emits its SDL to a committed `apps/api/schema.gql` (reviewable in diffs, codegen-ready). When the first real operations land: add graphql-codegen on the web, with the generated types in a shared `@openeam/graphql` package (so a future REST client / second consumer can reuse them). Note: in production the API builds the SDL in memory (`autoSchemaFile: true`) because the container's app directory is not writable; codegen would read the committed `schema.gql` from the dev run.
- **Persisted queries** — during production hardening.
- **BullMQ + Redis** — first async job (e.g. CSV import).
- **MinIO** — first file upload.
- **Helm chart** — for Kubernetes.

## Data and search

- **Full-text search** — Postgres `tsvector` first, Meilisearch later.
- **Apache AGE** — if relational + recursive CTEs get limiting for graph queries.

## Operations and tooling

- **OpenTelemetry** — when there's a tracing backend to send to.
- **Playwright** — when UI flows need E2E coverage. (Unit and integration tests are
  not an idea — see [BACKLOG.md](BACKLOG.md).)
- **Turborepo** — if CI builds get slow (~2 min+).
- **i18n** — when a second language is actually needed.

## Public face

- **Community channels / demo hosting** — when there's activity and something to show.
- **Marketing site brand color** — a muted terracotta, `#b5452f` (`oklch(0.54 0.15 33)`), is reserved as OpenEAM's primary brand color for whenever a public/marketing site gets built. Deliberately *not* a UI accent inside the app itself — the app is color-coded for information everywhere (architecture domain, strategic direction, edge type), so a decorative accent on top of that would compete with those meanings rather than add identity. In the app it appears only in the product's mark — the filled square of the favicon and of `components/brand/brand.tsx`, which the sidebar and the sign-in page show until an instance is branded (D-23). It lives as `--brand` in `index.css` for exactly that use; it is still not an accent anywhere else.
