# Use Cases

The ordered list of what OpenEAM should let someone *decide*, and the order we
intend to make it possible. [IDEAS.md](IDEAS.md) is the parking lot for
technical choices; this is the parking lot's reason to exist. [VISION.md](VISION.md)
says where we're going — this says what we build next, and why that one first.
[USER-STORIES.md](USER-STORIES.md) breaks the current use case down into pieces
small enough to build, with acceptance criteria.

## What counts as a use case

A stakeholder question with a decision hanging off it:

> As a **solution architect**, I need to know **what depends on the ERP**, so I
> can decide **what to sequence into the migration**.

If the decision can't be named, it's a feature request, not a use case. Plenty
of real gaps in the model fail that test — they're things we noticed, not things
anyone would decide differently because of. Those wait.

## How we build one

**One use case at a time, as a vertical slice.** Schema → service invariants →
GraphQL → *entry UX* → view → example bundles → docs. The middle is the part
everyone skips and the part that decides whether the tool is used: an
organization unit tree that drives a filter but has no screen to create it in is
a slice with its middle missing.

**Every field names its updater.** For each attribute we add: who updates this,
and when would they notice it's wrong? No answer means the field doesn't get
added. An EAM repository doesn't die of a thin metamodel, it dies of a rich one
nobody keeps current.

**The examples are the proof.** [examples/household.json](../examples/household.json)
is the bundle every use case gets checked against. A use case isn't done until
it demonstrates it and a person with no seed data can get from empty to
answered.

### Definition of done

- [ ] The question can be answered in the UI, from an empty instance, without hand-writing JSON
- [ ] Every new field can be created and edited in the UI, not only imported
- [ ] Every new field has a named updater and a way to tell that it's stale
- [x] Service-layer invariants hold on the import path too — the bundle validator checks the whole bundle before anything is written ([data-bundle.validator.ts](../apps/api/src/data-exchange/data-bundle.validator.ts), D-16)
- [ ] `examples/household.json` exercises it, and `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build` pass
- [ ] README or `docs/` says how to use it

## The list

Ranked. Only the next one is detailed; the rest stay one paragraph until their
turn, so the ranking can change without wasted writing.

### UC-1 · Know what we run, and whether it's still true

*As an **architect or self-hoster**, I need to know **what building blocks exist,
who owns each one, and when someone last confirmed it**, so I can decide **what
to ask about, chase, or retire**.*

**Next up.** Unglamorous, and everything downstream is worthless without it:
impact analysis over a stale inventory is worse than no impact analysis, because
it's confidently wrong. This is also the slice that makes the data
self-sustaining, which is the only thing that keeps an EAM tool alive past its
first enthusiasm.

Roughly what it needs:

- **Ownership.** A person/role that a block belongs to — a stakeholder table plus
  a link to building blocks with a role (owner, technical contact). Note that
  `BusinessCapability.people` and `.information` already exist in the GraphQL
  model and the UI and return hardcoded empty lists; either fill them or drop
  them, but don't leave two permanently empty quadrants on the capability page.
- **Freshness.** `createdAt`/`updatedAt` exist on every table and are exposed
  nowhere. Surface them — and distinguish "the record changed" from "someone
  confirmed it's still true": a review timestamp is the field an architect
  actually acts on.
- **A list you can work in.** The building blocks page is a flat alphabetical
  table of every row, with no search, no filter by kind/lifecycle/domain/org
  unit, and no column for domain, owner, or freshness. At 72 blocks it's already
  unusable; a real landscape is ten times that.
- **The landscape's time default.** "As of" defaults to empty, which means
  everything: retired, active, and planned in one list. Defaulting to today makes
  the time dimension obvious instead of opt-in, and makes "what do we run"
  literally the first thing you see.
- **Realizations in context.** The Realized by column lists solutions without
  lifecycle or validity, so one retired and two planned solutions read as three
  current ones.

Explicitly *not* in this slice: dependencies, target states, work packages,
auto-ingest. They each get their own.

Broken down into stories with acceptance criteria in
[USER-STORIES.md](USER-STORIES.md#uc-1--know-what-we-run-and-whether-its-still-true).

### UC-2 · Get the landscape in without typing it

*As an **integrator or a new self-hoster**, I need to **turn what I already have
— a `package.json`, a CSV, a CMDB export — into building blocks**, so I can
decide **whether OpenEAM is worth adopting before I've spent a week on data
entry**.*

The [VISION](VISION.md) headline: integration is a spectrum and every point on it
should feel first-class. It's ranked here rather than later because it's what
keeps UC-1 true over time, and because reading a dependency manifest produces the
edges UC-3 needs as a side effect. Wants a review step — proposed blocks a human
accepts or rejects — not a blind write.

### UC-3 · Know what breaks if we change something

*As a **solution architect**, I need to know **what depends on this building
block**, so I can decide **the scope and sequence of a migration**.*

The question people actually buy an EAM tool for. The relationship gap is
closed: typed edges (`depends_on`, `data_flow`, `hosted_on`) now exist between
any two building blocks
([buildingBlockRelationships](../packages/db/src/schema/building-blocks.ts)),
turning the model from a star around capabilities into a graph, and a landscape
diagram ([diagram-js + elkjs](IDEAS.md), read-only, automatic layout) renders
it — `hosted_on` as real nesting (Azure containing Kubernetes containing what
runs on it) rather than a line.

Delivered ahead of its ranking. A building block's detail page now lets you
create and delete relationships to other blocks (type, description, validity
interval), on top of the GraphQL mutations and bundle import that were already
there — see US-3.1 in [USER-STORIES.md](USER-STORIES.md). Still incomplete: no
transitive traversal — today you see one hop, not "everything that depends on
this, directly and indirectly," which is what US-3.2 actually asks for.

### UC-4 · Know which capabilities are weakly supported

*As a **CIO**, I need to see **which business capabilities have thin, aging, or
no solution support**, so I can decide **where the next investment goes**.*

Mostly a view over data that already exists — `buildingBlockCapabilities` plus
lifecycle and validity — which makes it a cheap win once UC-1 has made the
lifecycle data trustworthy. Probably wants capability nesting (L1/L2/L3) first;
a flat list of twenty is readable, two hundred is not.

### UC-5 · Know where we're going and what work that implies

*As an **architect or project lead**, I need to **compare the baseline with a
target state and get the difference as work packages**, so I can decide **what
goes into the plan, and hand it to the tool we actually plan in**.*

The other [VISION](VISION.md) headline, and the biggest. Today the only way to
express a target is `lifecyclePhase: planned` with a future `validFrom`; there's
no grouping that says "these blocks together are the 2027 target", no transition
states, and no work packages to export. Needs UC-1 and UC-3 to mean anything.

### UC-6 · Know where the lifecycle risk is

*As a **security officer or CIO**, I need to see **what is unsupported, past its
validity, or has no owner**, so I can decide **what gets remediated this
quarter**.*

Largely falls out of UC-1's data with a viewpoint on top, plus whatever the model
needs to record end-of-support separately from our own retirement date.

### UC-7 · Show a view to someone who won't log in

*As an **architect**, I need to **hand a stakeholder one view of the model**, so
I can decide **nothing — they do, and they need to see it without an account**.*

A shareable or exportable viewpoint. Access restriction itself has landed:
accounts, sessions, and membership of an enterprise (see
[ARCHITECTURE.md](ARCHITECTURE.md), INV-16). What is still open here is the
product side — a view someone can read *without* an account, and roles within an
enterprise so that sharing is not all-or-nothing.

### UC-8 · Reference the same real thing from two enterprises

*As an **architect in a group of companies**, I need to **link my model of a
system to another enterprise's model of it**, so I can decide **impact across an
organizational boundary**.*

The ownership rule this rests on is already in place — every row belongs to
exactly one enterprise, and overlap is expressed with links rather than shared
rows. The link tables aren't built. Last because it's the one that needs the
most model underneath it.

## Maintaining this list

Ranking changes when what we learn changes it; that's the point of keeping only
the next one detailed. A use case moves out of the list when it's done, and what
it left behind gets a line in the README. Technical choices it drags in — a
library, a queue, a container — belong in [IDEAS.md](IDEAS.md), not here.
