---
name: Reading progress tracking
description: Design and implement reading progress in my-quran-app - last read position, completed chapters/verses, bookmarks, notes, streaks, and stats, respecting the app-token vs user-session split.
---

# Reading Progress Tracking

Use this when adding "continue reading", reading history, completion stats, or bookmarks-to-progress features.

## Choose the storage path

- **Signed-out users**: keep only a small local draft (e.g. `localStorage` key `qf.reading.local`) for last-read position. Mark it clearly as local-only and never send secrets.
- **Signed-in users**: persist through user-session APIs in a server route. Do not invent new SDK methods; use the existing client surface in `src/lib/sdk.ts`:
  - `auth.v1.bookmarks.create/list/remove` (scope `bookmark`)
  - `auth.v1.notes.create/list/remove` (scope `note`)
  - `auth.v1.collections.create/list/remove` (scope `collection`)
  - `auth.v1.goals.create/getTodaysPlan/update/remove` (scope `goal`)
  - `auth.v1.preferences.get/update` (scope `preference`)
  - `quranReflect.v1.posts.create/feed` (scope `post`)

If a dedicated progress API is not present in the installed SDK, model progress with the existing surfaces (e.g. a bookmark per last-read verse, a note per session, a goal for a daily target, preferences for translation/riwaya) instead of fabricating endpoints. Verify with `npm run sdk:status`.

## Server route pattern

Follow `src/app/api/bookmarks/route.ts` and `src/app/api/goals/route.ts`:

```ts
const sessionContext = await getSession(request);
const scopeCheck = ensureUserScope(sessionContext.session, "<scope>");
if (!scopeCheck.ok) return mutationError(sessionContext, scopeCheck);
const result = await runUserAction(sessionContext.session, (serverClient) =>
  serverClient.auth.v1.<surface>.<method>(payload),
);
if (result.sessionExpired) return mutationError(sessionContext, { ... signedOut: true, status: 401 });
if (result.error) return mutationError(sessionContext, { message: result.error, status: 400 });
return withSessionJson(sessionContext, { data: result.data, ok: true });
```

Validate all input: `parseVerseKey` for `CHAPTER:VERSE`, `parsePositiveInteger` for chapter IDs and counts.

## Data model suggestions

Normalize defensively into `src/lib/types.ts`:
- `ReadingProgressItem`: `verseKey`, `chapterId`, `lastReadAt`, `completed` (boolean), `source` (`local` | `user`).
- Derive stats from normalized items: verses read, chapters started/completed, current streak, longest streak, last 7 days.
- Compute percentages from `chapter.versesCount`, never hardcoded 114/6236 constants for the whole Quran without documenting the source.

## UX

- "Continue reading" link uses `buildReaderUrlFromKey` → `/read/<chapter>`.
- Show scope gating messages from `ensureUserScope`/bootstrap slices rather than hiding features silently.
- Optimistic UI updates are fine, but reconcile with the server response and surface errors.

## Tests

Add pure functions for progress math (streaks, percentages, normalization) in `src/lib/` and test them in `*.test.ts`. Keep route tests focused on status codes and gating.
