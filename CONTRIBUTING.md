# Contributing

## Setup

Needs Node 24, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d      # Postgres only; `--profile app` would also start the containers
pnpm db:migrate
pnpm dev
```

Web on http://localhost:3000, API on http://localhost:4000. The first account
you create in the web app can always be created; see README.

## Before opening a PR

Run the same checks CI runs:

```bash
pnpm lint
pnpm check:examples   # icon ids in examples/*.json resolve
pnpm -r typecheck
pnpm -r build
```

Branch off `main`. Keep PRs focused.

## Before changing code

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the three packages, says where the business rules live, and lists the invariants (INV-1 … INV-17) the model depends on, and [docs/DATABASE.md](docs/DATABASE.md) is the schema table by table, including which invariants Postgres enforces itself. [docs/GLOSSARY.md](docs/GLOSSARY.md) defines the EAM vocabulary as this codebase uses it — the terms are TOGAF's and used deliberately, so a loose one is a defect rather than a style choice.

## Bigger decisions

Replacing a framework, adding a database, changing the auth model — open an issue to discuss before building. Choices already made, and blocked upgrades, are recorded in [docs/DECISIONS.md](docs/DECISIONS.md); if something looks arbitrary, check there before changing it.

## Backlog and ideas

Known defects and committed next steps are in [docs/BACKLOG.md](docs/BACKLOG.md) — that's the place to look for something to pick up. Things deliberately left out, and roughly when they'd matter, live in [docs/IDEAS.md](docs/IDEAS.md); it's an ideas box, not a committed plan.

By contributing you agree your work is licensed under [Apache-2.0](LICENSE).
