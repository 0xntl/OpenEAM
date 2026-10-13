# Decisions

Choices that are deliberate, with the reasoning that made them. Append-only:
when a decision changes, add a new entry that supersedes the old one rather than
editing history.

This exists because most of this codebase is written by an AI assistant working
from the repo as its only context. A choice with no recorded reason reads as an
accident, and the next change "helpfully" undoes it. If you find yourself
explaining the same decision twice, it belongs here.

A good entry says what was decided, what it rules out, and what would make you
change your mind. Blocked upgrades count — "we can't yet, and here is exactly
why" saves the next person the same investigation.

---

## D-1 · One table for both building block kinds

**Decided:** ABBs and SBBs live in one `building_blocks` table, discriminated by
a `kind` enum, rather than in two tables.

**Why:** every relationship table — realizations, capability links, org-unit
assignment, the relationship graph — then has a single foreign key target.
Two tables would double every one of those, or force polymorphic references.

**Cost:** `architecture_level` is meaningful only for `kind = 'architecture'`, so
it is nullable and the rule is enforced in the service layer (INV-3) rather than
by the schema. The GraphQL layer resolves the concrete type from `kind`.

**Revisit if:** the two kinds grow enough distinct fields that the shared table is
mostly nulls.

---

## D-2 · Architecture domains are data, not an enum

**Decided:** the four TOGAF BDAT domains are seeded per enterprise as rows with
`is_default = true`, not hardcoded as an enum.

**Why:** real architecture practices add their own lenses — security
architecture, integration architecture — and an enum would make that a schema
migration instead of a row.

---

## D-3 · A deliberately small relationship taxonomy

**Decided:** three relationship types — `depends_on`, `data_flow`, `hosted_on` —
instead of an ArchiMate-style taxonomy of serving, triggering, access, realization
and the rest.

**Why:** richer typing should follow real usage showing which distinctions matter,
not precede it. A taxonomy nobody can apply consistently is worse than a coarse
one everybody can.

**Note:** `hosted_on` is the odd one out. It is containment ("runs on"), not a
peer relationship, which is why a block may have only one active `hosted_on` edge
(INV-5) while the other two are naturally many-to-many.

**Revisit if:** users are systematically overloading `depends_on` to mean several
different things. This is a standing question for an EAM expert.

---

## D-4 · Half-open validity intervals on temporal relationships

**Decided:** temporal rows carry `valid_from` (inclusive) and `valid_to`
(exclusive), with `null` meaning unbounded. Changing an assignment closes the old
row and inserts a new one rather than updating in place.

**Why:** it makes the whole landscape reconstructible for any date, which is the
most distinctive thing this tool does — the `asOf` control is not a filter over
current data, it is a different view of the same history.

**Cost:** every write path has to close before it opens, and the service layer
only partly enforces that (see the INV-5 note in
[ARCHITECTURE.md](ARCHITECTURE.md)). ISO date strings are compared as strings,
which is correct for `YYYY-MM-DD` and would not be for any other format.

---

## D-5 · Classification is not history

**Decided:** architecture-domain assignment carries no validity interval. It is a
replace-all set, unlike every other link between building blocks and something
else.

**Why:** which domain something belongs to is a lens for reading the model, not an
event in the enterprise's life. Nobody asks "which domain was this in two years
ago" the way they ask "what was running on this platform two years ago".

**Status: open question.** This is the assumption most likely to be wrong, and
retrofitting validity onto a classification table later is a migration rather than
an addition. It is one of the three questions queued for an external EAM expert.

---

## D-6 · The enterprise is a hard boundary

**Decided:** every modelled row belongs to exactly one enterprise. Overlap between
two enterprises' models — the same real-world system appearing in both — is
expressed by link tables between them, never by sharing rows.

**Why:** an enterprise is the scope of an architecture effort, and two efforts
legitimately model the same system differently. Sharing rows would force one
model's opinion onto the other.

**Not yet true in code:** the boundary is currently a naming convention, not a
boundary — `findOne`, `update` and `delete` scope by bare id. See
[ARCHITECTURE.md](ARCHITECTURE.md) and roadmap T2.5.

---

## D-7 · `lucide-react` is the only icon library

**Decided:** one icon library. Import from `lucide-react` or extend it; do not add
another, including to satisfy a component library's default.

**Why:** `@hugeicons/*` was added this way and removed again — it duplicated icons
already available in Lucide, at the cost of a second dependency and two visual
languages in one UI.

---

## D-8 · Example bundle ids are deterministic UUIDs

**Decided:** ids in `examples/*.json` are UUIDv5 values derived from a readable
key, not handwritten slugs and not random UUIDs.

**Why:** three things at once. They are the same shape the app mints at runtime
(`randomUUID()`), so an example looks like a real exported bundle. They are
globally unique by construction, which matters because `id` is a plain primary key
(INV-10) and the demo instance will hold several enterprises' models in one
database — handwritten slugs collided the first time two bundles met. And being
derived rather than random, regenerating a bundle produces byte-identical output,
so a diff shows only what actually changed.

**Cost:** deep links are no longer human-readable. Judged not to matter — nobody
types those URLs.

**Applies to every bundle.** `examples/household.json` was remapped to the same
scheme; its ids derive from the slugs it used to carry, so the two bundles can be
imported into one database.

---

## D-9 · Deterministic checks block, probabilistic checks advise

**Decided:** automated gates that block a merge must be deterministic. Anything
probabilistic — an LLM reviewing a diff, a heuristic scan — advises on a pull
request instead.

**Why:** a gate that is unreliably red trains people to bypass it. One spurious
block in ten earns a permanent `--no-verify` habit, and then the reliable checks
are bypassed too. This was learned twice: from a pre-flight check that was
permanently red for an unrelated reason (see D-10), and from a bespoke name-grep
built for CI and reverted because it fired on exactly one machine while charging
every contributor for it.

**Corollary:** a maintainer's personal risk belongs in local, untracked config.
Shared risk uses standard tooling — for secrets, pattern-and-entropy scanning and
push protection, not a wordlist.

---

## D-10 · Line endings are pinned to LF

**Decided:** `.gitattributes` sets `* text=auto eol=lf`.

**Why:** `apps/web/src/components/ui/select.tsx`, emitted by the shadcn CLI, had
CRLF endings. With `core.autocrlf=true` and no `.gitattributes`, git stored LF, so
CI passed on Linux while `pnpm lint` failed locally every time — for a file nobody
wrote. Sixteen working-tree files were affected. `.gitattributes` outranks
`core.autocrlf`, so this is settled for every contributor rather than per machine.

---

## D-11 · `graphql` 17 is blocked

**Blocked, not a scope choice.** `@apollo/server` peers on `graphql: ^16.11.0`,
and `graphql-ws` (used by `@nestjs/graphql` subscriptions) peers on
`^15.10.1 || ^16`, so `apps/api` cannot move even though `@nestjs/graphql` and
`@apollo/client` already support 17.

**Revisit when:** Apollo Server ships graphql-17 support.

---

## D-12 · `typescript` 7 is blocked

**Blocked, not a scope choice.** TS7 dropped the classic
`moduleResolution: "Node"`, forcing `apps/api` and `packages/db` onto `Node16`
(required alongside `module: "CommonJS"`). That surfaces a real dual-package
hazard in Drizzle ORM 0.45.2: its separate `.d.ts`/`.d.cts` declarations for the
same internal `SQL` class load as two distinct types once API code compares values
from different Drizzle entry points, breaking ~10 service files with `TS2769` /
`TS2322`.

Confirmed the fix is not in `@openeam/db`'s own `exports` — it typechecks clean
standalone, and adding an explicit `require` condition did not help. This is
upstream in Drizzle's package structure.

**Revisit when:** Drizzle fixes Node16/NodeNext resolution — or if `apps/api` and
`packages/db` drop CommonJS emit for ESM, which is an architecture change rather
than a version bump.

---

## D-13 · Information objects are one level, not two

**Decided:** an information object is a business concept — "Expense Claim",
"Customer Master Data" — named in business language and independent of any system
holding it. There is **no** system-level data object beneath it realizing it the
way an SBB realizes an ABB.

**Why:** the symmetry with ABB/SBB is tempting and was declined deliberately. Two
levels double the modelling burden for a dimension that, until now, had no rows at
all, and an unmaintained second level is worse than an absent one. "Where does this
information live?" is already answerable by naming the building block; it does not
need its own entity to be answerable.

**What the link carries:** a capability relates to an information object with one
of three usages — `owns`, `creates`, `uses` — and a validity interval, like every
other link from a capability to something else (D-4). `owns` is the one that earns
its place: it names the capability accountable for that information being correct.
Note that owning is not holding — in the Alderbrook example, Security & Compliance
owns *Receipt Image* because of a retention obligation, while the product team runs
the store it sits in.

**Revisit if:** an expert says the business/system split is load-bearing in
practice, or if people start naming systems in the `name` field, which is the
symptom of the missing level being needed. This is a standing question for the
external EAM review; the smallest honest version was built first so there is
something concrete to critique.

---

## D-14 · The People quadrant holds actors, not people

**Decided:** the entity behind the capability page's People quadrant is an
**Actor** with a `kind` — `role`, `team`, `individual` or `external` — not a
person. A capability links to one with an involvement (`accountable`, `performs`,
`consulted`) and a validity interval.

**Why:** the quadrant has always promised "actors, stakeholders, business units or
partners", which is broader than named humans, and the broader reading is the more
useful one. Accountability normally sits with a position or a team, and positions
outlive the people holding them — modelling only individuals would mean the model
goes stale every time somebody changes job. `individual` remains available for when
a named person genuinely is the honest answer.

**Teams are not modelled twice.** An actor of kind `team` carries a nullable
`organizationUnitId` pointing at the organization unit that already models it,
rather than repeating its name. The column is meaningful only for teams, enforced
as INV-13 — the same shape as `architectureLevel` being ABB-only (INV-3).

**Three involvements, not RACI.** "Informed" is noise in a model nobody updates,
and the split that earns its keep is between who answers for a capability and who
does the work. Small on purpose, like every other taxonomy here (D-3).

**Revisit if:** an expert says the RACI vocabulary is worth the two extra values
for recognisability alone, or if `performs` is visibly doing two jobs.

**What this unblocks:** the same entity is what building-block ownership needs
(US-1.1) — an actor can carry ownership of a building block later without a second
table. It was deliberately built so that link can be added rather than migrated to.

---

## D-15 · Local accounts with server-side sessions, membership as the access model

**Decided:** authentication is built in: a `users` table (email, display name,
scrypt password hash), a `sessions` table holding the SHA-256 of a random token
that lives in an httpOnly cookie (or a bearer header for scripts), and an
`enterprise_members` table. Membership of an enterprise is the entire access
model (INV-16): every member can do everything in it, a non-member sees nothing
of it.

**Why not an identity provider now:** [IDEAS.md](IDEAS.md) had Keycloak pencilled
in. For a self-hosted tool, "run a second server to log in to the first" is the
wrong first step; a self-hoster expects `docker compose up` and a sign-up form.
Local accounts need no new container, no secret to rotate (sessions are random
tokens, not signed), and scrypt is in Node's standard library. OIDC can be added
as an *additional* way to sign in later; nothing here precludes it.

**Why server-side sessions, not JWTs:** sign-out and revocation are a row delete;
a database dump contains no live credential; one indexed lookup per request is
cheap at this scale.

**Why membership and not roles:** roles are a product feature (US-7.3) and would
be a column on `enterprise_members`, not a new table. Shipping the boundary first
and the gradations later keeps the access model explainable in one sentence.

**Two deliberate asymmetries:** public sign-up is closed by default but the
*first* account can always be created, and that account inherits every enterprise
already in the database — the upgrade path for an instance modelled before
accounts existed. And any member may add or remove any other, because there is
no owner yet; the only thing the API refuses is removing the last member, which
would strand the enterprise.

**Revisit when:** a deployment needs SSO (add OIDC alongside), or the first
"viewer who must not edit" appears (add roles).

---

## D-16 · The importer validates the whole bundle; it does not replay it through the services

**Decided:** `POST /api/data-exchange/import` keeps writing rows directly
inside one transaction, but only after `data-bundle.validator.ts` has checked
the entire bundle against the same invariants the services enforce, using the
same functions (`common/invariants.ts`). Id collisions with other enterprises
(INV-10) are checked inside the transaction, after the bundle's own enterprises
are deleted and before anything is inserted.

**Why not route the import through `create()` calls:** a bundle is a snapshot —
ids, timestamps and closed historical rows included. The services generate ids
and timestamps and refuse closed links on creation; replaying a bundle through
them would produce a model with different ids (breaking every bundle that
references it) and no history. Validating up front keeps the restore path
byte-faithful and still refuses what the services would refuse.

**Why validate before the transaction rather than catch database errors:**
Postgres would reject only what its constraints cover (foreign keys, duplicate
keys), one error at a time, as a 500. The validator covers the invariants the
schema cannot express — same-enterprise references, one open link per pair,
level-only-for-ABBs — and lists every violation with table and id in one
response.

**The security reason this is not optional:** before this, a bundle could carry
a row tagged with *another* enterprise's id, or a link to another enterprise's
row, and the importer would write it there. With accounts and membership
(D-15) that is a cross-tenant write by any signed-in user. The "every row and
reference stays inside the bundle's own enterprises" rule is what closes it.

**Revisit when:** bundles grow past what one request validates comfortably in
memory (then stream and validate per enterprise), or a merge-import is wanted
(then the rules move to a diff, not a snapshot).

---

## D-17 · The first account is the instance admin; admins run the instance, not the models

**Decided:** accounts carry an instance role, `admin` or `user`. The first
account ever created is an admin (Gitea, Mattermost and Plausible do the same);
an existing instance promotes its oldest account in the migration. Admins
create, deactivate and delete accounts, reset passwords, open or close sign-up
at runtime, and grant or revoke membership of any enterprise. There is always
at least one active admin (INV-17).

**What an admin deliberately cannot do:** read an enterprise's model without
being a member of it. Most self-hosted tools let the instance admin see
everything; here an enterprise often holds a real organization's architecture,
and "the admin was in here" should be visible in the member list rather than
silent. Granting themselves access is one click away and leaves that trace.

**Why not a default admin account or admin credentials in the environment:** a
default password does not get changed, and secrets in Compose files leak. "Who
signs up first" needs neither and matches what people expect from the tools
they already host. Sign-up stays closed by default after that first account;
`AUTH_ALLOW_SIGNUP` seeds the switch only on an empty instance so a Compose
file can preconfigure an open instance.

**Why deactivation and admin password reset instead of email flows:** the API
cannot send email, and a self-hosted team tool usually has an admin within
reach. Deactivation keeps the account, its memberships and its history and
ends its sessions; deletion is refused while the account is the last member
of any enterprise, so nothing is stranded.

**Not decided here:** roles *within* an enterprise (US-7.3). That is a column
on `enterprise_members`, not another instance role.

---

## D-18 · The database enforces what it can, ids are `uuid`, and the migration history starts over

**Decided:** three things at once, in one baseline migration.

Ids are `uuid` columns with a Postgres default, not `text` holding a UUID the
application minted. Same values, but the database validates the shape, the
indexes are half the size, and a malformed id is a 400 instead of a query that
silently matches nothing.

Every invariant Postgres can express is declared in the schema: CHECKs for the
half-open interval (INV-1), level-only-on-ABBs (INV-3), no self-relationship
(INV-4), unit-only-on-teams (INV-13), lowercased emails and the settings
singleton; partial unique indexes for "one open row per pair" (INV-5, 12, 15);
and composite `(id, enterprise_id)` foreign keys where a row carries
`enterprise_id` and references another that does (INV-6, the organization-unit
parent, an actor's unit). The services and the bundle validator still check
first — they produce messages, the database produces constraint names — and
`pg-error.filter.ts` maps a constraint that fires anyway to a 400 or 409.

The eleven migrations accumulated before any release were collapsed into one
baseline. Nothing deployed depended on them, and a reader of
`drizzle/0000_*.sql` now sees the schema, not its archaeology.

**What was deliberately not done:** adding `enterprise_id` to the id-only link
tables (`capability_actors`, `building_block_relationships`, …) so that INV-9,
11 and 14 could be composite foreign keys too. It would change the bundle
format and every link mutation for a rule two code paths already enforce;
worth it only once the services stop being the sole writers. Likewise the
ABB/SBB sides of a realization stay a code rule.

**Revisit when:** the first release ships (from then on, migrations are
append-only), or a second writer (a sync, a REST facade) makes the database the
only common enforcement point.

---

## D-19 · Nobody but the account's owner ever knows its password

**Decided:** an admin creates an account without a password and receives a
one-time **setup link** (`/setup?token=…`, valid seven days). The person opens
it and chooses their own password; the same link, issued again, is how a
forgotten password is recovered. The admin's "set a password for this user"
action is gone.

**Why not a temporary password with a forced change on first login:** the
password would still travel from the admin to the person — chat, mail, a
note — and be known to two people until changed. A link carries no secret
worth keeping: it works once, expires, and its hash is all the server stores.
This is what Grafana, Mattermost, Outline and Keycloak converged on.

**Why links without email:** the API cannot send mail, and a self-hosted team
tool usually has the admin within reach. The link is shown once in the admin
page with a copy button; when SMTP arrives, the same link gets sent instead of
copied.

**Consequences:** `users.password_hash` is nullable; an account without one
cannot sign in and reads as "wrong email or password" (no enumeration). Using
a link ends every other session of the account. Issuing a new link revokes the
earlier unused ones, so "the newest link is the one that works" needs no
explanation.

**Revisit when:** email exists (send instead of copy, and let people request a
reset themselves), or SSO lands (then most accounts never have a password at
all).

---

## D-20 · Three fixed roles per enterprise over a permission catalogue, no role builder

**Decided:** a membership carries one of three roles — **owner**, **editor**,
**viewer** — and each role is a fixed bundle of permissions from a closed
catalogue in `apps/api/src/auth/policy.ts`. Services check permissions
(`assertCan(principal, 'model.write', enterpriseId)`), never roles. The web
reads the caller's effective permissions off the enterprise and hides what
would fail. Instance admins are not special inside an enterprise (D-17).

**Why fixed roles:** this is where GitHub, Linear, Notion, Grafana, Gitea and
Mattermost all landed — owner / editor / viewer under different names — and
where custom roles exist (ServiceNow, Jira, Salesforce) they are a known
source of confusion: the matrix grows with every feature and nobody can say
what someone effectively may do. An architecture team needs three questions
answered — who reads, who changes, who deletes and manages members — and a
role builder answers them worse.

**Why a permission catalogue underneath anyway:** so the roles can change
without touching a service, and so custom roles, if a deployment ever truly
needs them, become editable bundles over the same catalogue rather than a
rewrite. The catalogue is the stable part; the bundles are policy.

**Who may do what:** viewer — read, export. Editor — plus write the model.
Owner — plus import (it replaces the model), change the enterprise itself,
delete it, manage members. Anyone may leave an enterprise; the last owner
cannot (INV-18). Creating an enterprise makes the creator its owner; everyone
who had access before roles existed became an owner in the migration.

**Not decided here:** per-enterprise feature toggles ("this enterprise does
not use value streams"). That is a product setting, not a permission; it is
in IDEAS.md until an enterprise asks for it.

---

## D-21 · Instance admins are implicit owners of every enterprise (supersedes part of D-17)

**Decided:** an instance admin holds an owner membership in every enterprise
without a row saying so. The session resolver adds those memberships to the
principal, so every service, the web and `can()` see an ordinary owner. The admin page edits memberships per account — which enterprises, as what — next to the accounts themselves; an admin can also use any enterprise's own sheet like an owner. D-17's rule that an admin had to grant themselves
access first is withdrawn.

**Why:** that rule bought a trace in the member list — "the admin was in
here" — at the price of a special case in the services, a second place to
manage members, and a mental detour nobody expects. Whoever runs the instance
has the database anyway; the trace was not protecting anything. Grafana's
server admin and Gitea's site admin work exactly like this, and it is what a
self-hosting team assumes.

**What stays:** everything else in D-17 — first account is admin, admins run
accounts and sign-up, INV-17. INV-18 counts explicit owners only, so an admin
stepping out of the picture cannot strand an enterprise.

**Revisit when:** one instance hosts enterprises of unrelated organizations
(a provider serving several clients). Then the trace matters, and the right
tool is an audit log, not a membership row.

---

## D-22 · Model icons are data: Iconify ids, served by this API

**Decided:** a building block may carry an `icon`: an Iconify id such as
`simple-icons:postgresql` or `lucide:database`, a string on the row and in the
bundle, never markup or a URL. The API serves the icon data itself
(`GET /api/icons/{prefix}.json?icons=…`, the Iconify API's format, from
`@iconify-json/*` packages held in memory); the web draws it with
`@iconify/react` and, in the landscape renderer, as inline SVG from the same
cache. Two collections: Simple Icons for products, Lucide for generic glyphs.
Adding one is a package plus a line in `icons/icon-id.ts`.

**Why:** UI icons are known at build time and tree-shaken (D-7); a block's
icon is chosen at runtime and is a fact about the model, so it belongs in the
database and the export. Lucide 1.0 dropped its brand icons and points at
Simple Icons, so a second source was needed anyway, and Iconify's format is
the one every set is published in. Serving from this API keeps a self-hosted
instance from calling the public Iconify API.

**Rules:** the collection must be on the allowlist, on mutation and import
alike. The name is not checked, so an id from a newer set release survives an
import and shows the fallback until the set catches up. Examples are held
stricter: `scripts/check-example-icons.mjs` runs in CI. Icons are monochrome;
brand colours are not stored. CC0 covers the SVGs, not the trademarks.

**Cost:** Lucide exists twice, tree-shaken in the bundle and as a set on the
server. Deliberate: `DynamicIcon` from `lucide-react/dynamic` covers no brands
and cannot draw inside diagram-js. D-7 stands for UI icons.

**Revisit if:** someone needs an icon no served set has: then a custom
collection or per-enterprise uploads ([IDEAS.md](IDEAS.md)).

---

## D-23 · Instance branding: name and images, set at runtime; no theming

**Decided:** an instance admin can set a name and three images (a logo, a
dark-theme variant, a square icon) on the admin page, at runtime, never in an
environment variable or at build time. The name lives in `instance_settings`,
the images as bytes in `instance_assets`. They replace the product's mark and
name wherever the software says who it is: sidebar, sign-in and setup pages,
tab title and favicon. A branded instance shows "Powered by OpenEAM" under the
sign-in form. Colours, fonts and layout are not customisable.

**Why:** it is what self-hosted tools do (GitLab, Gitea and Grafana stop at
name and logo in their open editions), and whoever pulls the image must be
able to brand it without a rebuild. Theming is out because colour carries
meaning here (domain, lifecycle, edge type); a customer colour would compete
with the model.

**Safety:** an uploaded SVG is an XSS vector. Images are embedded only as
`<img>`, where SVG runs no script, and `GET /api/branding/{slot}` adds a
scripts-forbidden CSP, `sandbox` and `nosniff`. Uploads are checked against
their file signature (SVG: no scripts, handlers or embeds) and capped at
512 KB. Bytes in the database keep the API container stateless and the images
in the backup.

**Revisit if:** one instance serves several clients who each want their own
brand: then per-enterprise branding, probably with a domain per enterprise.

---

## D-24 · The data bundle is a versioned snapshot, named for what it does; integration takes other paths

**Decided:** the data bundle stays what D-16 made it — a byte-faithful,
replace-only snapshot of whole enterprises — and is presented as that. Four
things follow.

- The page, sidebar entry and command-palette entry say **Export & Import**.
  The module, the `/api/data-exchange/*` endpoints and the `/data-exchange`
  route keep their names; a URL is an address, not a label.
- Every bundle carries a **`formatVersion`**. Import migrates an older bundle
  step by step to the current version (`data-bundle.format.ts`) and validates
  only the result, so the zod schema describes exactly one shape. A bundle
  from a newer OpenEAM is refused with a message naming both versions. A
  bundle without the field is version 0; everything the format gained before
  the field existed was additive, so the 0 → 1 step only stamps the version.
  Exports also carry `exportedAt` and `generator` (name and version), which
  import ignores.
- **When the version changes:** adding an optional field or array does not —
  an omitted field means null, its default, or empty, and that is the
  format's rule rather than a per-field accident. A rename, a split, a
  changed meaning, or a field that becomes required does, with a migration
  step that rewrites the old shape.
- **Integration is not the bundle's job.** The vision's spectrum ("meet the
  architecture where it is", UC-2) is three mechanisms with different
  semantics: the snapshot (this), a tabular import per entity type into one
  existing enterprise with upsert and a review step, and adapters that
  propose changes through the API. The second and third need a stable
  external key on rows (`externalId` plus its `source`), which is in the
  backlog and gets built with the first importer, not before. The ArchiMate
  Model Exchange File Format waits for someone who needs it; the metamodel
  here is TOGAF-shaped and the mapping would be lossy.

**Why the name:** "Data Exchange" is, nearly word for word, the industry's
name for tool interoperability (ArchiMate's exchange format), and promised what
the bundle does not do. Self-hosted tools that ship the same thing — GitLab's
project export, Grafana's dashboard JSON, Keycloak's realm export — call it
export and import.

**Why a version:** every one of those formats carries one, and without it
compatibility with older bundles can only be expressed as optional fields in
the schema, which accumulate and can never be removed. With it the schema is
strict about the current shape and the history lives in one place as explicit
steps. Refusing a newer bundle beats silently dropping the fields it carries.

**Why not merge:** a snapshot that merged would make the restore path lie — a
bundle restored over a changed enterprise would be neither. D-16 already says
merge is a diff, not a snapshot; that diff is the tabular importer.

**Revisit when:** the first structural change to the format lands (the
migration chain gets its first real step; the example bundles are regenerated
to the new version), or the first importer is built (external ids become a
column).

---

## D-25 · React Flow is the graph canvas, elk the layout; diagram-js stays inside bpmn-js

**Decided:** graph views are drawn with React Flow (`@xyflow/react`, MIT)
and laid out with elkjs (EPL-2.0). The landscape is the first. diagram-js
is no longer a direct dependency; it remains only as what bpmn-js is built
on, for the process diagrams, where the diagram is the source of truth and
its modelling features (palette, rules, command stack) are the point.

**How it is cut:** `landscape-graph.ts` is data only — viewpoint filtering,
`hosted_on` as containment, the elk layout and its orthogonal routes —
and has no DOM, so it can be tested as functions. `landscape-flow.tsx`
draws: nodes are React components, edges a custom type that follows elk's
route until an endpoint is dragged and the node handles after. Views are
generated from the model; hand work, when it comes, pins positions over the
generated layout (see IDEAS) and never replaces it.

**Why:** diagram-js is imperative SVG. Every node was drawn by hand in
tiny-svg, and nothing the rest of the app has — Tailwind, the tooltip, the
model icon component, the theme tokens — could be used inside it. D-22
records the cost: Lucide bundled twice because its components could not draw
there, and a synchronous icon pipeline just for the diagram. With nodes as
React components that cost is gone (`ModelIcon` renders inside a node like
anywhere else; the server-side icon sets stay, for the picker, search and
brand logos). React Flow is also what the React ecosystem builds node views
with in 2026: sub-flows for nesting, controls, minimap and keyboard handling
come built in instead of being wired one by one, and node positions are plain
x/y, which makes persisting them a table rather than a project. Its layouts
are deliberately not built in; elk remains the best layered, hierarchical
layout available and is what React Flow's own examples pair it with.

**Why elk still routes the edges:** React Flow's own edges run handle to
handle and, on a layered landscape with sixty blocks, cross through boxes.
elk's orthogonal routing goes around them. The custom edge draws that route
and only falls back to handle routing for the edges a drag has made stale.

**Not for everything:** React Flow renders every node as DOM and is right up
to a few hundred blocks; thousands want Cytoscape or Sigma, as a second view.
Capability maps, roadmaps, timelines and matrices are not graphs and belong
in plain React, SVG or a table, not in any diagram library.

**Revisit when:** a landscape with more than about a thousand visible blocks
is wanted on one canvas, or a view needs modelling rather than viewing.

