---
name: verify
description: How to launch and verify the OpenEAM app end-to-end (web + api + db).
---

# Verifying OpenEAM

## Launch

- `pnpm dev` at the repo root builds `@openeam/db` then starts api (NestJS, dotenv from `.env`) and web (Vite) in parallel.
- Web dev server: **http://localhost:3000** (`strictPort: true` — if the port is busy, a dev server is already running and serves the current working tree via HMR; verify against it instead of starting another).
- API is proxied by Vite at `/graphql`, `/health` and `/api` (data exchange, icons, branding); needs Postgres per `DATABASE_URL` in `.env` (Docker Compose service).

## Drive the UI headlessly

No Playwright browsers are installed. Use `playwright-core` with a system Chromium-based browser instead (no download): on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, on Linux `/usr/bin/google-chrome-stable`, on Windows `channel: 'msedge'`:

```js
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true });
```

Every route sits behind the sign-in gate. Sign in first (`#auth-email`, `#auth-password`, submit) — the dev DB needs an account; if there is none, the form offers sign-up and that first account becomes the instance admin (sees `/admin`). The sidebar is collapsed by default, so labels like the enterprise name are hidden until you click `[data-sidebar="trigger"]`.

Install `playwright-core` in the scratchpad, not the repo.

## Gotchas

- Screenshot PNGs of the dark UI can read deceptively in previews; when a color looks wrong, sample pixels (`System.Drawing.Bitmap.GetPixel`) or query `getComputedStyle` in the page — trust those over the thumbnail.
- Theme is persisted in `localStorage.theme` (`'light' | 'dark'`, absent = system); an inline script in `apps/web/index.html` applies `.dark` on `<html>` pre-hydration.
- Routes with data (value-streams, building-blocks, …) query GraphQL; they render error states if the API/Postgres is down, so the shell can still be verified without the backend.
