---
name: verify
description: How to launch and verify the OpenEAM app end-to-end (web + api + db).
---

# Verifying OpenEAM

## Two instances, pick by what the check does

**The test stack — the default, and the only place for anything that writes.**

- `pnpm dev:test` serves **http://127.0.0.1:3010** (API on `:4010`) against the database `<name>_test`, creating and seeding it on first use. Sign in as `admin@openeam.test` / `openeam-test` (instance admin, sees `/admin`). It holds the four public example enterprises; Meridian Mutual is the large one.
- `pnpm db:test` drops and reseeds that database. Stop `pnpm dev:test` first. Run it after a migration, or whenever a check left data behind.
- The web side is a Vite dev server on the working tree, so it shows current frontend code. The API runs from `apps/api/dist` as built: a running `pnpm dev` keeps that current; without one, build the API before trusting an API change here.
- It is `127.0.0.1` on purpose. Cookies ignore ports, so on `localhost` signing in would replace the development instance's session.

**The development instance — for looking at the developer's own data, read-only.**

- `pnpm dev` at the repo root builds `@openeam/db` then starts api (NestJS, dotenv from `.env`) and web (Vite) in parallel.
- Web dev server: **http://localhost:3000** (`strictPort: true` — if the port is busy, a dev server is already running and serves the current working tree via HMR; verify against it instead of starting another).
- API is proxied by Vite at `/graphql`, `/health` and `/api` (data exchange, icons, branding); needs Postgres per `DATABASE_URL` in `.env` (Docker Compose service).
- Its accounts are the developer's. If the untracked `.env.verify.local` exists, it holds one made for these checks (`VERIFY_EMAIL`, `VERIFY_PASSWORD`). Without it, use the test stack; do not create accounts or data here.

## Drive the UI headlessly

No Playwright browsers are installed. Use `playwright-core` with a system Chromium-based browser instead (no download): on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, on Linux `/usr/bin/google-chrome-stable`, on Windows `channel: 'msedge'`:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true });
```

Every route sits behind the sign-in gate. Sign in first (`#auth-email`, `#auth-password`, submit), then save `context.storageState()` and reuse it for further contexts. The current enterprise is `localStorage.enterpriseId`. The sidebar is collapsed by default, so labels like the enterprise name are hidden until you click `[data-sidebar="trigger"]`.

Install `playwright-core` in the scratchpad, not the repo.

## Gotchas

- Screenshot PNGs of the dark UI can read deceptively in previews; when a color looks wrong, sample pixels (`System.Drawing.Bitmap.GetPixel`) or query `getComputedStyle` in the page — trust those over the thumbnail.
- Theme is persisted in `localStorage.theme` (`'light' | 'dark'`, absent = system); an inline script in `apps/web/index.html` applies `.dark` on `<html>` pre-hydration.
- Routes with data (value-streams, building-blocks, …) query GraphQL; they render error states if the API/Postgres is down, so the shell can still be verified without the backend.
- Phone layouts: with `isMobile: true` a page wider than the screen widens `window.innerWidth` with it, so compare `document.documentElement.scrollWidth` against the viewport width you configured, not against `innerWidth`.
