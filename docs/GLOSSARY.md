# Glossary

What each term means **in this codebase**. Mostly TOGAF's vocabulary, used
deliberately — where OpenEAM narrows a term or picks one reading over another,
that is said explicitly.

This is not decoration. Most of the code here is written by an AI assistant, and
a term used loosely in a comment becomes a field name, then a GraphQL type, then
a label an architect reads and mistrusts. If you are about to name something,
check it against this list first.

Terms are grouped by the question they answer.

## Scope

**Enterprise** — the scope of an architecture effort: one or more organizations,
or parts of them, pursuing a shared goal. A corporate group, a cross-company
collaboration, or a household. Not a synonym for "company". It is a *modelling*
boundary — every modelled row belongs to exactly one (INV-9), and two enterprises
that model the same real-world system link their models rather than sharing
rows — and, since accounts exist, also the *access* boundary: what a member of
an enterprise can see is exactly that enterprise (INV-16).

**Goal** — the shared goal that defines an enterprise's scope. Part of the
definition, not documentation: if you cannot state the goal, you have not yet
decided what the enterprise is.

## The business layer — what the enterprise does

**Business capability** — *what* an organization is able to do, stated so it stays
true when the how changes. "Subscription Billing", not "run the invoice script".
Capabilities are stable; the systems realizing them are not.

**Direction** — the strategic intent for a capability: `invest`, `sustain`,
`commodity` or `sunset`. Nullable, and null means **not yet decided**, not
"sustain by default" — most capabilities carry no direction until somebody at
that altitude sets one.

**Business process** — *how* a capability is delivered, as an ordered flow with a
trigger and an outcome. Belongs to exactly one capability. Where a capability is
stable, a process is the thing you actually change.

**Process step** — one step in a process. Synced *from* the BPMN diagram on every
save: the diagram is the source of truth, steps are derived (INV-7). Editing steps
directly is not a thing.

**Value stream** — the end-to-end sequence of stages delivering value for a
stakeholder need, from trigger to outcome. Crosses capabilities and organizational
boundaries by design; that crossing is the point.

**Value stream stage** — one stage of a value stream. Stages link to the
capabilities needed to perform them, which is how the business layer connects to
the architecture layer.

**Note on what value streams cannot express:** they model *triggered* value — a
need arises, value is delivered. They structurally cannot represent the ambient
value of a capability quietly working (a customer perfectly happy, never
contacting support). That value is real and currently invisible in the model.

## The architecture layer — what it is built from

**Building block** — a component of the architecture. Comes in two kinds, both
stored in one table (see D-1).

**ABB · Architecture Building Block** — the capability-shaped *need*. "Identity &
Access Management". Vendor-neutral, and it outlives the products that meet it.

**SBB · Solution Building Block** — the concrete thing that meets a need.
"Keycloak". Specific, replaceable, and dated.

**Realization** — the dated link from an ABB to an SBB: *this need is currently
met by that product*. Because it carries a validity interval, replacing a product
is modelled by closing one realization and opening another — which is what makes
the history readable years later.

**Architecture level** — TOGAF's depth of the Architecture Landscape:
`strategic`, `segment` or `capability`. Applies to ABBs only (INV-3). It is about
*altitude*, not importance.

**Architecture domain** — the lens a building block is viewed through. The four
TOGAF BDAT domains (Business, Data, Application, Technology) are seeded per
enterprise, and each enterprise may add its own. A block carries at least one
(INV-2), often several. Domain assignment is classification, not history — it has
no validity interval (D-5).

**Organization unit** — the "breadth" dimension: a hierarchical tree of divisions,
departments and teams, as modelled from one enterprise's perspective. A building
block's org-unit assignment answers *who owns this*, and it is temporal — ownership
moves.

**Lifecycle phase** — where a building block sits in its own life: `planned`,
`active`, `phasing_out`, `retired`. Distinct from validity dates. A block can be
`phasing_out` for two years while remaining perfectly valid; the phase is
*intent*, the dates are *fact*.

**Icon (of a building block)** — an Iconify id (`simple-icons:postgresql`,
`lucide:database`) naming a glyph this instance serves. Data, not an image:
chosen by a person so a list or diagram reads by shape, and saying nothing
about the model's structure (D-22). Distinct from the UI's own icons, which
are code.

## Actors

**Actor** — someone or something involved in delivering a capability: a `role`
("Head of Finance"), a `team` ("Platform Team"), an `individual`, or an `external`
party ("SOC 2 Audit Firm"). Not a synonym for person — most accountability sits
with a position or a team, and positions outlive the people in them (D-14).

**Involvement** — in what capacity: **`accountable`** (answers for the capability),
**`performs`** (does the work), **`consulted`** (has a say without owning it).
Three values rather than RACI; "informed" is noise in a model nobody updates.

**Note on the quadrant's name.** The capability page calls the card **People**,
because that is the classic capability dimension — people, process, information,
technology. The entity inside it is an *Actor*. Both are correct at their own
altitude; say "actor" when you mean the entity.

A `team` actor points at the **organization unit** that already models it rather
than repeating its name, so the two never drift apart (INV-13).

## Information

**Information object** — something the enterprise knows about, named in business
language and independent of whatever system holds it: "Expense Claim", "Customer
Master Data", "Access Grant". Deliberately one level — there is no system-level
data object beneath it the way an SBB sits beneath an ABB (D-13). Where it is
*stored* is a separate question, answered by building blocks.

**Usage** — how a capability relates to an information object, as one of three
values. **`owns`** is the one that carries weight: it names the capability
accountable for that information being correct, which is the question nobody can
usually answer. **`creates`** brings it into existence; **`uses`** consumes it
without being accountable for it. Kept small on purpose, like the relationship
taxonomy (D-3).

Note that owning information is not the same as holding it: in the Alderbrook
example, Security &amp; Compliance owns *Receipt Image* because of a seven-year
retention obligation, while the product team runs the store it physically sits in.

## Relationships between building blocks

**`depends_on`** — the generic edge. Source needs target to function.

**`data_flow`** — source sends data to target. Direction is the flow of data, not
of dependency.

**`hosted_on`** — containment: source *runs on* target. The odd one out — a block
has at most one active `hosted_on` edge (INV-5), because a thing runs in one place
at a time. This is what produces the nesting in the landscape diagram.

Deliberately only three (D-3).

## Time

**Validity interval** — `validFrom` inclusive, `validTo` exclusive, `null`
unbounded on that side (INV-1). Half-open, so two consecutive intervals that meet
at a date do not overlap on it.

**`asOf`** — the date the model is being read at. Not a filter over current data:
it reconstructs the landscape as it stood, from the validity intervals. Setting it
to a past date is how you answer "what was running on this platform then".

**Recency** — TOGAF's term for record metadata: when a row was created and last
updated. Present on every table as `created_at` / `updated_at`.

## Exchange

**Data bundle** — the JSON document the export endpoint produces and the import
endpoint consumes. Carries one or more enterprises and everything modelled within
them.

**Import replaces, it does not merge.** Importing a bundle deletes exactly the
enterprises it names and recreates them. It touches no other enterprise. There is
no partial or additive import.

## Access

**Account** — someone who can sign in: an email, a display name, a password.
Instance-level, not part of any enterprise's model, and therefore not in a data
bundle.

**Instance admin** — an account that runs the instance: other accounts and
sign-up (D-17), and an implicit owner of every enterprise (D-21). The first
account is one.

**Member** — an account with access to an enterprise, in one of three
**enterprise roles** (D-20): **owner** (everything, including members and
deleting the enterprise), **editor** (models it), **viewer** (reads it). Not
to be confused with the actor kind `role` (see Actors), which is something
modelled, not something granted.

**Permission** — one entry of the closed catalogue in `policy.ts` (`model.write`,
`members.manage`, …). Roles are bundles of permissions; code checks
permissions, never roles.

**Session** — one signed-in browser or script. A random token whose hash the
server keeps; the token itself is in an httpOnly cookie or a bearer header.
Signing out deletes the session, not the account.

**Setup link** — a one-time URL through which the account's owner sets their
password: on creation, and again when a password is forgotten (D-19). Issued
by an admin, valid seven days, revoked by the next one.

**Principal** — in the API, the resolved session attached to a request: the
account plus the ids of the enterprises it is a member of. Every service method
takes one and scopes its query by it.

## Terms deliberately not used

**Application** — too overloaded; an "application" is an SBB, or an ABB, depending
on which question is being asked. Say which.

**Service** — means a NestJS service in this codebase. Do not use it for a
modelled thing.

**Tenant** — there is no multi-tenancy. An enterprise is a modelling scope, not an
isolation boundary, and treating it as one would be a security assumption the code
does not currently support.

**Data object** — not modelled. The system-level counterpart to an information
object (a table, a dataset, a file store) was considered and declined; see D-13.
Say "information object" for the business concept, and name the building block if
you mean where it is stored.
