/* ============================================================
   quran-api.js — Qur'an data layer.

   Every request goes through this app's backend proxy at
   /api/qf/content/api/v4/... The browser never holds a Quran
   Foundation access token or client secret; server.js adds the
   x-auth-token/x-client-id headers and refreshes the token.

   All data is normalised here into the shapes the existing pages
   already expect, so reader.js, mushaf.js, quran-page.js and the
   Tajweed legend need no structural changes. No Qur'an text is
   stored or generated in this file.
   ============================================================ */

const QuranAPI = (() => {
  "use strict";

  const PROXY_BASE = "/api/qf/content/api/v4";
  const AUDIO_PROXY = "/api/qf/audio";
  const ORIGIN = window.location.origin && window.location.origin !== "null"
    ? window.location.origin : "http://localhost:3000";
  const TOTAL_PAGES = 604;   // standard Madani mushaf page count
  const PER_PAGE = 50;       // QF v4 maximum records per call
  const MAX_PAGES = 200;     // guard for paginated surah reads
  const QCF_TAJWEED_MUSHAF = 19;  // QCF V4 Tajweed word/page mapping

  const VERSE_FIELDS = [
    "text_uthmani", "verse_key", "verse_number", "verse_index",
    "chapter_id", "page_number", "juz_number", "sajdah_type", "sajdah_number"
  ].join(",");
  const WORD_FIELDS = [
    "position", "code_v2", "text_qpc_hafs", "text_uthmani", "audio_url",
    "char_type_name", "page_number", "v2_page", "line_number",
    "translation", "transliteration"
  ].join(",");

  /* Legacy preference IDs are intentionally kept as the public IDs.
     The qfId values are the matching Quran Foundation catalog IDs. */
  const RECITERS = [
    { id: "ar.alafasy",       label: "Mishary Alafasy",          qfId: 7 },
    { id: "ar.husary",        label: "Mahmoud Al-Husary",        qfId: 6 },
    { id: "ar.minshawi",      label: "Mohamed Al-Minshawi",      qfId: 9 },
    /* QF does not publish an ayah-by-ayah Hudhaify recitation. The
       saved preference is kept; the proxy uses its public CDN audio. */
    { id: "ar.hudhaify",      label: "Ali Al-Hudhaify",          qfId: 0 },
    { id: "ar.husarymujawwad", label: "Mahmoud Al-Husary (Mujawwad)", qfId: 0 },
    { id: "ar.sudais",        label: "Abdur-Rahman As-Sudais",   qfId: 0 },
    { id: "ar.maher",         label: "Maher Al-Muaiqly",         qfId: 0 },
    { id: "ar.ayyoub",        label: "Muhammad Ayyoub",          qfId: 0 },
    { id: "ar.shaatree",      label: "Abu Bakr Ash-Shaatree",    qfId: 0 },
    { id: "ar.jibreel",       label: "Muhammad Jibreel",         qfId: 0 }
  ];

  /* The legacy preference IDs never change. This prelive account only
     serves a handful of verse translations, so each saved edition also
     carries a working fallback resource. The API is asked for both; the
     requested one wins whenever the account can read it. */
  const TRANSLATIONS = [
    { id: "en.sahih",      label: "English — Abdel Haleem",   qfId: 85,  fallbacks: [] },
    { id: "uzbek_mansour", label: "O‘zbekcha — Mansur",       qfId: 101, fallbacks: [85] },
    { id: "ru.kuliev",     label: "Русский — Awqaf Egypt",    qfId: 45,  fallbacks: [78] },
    /* The prelive catalog has no Diyanet resource. Resource 210 is the
       Turkish edition this account can actually serve. */
    { id: "tr.diyanet",    label: "Türkçe — Dar Al-Salam",    qfId: 210, fallbacks: [] }
  ];
  const TRANSLITERATION_ID = 57;

  /* In-memory caches. Identical requests share one in-flight promise,
     and normalised surah/page payloads are reused on navigation. */
  const requestCache = new Map();
  const cache = new Map();

  function surahList() {
    if (typeof SURAHS !== "undefined" && Array.isArray(SURAHS)) return SURAHS;
    if (window.SURAHS && Array.isArray(window.SURAHS)) return window.SURAHS;
    return [];
  }

  function verseKeyFromGlobal(globalAyah) {
    let remaining = Number(globalAyah);
    if (!Number.isInteger(remaining) || remaining < 1) return null;
    for (const surah of surahList()) {
      if (remaining <= surah.ayahs) return `${surah.n}:${remaining}`;
      remaining -= surah.ayahs;
    }
    return null;
  }

  function globalFromVerseKey(key) {
    const parts = String(key || "").split(":");
    const surahNumber = Number(parts[0]);
    const ayah = Number(parts[1]);
    if (!surahNumber || !ayah) return 0;
    let total = 0;
    for (const surah of surahList()) {
      if (surah.n === surahNumber) return total + ayah;
      total += surah.ayahs;
    }
    return 0;
  }

  function translationById(id) {
    return TRANSLATIONS.find((t) => t.id === id) || null;
  }

  function normalizeTranslationId(id) {
    return translationById(id) ? id : TRANSLATIONS[0].id;
  }

  function qfTranslationId(id) {
    const translation = translationById(normalizeTranslationId(id));
    return translation ? translation.qfId : TRANSLATIONS[0].qfId;
  }

  /* Every configured edition keeps its legacy ID; the extra IDs are
     only used in the upstream request so prelive still returns text. */
  function qfTranslationIds(id) {
    const translation = translationById(normalizeTranslationId(id)) ||
      TRANSLATIONS[0];
    return Array.from(new Set(
      [translation.qfId].concat(translation.fallbacks || [])
        .map(Number).filter((value) => Number.isInteger(value) && value > 0)
    ));
  }

  function translationParam(id, includeTransliteration) {
    const ids = includeTransliteration ? [TRANSLITERATION_ID] : [];
    return ids.concat(qfTranslationIds(id)).join(",");
  }

  function normalizeReciterId(id) {
    return RECITERS.some((r) => r.id === id) ? id : RECITERS[0].id;
  }

  /* QF translations can contain footnote <sup> tags and entities.
     Pages render these as text, so make them genuinely plain text. */
  function plainText(value) {
    return String(value == null ? "" : value)
      .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, " [$1]")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\uFEFF/g, "")
      .trim();
  }

  function arabicText(value) {
    return String(value == null ? "" : value).replace(/\uFEFF/g, "").trim();
  }

  /* Kept for backwards compatibility. QF verse text does not carry a
     prefixed Bismillah, so the normaliser never needs to call it. */
  function stripBismillah(raw) {
    return { text: arabicText(raw), stripped: false };
  }

  /* QCF V4 renders whole words as single private-use glyphs. Keep both
     the glyph and a Unicode fallback for every word; the renderer swaps
     to the glyph once that word's page font is ready. */
  function glyphWordsFrom(verse, rawWords) {
    const versePage = Number(verse.page_number) || 1;
    return rawWords.map((word) => ({
      type: word.char_type_name || "word",
      glyph: String(word.code_v2 || ""),
      fallback: String(word.text_qpc_hafs || word.text_uthmani || ""),
      page: Number(word.v2_page || word.page_number) || versePage,
      line: Number(word.line_number) || 0
    }));
  }

  /* ── HTTP + pagination ──────────────────────────────────────────── */

  async function fetchJSON(path, params) {
    const url = new URL(PROXY_BASE + path, ORIGIN);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });
    const key = url.pathname + url.search;
    if (requestCache.has(key)) return requestCache.get(key);

    const promise = (async () => {
      let response;
      try {
        response = await fetch(url.toString());
      } catch (err) {
        throw new Error("Network error — check your connection.");
      }
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.json();
          detail = body && (body.error || body.message) ? ` ${body.error || body.message}` : "";
        } catch (_) { /* keep the status-only message */ }
        throw new Error(`Qur'an API returned ${response.status}.${detail}`);
      }
      return response.json();
    })();

    requestCache.set(key, promise);
    promise.catch(() => requestCache.delete(key));
    return promise;
  }

  async function fetchVerses(path, params) {
    const verses = [];
    let page = 1;
    for (let guard = 0; guard < MAX_PAGES; guard += 1) {
      const json = await fetchJSON(path, Object.assign({}, params, {
        page, per_page: PER_PAGE
      }));
      const batch = json && Array.isArray(json.verses) ? json.verses : [];
      for (const verse of batch) verses.push(verse);
      const next = Number(json && json.pagination && json.pagination.next_page);
      if (!batch.length || !Number.isInteger(next) || next <= page) break;
      page = next;
    }
    return verses;
  }

  /* QCF V4 word coordinates come from QF mushaf 19. A prelive account
     may not expose that mushaf; the default word response still carries
     code_v2 glyphs and v2_page values, so retry without the parameter
     instead of leaving the reader blank. */
  async function fetchQcfVerses(path, params) {
    try {
      return await fetchVerses(path, Object.assign({}, params, {
        mushaf: QCF_TAJWEED_MUSHAF
      }));
    } catch (err) {
      return fetchVerses(path, params);
    }
  }

  /* ── QF verse → legacy ayah shape ───────────────────────────────── */

  function verseToAyah(verse, options) {
    const opts = options || {};
    const key = String(verse.verse_key || "");
    const parts = key.split(":");
    const surahNumber = Number(verse.chapter_id || parts[0]);
    const n = Number(verse.verse_number || parts[1]);
    const global = Number(verse.verse_index) || globalFromVerseKey(key);
    const translationList = Array.isArray(verse.translations) ? verse.translations : [];
    const wantedIds = Array.isArray(opts.translationIds) ? opts.translationIds : [];
    const translationEntry = wantedIds.length
      ? (wantedIds.map((id) => translationList.find(
          (item) => Number(item.resource_id) === id
        )).find(Boolean) ||
         translationList.find((item) =>
           Number(item.resource_id) !== TRANSLITERATION_ID))
      : null;
    const transliterationEntry = translationList.find(
      (item) => Number(item.resource_id) === TRANSLITERATION_ID
    );
    const rawWords = Array.isArray(verse.words) ? verse.words : [];
    const words = rawWords.filter((word) =>
      !word.char_type_name || word.char_type_name === "word"
    );
    const wordMeanings = words.map((word) =>
      plainText(word.translation && word.translation.text)
    ).filter(Boolean);
    /* Some accounts have no verse-level translation at all. The QF word
       translations are still real translation text, so use them rather
       than leaving a blank line in the reader. */
    const translatedText = translationEntry
      ? plainText(translationEntry.text)
      : wordMeanings.join(" ");

    const ayah = {
      n,
      global,
      surahNumber,
      arabic: opts.useTranslation
        ? translatedText
        : arabicText(verse.text_uthmani),
      tajweed: null,
      bismillahStripped: false,
      juz: Number(verse.juz_number) || 1,
      page: Number(verse.page_number) || 1,
      sajdah: Boolean(verse.sajdah_type && verse.sajdah_type !== "none")
    };

    if (opts.includeGlyphs && rawWords.length) {
      ayah.glyphWords = glyphWordsFrom(verse, rawWords);
    }

    ayah.translation = translatedText;
    if (transliterationEntry) {
      ayah.transliteration = plainText(transliterationEntry.text);
    } else {
      const pieces = words
        .map((word) => word.transliteration && word.transliteration.text)
        .filter(Boolean)
        .map(plainText);
      ayah.transliteration = pieces.join(" ");
    }
    if (opts.includeWords) {
      ayah.wordByWord = words.map((word) =>
        plainText(word.translation && word.translation.text)
      );
    }
    return ayah;
  }

  /* ── Surah reads ────────────────────────────────────────────────── */

  async function loadSurah(n, translationId, study) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 114) {
      throw new Error(`Invalid surah number: ${n}`);
    }
    const legacyId = normalizeTranslationId(translationId);
    const cacheKey = `s${n}:${legacyId}:${study ? "study" : "plain"}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verses = await fetchQcfVerses(`/verses/by_chapter/${n}`, {
      language: "en",
      words: "true",
      translations: translationParam(legacyId, study),
      fields: VERSE_FIELDS,
      word_fields: WORD_FIELDS
    });
    if (!verses.length) throw new Error("Unexpected response from the Qur'an API.");

    const data = {
      ayahs: verses.map((verse) => verseToAyah(verse, {
        translationIds: qfTranslationIds(legacyId),
        includeWords: true,
        includeGlyphs: true
      })),
      /* QF does not prefix ayah 1 with the Bismillah. The pages draw
         the header themselves for every surah except 1 and 9. */
      headerBismillah: n !== 1 && n !== 9
    };
    cache.set(cacheKey, data);
    return data;
  }

  async function fetchSurah(n, translationId) {
    return loadSurah(n, translationId, false);
  }

  async function fetchSurahStudy(n, translationId) {
    return loadSurah(n, translationId, true);
  }

  /* ── Tajweed ────────────────────────────────────────────────────── */

  async function fetchTajweedSurah(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 114) {
      throw new Error(`Invalid surah number: ${n}`);
    }
    const cacheKey = `tj:s${n}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verses = await fetchVerses(`/verses/by_chapter/${n}`, {
      fields: "verse_key,verse_number,text_uthmani_tajweed"
    });
    if (!verses.length) throw new Error("Unexpected response from the Qur'an API.");

    const map = new Map();
    verses.forEach((verse) => {
      const text = verse.text_uthmani_tajweed;
      if (!text) return;
      map.set(Number(verse.verse_number), {
        units: window.QuranTajwid ? QuranTajwid.parse(text) : []
      });
    });
    cache.set(cacheKey, map);
    return map;
  }

  async function fetchAyahTajweed(globalAyah) {
    const key = Number(globalAyah);
    if (!Number.isInteger(key) || key < 1 || key > 6236) {
      throw new Error(`Invalid ayah number: ${globalAyah}`);
    }
    const cacheKey = `tj:a${key}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verseKey = verseKeyFromGlobal(key);
    if (!verseKey) throw new Error(`Invalid ayah number: ${globalAyah}`);
    const json = await fetchJSON(`/verses/by_key/${encodeURIComponent(verseKey)}`, {
      fields: "verse_key,verse_number,text_uthmani_tajweed"
    });
    const verse = json && json.verse;
    if (!verse || !verse.text_uthmani_tajweed) {
      throw new Error("Unexpected response from the Qur'an API.");
    }
    const units = window.QuranTajwid ? QuranTajwid.parse(verse.text_uthmani_tajweed) : [];
    cache.set(cacheKey, units);
    return units;
  }

  async function fetchAyahGlyphs(globalAyah) {
    const key = Number(globalAyah);
    if (!Number.isInteger(key) || key < 1 || key > 6236) {
      throw new Error(`Invalid ayah number: ${globalAyah}`);
    }
    const cacheKey = `qcf:a${key}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verseKey = verseKeyFromGlobal(key);
    if (!verseKey) throw new Error(`Invalid ayah number: ${globalAyah}`);
    const params = { words: "true", word_fields: WORD_FIELDS };
    let json;
    try {
      json = await fetchJSON(`/verses/by_key/${encodeURIComponent(verseKey)}`,
        Object.assign({}, params, { mushaf: QCF_TAJWEED_MUSHAF }));
    } catch (err) {
      json = await fetchJSON(`/verses/by_key/${encodeURIComponent(verseKey)}`, params);
    }
    const verse = json && json.verse;
    if (!verse || !Array.isArray(verse.words)) {
      throw new Error("Unexpected response from the Qur'an API.");
    }
    const glyphWords = glyphWordsFrom(verse, verse.words);
    cache.set(cacheKey, glyphWords);
    return glyphWords;
  }

  /* ── Word-by-word meanings ──────────────────────────────────────── */

  async function fetchWordByWordSurah(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 114) {
      throw new Error(`Invalid surah number: ${n}`);
    }
    const cacheKey = `wbw:s${n}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verses = await fetchVerses(`/verses/by_chapter/${n}`, {
      language: "en",
      words: "true",
      word_fields: "position,char_type_name,translation"
    });
    if (!verses.length) throw new Error("Unexpected response from the Qur'an API.");

    const map = new Map();
    verses.forEach((verse) => {
      const words = Array.isArray(verse.words)
        ? verse.words.filter((word) => !word.char_type_name || word.char_type_name === "word")
        : [];
      map.set(Number(verse.verse_number), words.map((word) =>
        plainText(word.translation && word.translation.text)
      ));
    });
    cache.set(cacheKey, map);
    return map;
  }

  async function fetchAyahWordByWord(globalAyah) {
    const key = Number(globalAyah);
    if (!Number.isInteger(key) || key < 1 || key > 6236) {
      throw new Error(`Invalid ayah number: ${globalAyah}`);
    }
    const cacheKey = `wbw:a${key}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verseKey = verseKeyFromGlobal(key);
    if (!verseKey) throw new Error(`Invalid ayah number: ${globalAyah}`);
    const json = await fetchJSON(`/verses/by_key/${encodeURIComponent(verseKey)}`, {
      language: "en",
      words: "true",
      word_fields: "position,char_type_name,translation"
    });
    const verse = json && json.verse;
    if (!verse || !Array.isArray(verse.words)) {
      throw new Error("Unexpected response from the Qur'an API.");
    }
    const meanings = verse.words
      .filter((word) => !word.char_type_name || word.char_type_name === "word")
      .map((word) => plainText(word.translation && word.translation.text));
    cache.set(cacheKey, meanings);
    return meanings;
  }

  /* ── Mushaf pages ───────────────────────────────────────────────── */

  async function fetchPage(pageNumber, editionId) {
    const page = Number(pageNumber);
    const requested = editionId || "quran-uthmani";
    const legacyEdition = requested === "quran-uthmani"
      ? null : normalizeTranslationId(requested);
    if (!Number.isInteger(page) || page < 1 || page > TOTAL_PAGES) {
      throw new Error(`Invalid page number: ${pageNumber}`);
    }
    const cacheKey = `p${page}:${legacyEdition || "quran-uthmani"}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const verses = await fetchQcfVerses(`/verses/by_page/${page}`, {
      words: "true",
      translations: legacyEdition ? translationParam(legacyEdition, false) : undefined,
      fields: VERSE_FIELDS,
      word_fields: WORD_FIELDS
    });
    if (!verses.length) throw new Error("Unexpected response from the Qur'an API.");

    const ayahs = verses.map((verse) => verseToAyah(verse, {
      translationIds: legacyEdition ? qfTranslationIds(legacyEdition) : [],
      useTranslation: Boolean(legacyEdition),
      includeWords: false,
      includeGlyphs: true
    }));
    /* QF verse text omits the Bismillah. Mushaf.js draws it once per
       surah header, using this flag as its cue. */
    ayahs.forEach((ayah) => {
      if (ayah.n === 1 && ayah.surahNumber !== 1 && ayah.surahNumber !== 9) {
        ayah.bismillahStripped = true;
      }
    });
    const data = { page, ayahs };
    cache.set(cacheKey, data);
    return data;
  }

  /* ── Navigation + catalog helpers ───────────────────────────────── */

  async function fetchSurahPageOf(n, ayahInSurah) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 114) {
      throw new Error(`Invalid surah number: ${n}`);
    }
    const cacheKey = `sp${n}`;
    let pages;
    if (cache.has(cacheKey)) {
      pages = cache.get(cacheKey);
    } else {
      const verses = await fetchVerses(`/verses/by_chapter/${n}`, {
        fields: "verse_number,page_number"
      });
      if (!verses.length) throw new Error("Unexpected response from the Qur'an API.");
      pages = new Map(verses.map((v) => [Number(v.verse_number), Number(v.page_number)]));
      cache.set(cacheKey, pages);
    }

    const want = Math.max(1, Number(ayahInSurah) || 1);
    let page = pages.get(want);
    if (page === undefined) {
      for (let a = want; a >= 1 && page === undefined; a -= 1) page = pages.get(a);
      for (let a = want; a <= pages.size && page === undefined; a += 1) page = pages.get(a);
    }
    return Math.min(TOTAL_PAGES, Math.max(1, Number(page) || 1));
  }

  async function fetchChapters() {
    const cacheKey = "chapters";
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const json = await fetchJSON("/chapters", { language: "en" });
    const chapters = json && Array.isArray(json.chapters) ? json.chapters : [];
    cache.set(cacheKey, chapters);
    return chapters;
  }

  async function fetchJuzStarts() {
    const cacheKey = "juz-starts";
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const json = await fetchJSON("/juzs");
    const juzs = json && Array.isArray(json.juzs) ? json.juzs : [];
    /* The catalog contains both canonical and duplicate mushaf rows.
       Keep one boundary per juz number. */
    const unique = new Map();
    for (const juz of juzs) {
      const number = Number(juz.juz_number);
      if (number >= 1 && number <= 30 && !unique.has(number)) unique.set(number, juz);
    }
    const refs = Array.from(unique.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, juz]) => {
        const key = verseKeyFromGlobal(Number(juz.first_verse_id));
        const parts = key ? key.split(":") : [];
        return { surah: Number(parts[0]), ayah: Number(parts[1]) };
      })
      .filter((ref) => ref.surah >= 1 && ref.ayah >= 1);
    if (refs.length !== 30) throw new Error("Unexpected juz data from the Qur'an API.");
    cache.set(cacheKey, refs);
    return refs;
  }

  /* ── Audio ──────────────────────────────────────────────────────── */

  /* The server resolves this URL through the QF recitation endpoint,
     then redirects to the audio file. Reciters outside the prelive
     catalog use their public CDN URL through the same proxy. The
     browser never sees a token or secret. */
  function audioURL(globalAyah, reciterId) {
    const id = normalizeReciterId(reciterId);
    const reciter = RECITERS.find((r) => r.id === id) || RECITERS[0];
    const safeGlobal = Math.min(6236, Math.max(1, Number(globalAyah) || 1));
    const verseKey = verseKeyFromGlobal(safeGlobal) || `1:${safeGlobal}`;
    const params = new URLSearchParams({
      reciter: String(reciter.qfId || 0),
      legacy: id,
      verse_key: verseKey,
      global: String(safeGlobal)
    });
    return `${AUDIO_PROXY}?${params.toString()}`;
  }

  return {
    fetchSurah,
    fetchSurahStudy,
    fetchPage,
    fetchAyahTajweed,
    fetchAyahGlyphs,
    fetchTajweedSurah,
    fetchAyahWordByWord,
    fetchWordByWordSurah,
    fetchSurahPageOf,
    fetchChapters,
    fetchJuzStarts,
    stripBismillah,
    audioURL,
    RECITERS,
    TRANSLATIONS,
    TOTAL_PAGES
  };
})();

/* Page scripts use both the lexical binding and this explicit export. */
window.QuranAPI = QuranAPI;
