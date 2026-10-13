# CLAUDE.md

Operating notes for AI assistants working in this repo, on top of [docs/](docs/) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Private enterprise data

Real, non-public enterprises (an employer's or client's actual architecture) sometimes get modelled here as data-exchange bundles so they can be read, imported, and updated locally. These live under `examples/private/`, which is gitignored. Never move a real-enterprise bundle outside that folder, and never name a real enterprise in any tracked file — docs, code comments, commit messages, anything that ends up in git — not even as an aside or example. `examples/household.json` is the only bundle that should ever be referenced in committed docs.

## Before considering lint clean

Run `pnpm lint` (repo-wide `biome check .`, per [CONTRIBUTING.md](CONTRIBUTING.md)) — not a scoped `biome check` against only the files touched in a change. Generated files (e.g. `packages/db/drizzle/meta/*.json`, written by drizzle-kit) can fail Biome's formatting without ever showing up in a per-file check.

## Icons: two kinds, two mechanisms

- **UI icons** (navigation, buttons, status): `lucide-react`, imported by name. No second UI icon library — `@hugeicons/*` was removed for duplicating Lucide (D-7).
- **Model icons** (what a user picks for a building block): Iconify ids stored as data, served by `/api/icons`, drawn via `components/icons/model-icon.tsx`. Never render one with `lucide-react` or an `icons[name]` lookup, never store SVG or a URL in `icon`, and never add an `@iconify-json/*` set without its prefix in `apps/api/src/icons/icon-id.ts` (D-22).

## Sidebar navigation is collapsed-icon-first

The sidebar defaults to collapsed/icon-only (`SidebarProvider defaultOpen={false}` in `app-shell.tsx`, persisted via a cookie once the user toggles it) — that's the primary, expected state, not a fallback for small screens. Design and structure the nav for icon+tooltip wayfinding first; anything that only reads correctly when expanded (group labels, longer item names) is a bonus for users who happen to keep it open, not something to rely on for disambiguation. E.g. `SidebarGroupLabel` section headers (Business/Architecture) are invisible in the default collapsed state — icons alone still need to make sense grouped or not.

## Docs update order

When a change touches more than one doc: [docs/VISION.md](docs/VISION.md) → [docs/USE-CASES.md](docs/USE-CASES.md) → [docs/USER-STORIES.md](docs/USER-STORIES.md) → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → [docs/DATABASE.md](docs/DATABASE.md) → [docs/DECISIONS.md](docs/DECISIONS.md) → [docs/GLOSSARY.md](docs/GLOSSARY.md) → [docs/BACKLOG.md](docs/BACKLOG.md) → [docs/IDEAS.md](docs/IDEAS.md) → `README.md`. Vision is the foundation everything else derives from or links back to; README summarizes the settled state last.

## Read these before changing code

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the map: package layout, where the rules live, and the numbered invariants (INV-1 … INV-17) that the model would silently lie about if broken. [docs/GLOSSARY.md](docs/GLOSSARY.md) defines the EAM vocabulary as *this* codebase uses it — a term used loosely in a comment becomes a field name and then a label an architect mistrusts, so check a name against it before inventing one.

Before changing something that looks arbitrary, check [docs/DECISIONS.md](docs/DECISIONS.md) — several shapes here are deliberate and the reasoning is recorded. If you decide something worth recording, append an entry rather than editing an existing one.

Known defects and committed work go in [docs/BACKLOG.md](docs/BACKLOG.md), not [docs/IDEAS.md](docs/IDEAS.md). Ideas is for things still waiting on a decision; anything with a reason to be done belongs in the backlog, where it can't be camouflaged among forty maybes.
