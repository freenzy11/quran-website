---
name: Quran app verification
description: Verify changes to my-quran-app with the right checks - lint, build, Vitest, config and route smoke tests, SDK status, and a browser pass. Use before declaring work done.
---

# Quran App Verification

Always verify before saying a change is complete. Start narrow, then go broad.

## Fast checks

```bash
cd D:\quran-website\my-quran-app
npm run lint
npm test
npm run smoke:config
npm run smoke:routes
```

- `npm test` runs Vitest (`src/lib/*.test.ts`). Add a focused unit test with each logic change.
- `npm run smoke:config` and `npm run smoke:routes` are Node scripts in `test/`; they catch missing env wiring and route drift.

## Full checks

```bash
npm run build
npm run sdk:status
```

- `npm run build` uses `scripts/next-run.cjs`. Run it after route/component changes.
- `npm run sdk:status` confirms which `@quranjs/api` source is installed (remote npm vs local build). Run it for SDK wiring changes.

## Browser pass

Start the app with `npm run dev` and open `http://localhost:3000` (or the `PORT` from `.env.local`). Check:
- `/`, `/read/2`, `/search`, `/library`, `/goals`, `/reflect`, `/settings` render without runtime errors.
- Arabic verses render RTL with a readable Quranic font; translations remain LTR.
- Signed-out state shows scope gating messages instead of crashing.
- Forms return clear errors on invalid input.
- No token, secret, or raw session value appears in the DOM, console, or network responses.

Use the built-in browser tool for manual checks; the Playwright MCP server is available for scripted interaction if needed.

## Common failure signatures

- `createPublicClient`/`createServerClient` missing → run `npm run sdk:status`, then `npm run sdk:remote -- latest` or `npm run sdk:local -- <path>`.
- Missing env vars → compare `.env.local` with `.env.example` (never commit `.env.local`).
- 401/403 on user actions → sign in or missing granted scope; check bootstrap `grantedScopes` and `gatingMessage`.
