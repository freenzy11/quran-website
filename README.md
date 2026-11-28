# Al-Furqon — Read, Memorize, Khatm

Plain HTML/CSS/vanilla JS, with no build step. Al-Furqon uses the refined-star logo and the name shown in `Logo.dc.html` / `Main.dc.html`. Qur'an text, translations and Tajweed annotations come from Quran Foundation Content APIs; streamed recitations are credited to the selected reciter.

## Run locally

1. Copy `.env.example` to `.env` and set `QF_CLIENT_ID` and `QF_CLIENT_SECRET` with credentials issued by Quran Foundation. Set `QF_ENV=prelive` or `QF_ENV=production`; if unset, it defaults to `prelive`.
2. Start the app with `npm start` (or `node server.js` directly). There is no build step.
3. Open the app at http://localhost:3000.

`prelive` only has Surahs 1–2. Access to all 114 surahs requires `production` credentials approved by Quran Foundation.

Saved translation and reciter preference IDs are preserved. When a prelive catalog does not include the requested edition, the proxy supplies an available translation resource or a public ayah-by-ayah audio URL; the picker label reflects the edition actually served. The Uzbek preference currently shows the English fallback because the prelive translations catalog has no Uzbek resource.

The browser calls only local routes: `/api/qf/content/api/v4/...` for content and `/api/qf/audio` to resolve a reciter's ayah audio. `server.js` adds the auth token, so `QF_CLIENT_SECRET` stays server-side and is never sent to the browser. Never commit `.env`.

## Pages
- `index.html` — Home dashboard: continue reading, bookmarks, and a progress overview (memorized, khatm, today's goal) linking to Statistics.
- `pages/quran.html` — the Qur'an with one compact toolbar and a **Read | Memorize** switch. Both modes share bookmarks, read ayahs and the exact saved position: switching modes mirrors where you were instead of restarting.
  - **Read mode** — printed-mushaf pages (604) with surah banners, juz/page footer, swipe/arrow navigation and a small verse-by-verse audio bar. Tap a word to hear only that word. Ayah numbers are display-only; page-level read marking remains available from the page control.
  - **Memorize mode** — surah-by-surah study with transliteration, translation, repeat 1/3/5/10x, speed 0.75/1/1.25x, bookmark/star actions and hidden-text testing. The toolbar's three-line menu opens **Profile**, **Settings** and **Contact us**; Settings opens the right-side drawer with two tabs: **Display** and **Audio**. Display uses a pinned live preview above compact field tiles and switch chips, so changes are visible without scrolling back and forth; Audio holds the reciter and auto-play controls.
  - The drawer also adds optional Tajwid colouring. Qur’anic glyphs always use the QCF V4 or V2 page font supplied by Quran Foundation, chosen by the Tajwid switch; Amiri is only a fallback while a page font loads. Local Google Arabic font choices were removed because they are not QF mushaf fonts.
- `pages/settings.html` — standalone Settings for **Khatm & goals**, **Data** and **About** links only.
- `pages/statistics.html` — Statistics: Week | Month | All time switch; memorized ring (stars), streak card (consecutive days with at least one ayah read), weekly bars with an editable daily goal (default 40), khatm card (with "On track" chip, day ticks and "Open today's pages"), surah map (114 numbered squares sized by ayah count; gold = memorized, light gold = read) and juz map (30 boxes; boundaries fetched from Quran Foundation Content APIs, never guessed).
- `pages/about.html` — About, credits, data note.
- `pages/login.html` — Al-Furqon sign-in page from the new design. The Google and email-code buttons currently show an honest “coming soon” status; no account is created.
- `pages/privacy.html` — Privacy Policy, linked from the login page and site footers.
- `pages/terms.html` — Terms of Service, linked from the login page and site footers.

## Code map
- `js/storage.js` — every localStorage access (namespaced `quran:v1`, try/catch everywhere).
- `js/quran-api.js` — data-layer client for Quran Foundation Content APIs: chapters, surahs, pages, translations/transliteration, QCF V4 `code_v2` glyph words, word meanings, juz boundaries and audio URLs, normalised to the shapes the pages expect.
- `js/quran-page.js` — mode switch, shared Surah / Juz / Page index and right-side drawers, URL routing (`?mode=&page=&surah=&ayah=`). It carries the stored page + surah/ayah focus across modes.
- `js/mushaf.js` — Read mode controller; `js/reader.js` — Memorize mode controller; `js/khatm-panel.js` — the khatm start/pause/stop panel on the standalone Settings page.
- `js/more-settings.js`, `js/arabic-font.js`, `js/qcf-font.js`, `js/tajwid.js`, `js/word-audio.js` — drawer bindings, Arabic font mapping, per-page QCF V4 font loading, the Tajweed guide renderer and word-only audio shared by both modes.
- `js/app.js` — Home dashboard; `js/statistics.js` — Statistics page; `js/account.js` — sign-in page status messages.

## Data
- Text, pages, translations, QCF V4 glyph codes and Tajweed guide annotations: Quran Foundation Content APIs. Translation authors and reciters are credited with the content in the UI; tafsir resources, when shown, are credited too. Automatic browser translation is disabled (`<meta name="google" content="notranslate">` plus `translate="no"` on Qur'anic text) so vetted translations stay intact. Recitation audio is resolved by the proxy to Quran Foundation files when available and to public ayah-by-ayah CDN mirrors for reciters outside the account; it is streamed on demand, never stored, and credited to the selected reciter.
- Word-by-word highlighting during audio uses bundled timings in `data/timings/` (CC BY 4.0, from `cpfair/quran-align`); see `data/timings/CREDITS.md`. Ali Al-Hudhaify has no timing data, so that reciter falls back to the ayah-level highlight only.
- Progress, bookmarks and preferences live in the browser (localStorage via `js/storage.js`).
- Bookmark key `bookmarks`: `{ "surah:ayah": isoDate }`. Khatm session: `read` maps page numbers to marked dates; unfinished per-ayah sessions from the earlier format are archived, not deleted.
- Statistics inputs (all independent): `memorized-ayahs` / `memorized-surahs` (stars), `reading-log` (date → ayahs viewed) and `surahs-viewed` (surah → viewed ayah numbers, the "read" state on the Surah map), `khatm-sessions` (marked pages).
- Juz boundaries cache key `juz-boundaries` — fetched once from Quran Foundation Content APIs, never guessed.
