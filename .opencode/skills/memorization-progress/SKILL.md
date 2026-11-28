---
name: Memorization (hifz) progress
description: Implement Quran memorization tracking - memorized ayah ranges, review queues, spaced repetition, daily goals, and mastery stats, using only real app APIs and local-first drafts.
---

# Memorization (Hifz) Progress

Use this when adding memorization plans, hifz tracking, review/dua schedules, tajweed practice, or mastery dashboards.

## Core concepts

- A memorization unit is a **verse range** `CHAPTER:FROM-TO` (single verse when `FROM === TO`). Validate with `parseVerseKey` for single verses and a strict regex for ranges, e.g. `/^\d+:\d+(?:-\d+)?$/`.
- Statuses: `new`, `learning`, `memorized`, `mastered`, `needs-review`.
- Keep review dates explicit (`nextReviewAt`, `lastReviewedAt`) and compute them in pure functions so they are easy to test.

## Spaced repetition (no external service)

Start with a simple, documented interval ladder, e.g. `1, 3, 7, 14, 30` days:
- On a successful review, advance one step; on a failed review, reset to step 0.
- Clamp `nextReviewAt` to a reasonable maximum and store ISO timestamps.
- Put the ladder and scheduling functions in `src/lib/` with unit tests.

Do not claim memorization accuracy from the app; only track what the user marks.

## Persistence

- Signed-out: local draft only (`localStorage`), clearly labeled as local.
- Signed-in: use existing user-session surfaces via server routes. Good mappings:
  - `goals` for a daily/weekly memorization target and today's plan (`auth.v1.goals.create/getTodaysPlan/update/remove`, scope `goal`).
  - `notes` for per-range memo/tajweed notes (scope `note`).
  - `collections` for a "My hifz" collection name (scope `collection`).
  - `bookmarks` for ranges to review (scope `bookmark`).
  - `preferences` for review interval preference (scope `preference`).
- Never fabricate SDK methods. Check `src/lib/sdk.ts` and `npm run sdk:status` first. If the SDK lacks a purpose-built hifz API, say so and use the mapping above.

## UI

- Show a review queue sorted by `nextReviewAt`, with quick actions `Again / Good / Easy` mapped to interval steps.
- Link every range to the reader with `buildReaderUrlFromKey`.
- Render Arabic with `dir="rtl" lang="ar"` and a Quranic font; translations LTR.
- Show progress as "memorized verses / target verses", not a fabricated percentage of the whole Quran unless the target is known.

## Verification

Run `npm run lint`, `npm test`, `npm run build`, `npm run smoke:routes` after changes. Test scheduling and normalization functions directly; do not rely on browser-only state for correctness.
