---
name: Quran app guardrails
description: Non-negotiable rules for editing the my-quran-app Next.js starter - SDK public/server split, secret handling, OAuth flow preservation, route patterns, and verification. Load before changing app code.
---

# Quran App Guardrails

This workspace contains `my-quran-app`, the official Quran Foundation Next.js starter built on `@quranjs/api`. Read `my-quran-app/AGENTS.md`, `my-quran-app/docs/architecture.md`, and `my-quran-app/docs/recipes/` when they apply.

## Keep the SDK boundary

- `@quranjs/api/public` is browser-safe and only starts OAuth. `@quranjs/api/server` is for server routes only.
- All SDK calls live in `src/app/api/**/route.ts` or `src/app/callback/route.ts`. Browser code calls our own JSON routes; it never imports the SDK.
- Never import `@quranjs/api/server` into `page.tsx`, client components, or any `"use client"` file.
- `src/lib/sdk.ts` has `import "server-only"` — keep it that way.

## Two token paths

- **App token** (`client_credentials`): content + search. Works for signed-out visitors.
- **User session token**: notes, bookmarks, collections, goals, preferences, reflections. Requires OAuth login and the matching granted scope.
- Never mix them. Never call a user API without a valid session.

## Secrets

- Never print, log, render, or expose `CLIENT_SECRET`, `SESSION_SECRET`, access/refresh tokens, session IDs, or raw session payloads.
- `.env.local` is local-only. Use `{env:NAME}` style references in tooling config, not inline values.
- The browser gets only the signed `qf.sid` cookie (`httpOnly`, SameSite-aware).

## Auth behavior to preserve

- Authorization Code + PKCE, `/api/auth/start`, `/callback`, `/api/api/session/refresh`, `/api/auth/logout` with OIDC end-session.
- Do not replace OIDC logout with cookie deletion.
- If relaxing `SameSite`, enabling broad CORS, or accepting form-encoded mutations, add an explicit CSRF token check.

## Route + feature pattern

For a new user-facing feature:
1. Decide token path (app token vs user session).
2. Add a server route under `src/app/api/**/route.ts`.
3. For user APIs: `getSession(request)` → `ensureUserScope(session, scope)` → `runUserAction(session, client => ...)` → `withSessionJson` / `mutationError`.
4. Validate input with helpers in `src/lib/data.ts` (`parseVerseKey`, `parsePositiveInteger`).
5. Update types in `src/lib/types.ts` and normalize unknown SDK responses defensively (`toArray`, `asObject`, etc.).
6. Add UI in `src/components/starter-shell.tsx` (or a focused sibling component), keeping it SDK-free.
7. Add tests in `src/lib/*.test.ts`; add smoke checks for new routes.

## Verification

Run the narrowest check first, then the full set before finalizing:
```bash
cd my-quran-app
npm run lint
npm run build
npm test
npm run smoke:config
npm run smoke:routes
npm run sdk:status
```
