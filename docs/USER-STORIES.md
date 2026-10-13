# User Stories

The breakdown of [USE-CASES.md](USE-CASES.md) into pieces small enough to build.
A use case is a question someone needs answered; a story is one change that gets
them closer to answering it.

```
As a <role>, I want <capability>, so that <reason>.
```

The *so that* is not decoration. If it only restates the *want* in other words,
the story isn't understood well enough to build yet.

Stories are numbered after their use case (`US-1.4` belongs to `UC-1`) so it
stays obvious what a change is in service of. Like the use cases, only the
current one is written out in full — the rest are one line each until their turn,
so re-ranking costs nothing.

Acceptance criteria here are what "done" means for the *story*. They sit on top
of the slice-level [definition of done](USE-CASES.md#definition-of-done), which
still applies: entry UX, invariants on the import path, the example bundles, docs.

## Roles

- **Architect** — models and maintains the landscape. The primary user; in a
  small organization, the only one.
- **Owner** — accountable for one building block. Opens OpenEAM rarely, and only
  because something was asked of them.
- **Administrator** — runs the instance. Often the same person as the architect,
  and always the one who feels a rough edge in setup.
- **Integrator** — gets data in from somewhere else: a CMDB, a repository, a
  spreadsheet, a script.
- **Decision maker** — a CIO, a lead, a budget holder. Reads views, never models.
- **Stakeholder** — needs to see one thing, once, and may not have an account.

---

## UC-1 · Know what we run, and whether it's still true

The current use case. Full detail.

### US-1.1 · Assign an owner to a building block

> As an **architect**, I want to **record who owns a building block and who its
> technical contact is**, so that **I know who to ask when its information is
> wrong or out of date**.

- People can be created, edited, and listed within an enterprise
- A building block can be linked to one or more people, each with a role (owner, technical contact)
- The owner is visible on the building block's detail page and as a column in the list
- A person can be assigned to many blocks; removing a person doesn't delete the blocks
- Blocks with no owner are distinguishable at a glance, not silently blank

### US-1.2 · See when a block was last confirmed

> As an **architect**, I want to **see when someone last confirmed a building
> block is still accurate**, so that **I can tell an entry I can trust from one
> nobody has looked at in a year**.

- A building block carries a "last confirmed" moment, separate from `updatedAt` — editing a typo is not the same as vouching for the content
- The list and detail page show it in a form a human reads ("confirmed 3 months ago"), not a raw timestamp
- Entries past a staleness threshold are visually marked
- `createdAt` / `updatedAt` are exposed on the GraphQL models that need them; they are stored on every table today and surfaced nowhere

### US-1.3 · Confirm a block is still accurate

> As an **owner**, I want to **confirm in one click that my building block is
> still accurate**, so that **keeping the landscape honest costs me seconds, not
> an afternoon**.

- A single action on the detail page sets "last confirmed" to now, without opening an edit form
- Confirming records who confirmed it
- The action is reachable from a filtered list of the blocks that need it, so several can be handled in a row

### US-1.4 · Find a building block by name

> As an **architect**, I want to **search the building block list**, so that **I
> can reach the one I mean without scrolling a page that is only going to get
> longer**.

*(Done — [building-blocks/index.tsx](../apps/web/src/routes/building-blocks/index.tsx), client-side, filters as you type.)*

- Free-text match on name and description, filtering as you type
- Works alongside the filters from US-1.5 rather than resetting them
- An empty result says so, and says what was searched for

### US-1.5 · Filter the building block list

> As an **architect**, I want to **filter building blocks by kind, lifecycle,
> architecture domain, and organization unit**, so that **I can work on one
> corner of the landscape at a time**.

*(Done — same route. A page-local filter bar rather than the Landscape's shared `LandscapeFilters`, since the field sets only partially overlap (domain/org-unit) and search/kind/lifecycle are unique to this list.)*

- Filters for kind (ABB / SBB), lifecycle phase, architecture domain, organization unit
- Filters combine, and the active ones are visible and clearable
- The same viewpoint controls the Landscape page already offers — the list should not be the poorer relative

### US-1.6 · See the context of a block in the list

> As an **architect**, I want the list to **show each block's domain,
> organization unit, owner, and freshness**, so that **I can judge an entry
> without opening it**.

*(Partially done — domain and organization unit columns shipped alongside US-1.5. Owner and last-confirmed columns wait on US-1.1/US-1.2, which need new schema.)*

- Columns for architecture domain, organization unit, owner, last confirmed
- Long values degrade gracefully rather than breaking the row
- Still readable at a few hundred rows

### US-1.7 · See the landscape as it is today

> As an **architect**, I want the Landscape to **open on today's date**, so that
> **the first thing I see is what we actually run, not everything we have ever
> run**.

*(Done — [landscape/index.tsx](../apps/web/src/routes/landscape/index.tsx) and [landscape/diagram.tsx](../apps/web/src/routes/landscape/diagram.tsx) both default `asOf` to today; the backend already treated an empty `asOf` as "all time", so this was a frontend-only change.)*

- "As of" defaults to today; retired and not-yet-started blocks fall out of the default view
- Clearing the date is still possible and clearly means "all time"
- The active date is obvious enough that nobody misreads a future view as the present

### US-1.8 · See what really realizes a block, right now

> As an **architect**, I want the Landscape's *Realized by* column to **show each
> solution's lifecycle and validity**, so that **one retired and two planned
> solutions don't read as three current ones**.

*(Done — landscape/index.tsx. Each realizing solution shows its lifecycle phase; a realization whose own `validFrom`/`validTo` doesn't cover the selected `asOf` renders de-emphasized, mirroring the API's own validity check.)*

- Realizing solutions show lifecycle phase, and are visually separated when they fall outside the selected date
- The realization's own validity is respected, not just the block's

### US-1.9 · Manage organization units in the UI

> As an **architect**, I want to **create, rename, move, and delete organization
> units**, so that **I can model our structure without hand-writing a JSON
> bundle**.

- Tree view showing the hierarchy, with create / edit / delete
- A unit can be re-parented; a unit cannot become its own ancestor
- Deleting a unit that building blocks are assigned to is either prevented or explicit about the consequences
- The tree is the same one the Landscape filter uses

### US-1.10 · Assign a block to domains and organization units

> As an **architect**, I want to **set a building block's architecture domains
> and organization units, with validity dates, from its own form**, so that **a
> block I create in the UI is as complete as one I import**.

- Domain assignment (at least one, per the service rule) and organization unit assignment are part of create and edit
- Organization unit assignments take `validFrom` / `validTo`, since they are temporal
- Overlapping intervals for the same block and unit are rejected with a message that says which ones clash

### US-1.11 · Trust that an import cannot corrupt the landscape

> As an **administrator**, I want **an import that breaks the model's rules to be
> rejected with a clear message**, so that **restoring a backup can't quietly
> leave me with a landscape that lies**.

- Dangling references are reported as a list of problems, in the same shape as the schema validation errors — not as an untyped 500 from a database constraint
- The service-layer rules apply on the import path: architecture level only on ABBs, realizations pointing the right way round, at least one domain per block, no overlapping intervals
- A rejected import changes nothing; it already runs in a transaction, and the message should make clear nothing was written

*Shipped: `data-bundle.validator.ts` reports every violation with table and id before the transaction, and id collisions with other enterprises as a 400 inside it (D-16, D-18). "No overlapping intervals" is enforced as "one open row per pair", the same rule the services apply; full interval-overlap checking is still open everywhere (see INV-5 in ARCHITECTURE.md).*

### US-1.12 · Tell two enterprises apart

> As an **architect**, I want to **distinguish enterprises with similar names in
> the switcher**, so that **I don't model into the wrong one**.

- The switcher shows enough to disambiguate — description or goal alongside the name
- Which enterprise is active is visible without opening the switcher

### US-1.13 · Stop showing empty promises on the capability page

> As an **architect**, I want the capability page to **show People and
> Information only if they mean something**, so that **I'm not looking at two
> quadrants that are permanently empty by construction**.

- Either the quadrants are backed by real data (People can reuse US-1.1's people), or they come out of the model, the API, and the page
- Whichever way it goes, the GraphQL schema stops advertising fields that always return an empty list

### US-1.14 · Recognise a block at a glance

> As an **architect**, I want to **give a building block an icon — the
> product's logo or a generic glyph**, so that **a list or a diagram reads by
> shape before anyone reads the names**.

- An icon is picked from a search over product logos and generic icons, or removed again, in the block's own form
- The icon shows in the list, on the detail page and on the block's node in the landscape diagram
- An icon survives export and import; one this instance cannot draw shows a neutral placeholder instead of breaking anything

*Shipped: Iconify ids on `building_blocks.icon`, served from Simple Icons and
Lucide by the API itself (D-22).*

---

## UC-2 · Get the landscape in without typing it

- **US-2.1** — As an *integrator*, I want to derive building blocks and their dependencies from a repository's dependency manifest, so that a first landscape costs me minutes.
- **US-2.2** — As an *integrator*, I want to map a CSV or CMDB export onto the metamodel, so that I can use the inventory I already maintain.
- **US-2.3** — As an *architect*, I want to review proposed blocks before they land, so that an import adds to my model instead of overwriting my judgement.
- **US-2.4** — As an *integrator*, I want to re-run an ingest and see what changed, so that keeping the landscape current is a repeatable job rather than a one-off.

## UC-3 · Know what breaks if we change something

- **US-3.1** — As an *architect*, I want to record typed dependencies between building blocks, so that the model is a graph rather than a star around capabilities. *(Done — `depends_on`/`data_flow`/`hosted_on`, create/delete over GraphQL and from a building block's detail page in the UI.)*
- **US-3.2** — As a *solution architect*, I want to see everything that depends on a block, directly and indirectly, so that I can scope a migration. *(Not started — only direct, one-hop edges are visible today.)*
- **US-3.3** — As a *solution architect*, I want to see the landscape as a diagram with automatic layout, so that I can follow the dependencies instead of reading them. *(Done, read-only — [landscape/diagram.tsx](../apps/web/src/routes/landscape/diagram.tsx).)*
- **US-3.4** — As an *architect*, I want dependencies to carry validity like every other relationship, so that "what depended on it in 2024" is answerable. *(Done at the schema level — `validFrom`/`validTo` on every relationship, same as every other temporal table. Not yet surfaced by the diagram's `asOf` filter.)*

## UC-4 · Know which capabilities are weakly supported

- **US-4.1** — As an *architect*, I want capabilities to nest in levels, so that a real capability map stays readable.
- **US-4.2** — As a *decision maker*, I want a capability map coloured by how well each capability is supported, so that I can see where to invest.
- **US-4.3** — As a *decision maker*, I want to drill from a weak capability into what does and doesn't support it, so that the colour leads somewhere.

## UC-5 · Know where we're going and what work that implies

- **US-5.1** — As an *architect*, I want to define a target state as a named set of building blocks, so that "the plan" is a thing in the model and not a convention.
- **US-5.2** — As an *architect*, I want to see the difference between baseline and target, so that the gap is explicit.
- **US-5.3** — As a *project lead*, I want the gap turned into work packages, so that architecture work becomes delivery work.
- **US-5.4** — As a *project lead*, I want to export work packages to the tool we actually plan in, so that the architecture plan and the delivery plan don't drift apart.

## UC-6 · Know where the lifecycle risk is

- **US-6.1** — As an *architect*, I want to record end-of-support separately from our own retirement date, so that the vendor's clock and ours are not confused.
- **US-6.2** — As a *decision maker*, I want a view of what is unsupported, expired, or unowned, so that I can decide what gets remediated.
- **US-6.3** — As an *owner*, I want to be told when something of mine is about to become a problem, so that I hear it before the auditor does.

## UC-7 · Show a view to someone who won't log in

- **US-7.1** — As an *architect*, I want to export a view as a file I can send, so that a stakeholder can read it without an account.
- **US-7.2** — As an *architect*, I want to share a link to a saved viewpoint, so that everyone discusses the same cut of the model.
- **US-7.3** — As an *administrator*, I want roles within an enterprise, so that sharing doesn't mean sharing everything. *(Shipped: owner, editor and viewer per enterprise over a permission catalogue, D-20.)*
- **US-7.4** — As the *person who installed OpenEAM*, I want to run the instance — create and deactivate accounts, let people recover a password, open or close sign-up, and see which enterprise has which members — without touching the database. *(Shipped: the first account is the instance admin, D-17; passwords are set by their owners through one-time setup links, D-19.)*

## UC-8 · Reference the same real thing from two enterprises

- **US-8.1** — As an *architect*, I want to link my building block to another enterprise's block for the same real-world thing, so that neither of us has to give up our own description.
- **US-8.2** — As an *architect*, I want to follow those links across enterprises, so that impact analysis doesn't stop at an organizational boundary.
