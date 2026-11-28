---
name: Quran content and reader
description: Implement Quran reading surfaces with @quranjs/api - chapter lists, paginated verses, translations, search, Arabic/RTL rendering, verse keys, and app-token server routes.
---

# Quran Content and Reader

Use this when adding or changing the reader, chapter list, search, or any Quran text display.

## Data access (app-token path)

All content/search calls happen server-side through `createClients(session).serverClient` from `src/lib/sdk.ts`. Existing patterns:

- `src/lib/data.ts`:
  - `loadContentPreviewData` → `content.v4.chapters.list()`, normalizes `translatedName.name`, `versesCount`.
  - `loadReaderData` → `content.v4.chapters.get(chapterId)` + `content.v4.verses.byChapter(chapterId, { page, perPage, fields: { textUthmani: true }, translations, words: false })`.
  - `loadSearchData` → `search.v1.query({ mode, query })` with `getSearchModeQuick()`.
- Routes: `/api/bootstrap`, `/api/search`, `/api/reader/[chapterId]`.

`READER_PAGE_SIZE` is 50 in `src/lib/data.ts`; fetch all pages with `Promise.all` like `loadReaderData` does, then flatten.

## Verse keys

- Canonical key format is `CHAPTER:VERSE`, e.g. `2:255`. Validate with `parseVerseKey` from `src/lib/data.ts`.
- `buildReaderUrlFromKey` maps `2:255` or `2:255-260` to `/read/2`. Use it for links.
- Display reference labels as `chapter:verse` and keep ranges as `chapter:from-to`.
- Never assume a key is valid because it came from an external API — normalize and filter.

## Text and RTL

- Prefer `textUthmani` for Arabic; fallbacks used in search normalization include `textUthmaniSimple`, `textImlaei`, `arabicText`, and `arabic`.
- Arabic text must render with `dir="rtl"` and `lang="ar"` on the element, with a Quranic font (e.g. `@fontsource/amiri-quran`). Keep translations LTR with `lang` set appropriately.
- Do not transliterate or "fix" Quranic text. Use the API text verbatim.
- Detecting Arabic in the existing code uses `/[\u0600-\u06ff]/`.

## Search

- Keep the query trimmed; return `{ query, navigationItems, verseItems, error }` shaped like `loadSearchData`.
- Navigation results (`navigation`) link to `/read/<key>`; verse results link via `buildReaderUrlFromKey`.

## Tests

Update `src/lib/data.test.ts` and `src/lib/page-model.test.ts` for normalization or display changes. Avoid snapshotting full API responses; assert on normalized fields.
