/* ============================================================
   storage.js — persistence layer.

   ALL reads and writes go through this module. The UI never
   touches localStorage directly, so a backend database can
   replace this layer later without rewriting any UI code.

   Note: localStorage is per-browser and per-device. It does
   NOT provide account sync or cross-device persistence.
   ============================================================ */

const Store = (() => {
  "use strict";

  const NS = "quran:v1";

  const Keys = {
    POSITION:   "reading-position",   // { surah, ayah, page?, juz?, updatedAt }
    MEM_AYAHS:  "memorized-ayahs",    // { "2:255": "2026-01-31" }  (surah:ayah -> date)
    MEM_SURAHS: "memorized-surahs",   // { "36": "2026-02-14" }     (surah   -> date)
    READING_LOG:"reading-log",        // { "2026-11-25": 14 }       (date -> ayahs viewed)
    REVISION:   "revision-ayahs",     // { "2:255": { last, due } }
    KHATM:      "khatm-sessions",     // [ { id, startedAt, targetDays?, completedAt?, stoppedAt?, pausedAt?, read: { "120": "2026-11-26" } } ]
    READ_AYAHS: "read-ayahs",         // { "2:255": { date, page } } (ayahs marked read in Read mode)
    BOOKMARKS:  "bookmarks",          // { "2:255": "2026-11-25T10:00:00Z" } (surah:ayah -> date)
    SURAH_VIEWED:"surahs-viewed",     // { "36": [1, 2, 3] }  (surah -> ayah numbers viewed)
    PREFS:      "preferences"         // { reciter, translation, dailyGoalAyahs, ... }
  };

  function read(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(`${NS}:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      console.warn(`Store: could not read "${key}"`, err);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn(`Store: could not write "${key}"`, err);
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(`${NS}:${key}`);
    } catch (err) {
      console.warn(`Store: could not remove "${key}"`, err);
    }
  }

  /* --- Reading position ------------------------------------ */

  function getPosition() {
    return read(Keys.POSITION);
  }

  function setPosition(position) {
    // position: { surah, ayah?, page?, juz? } — surah required
    return write(Keys.POSITION, {
      ...position,
      updatedAt: new Date().toISOString()
    });
  }

  function clearPosition() {
    remove(Keys.POSITION);
  }

  /* Local calendar date (YYYY-MM-DD). Uses the user's own
     timezone, not UTC, so "today" rolls over at local midnight —
     important for daily goals, streaks, and the reading log. */
  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /* --- Memorization -----------------------------------------

     Each saved ayah is stored as
       "2:255" -> { status, added, updated }
     where status is "learning", "memorized" or "revision".
     Records written by the previous version stored a plain date
     string; those are read as "memorized" so past marks keep
     their meaning without any data migration step.          */

  const MEM_STATUSES = ["learning", "memorized", "revision"];

  function normalizeMemEntry(value) {
    if (!value) return null;
    if (typeof value === "string") {
      return { status: "memorized", added: value, updated: value };
    }
    if (!MEM_STATUSES.includes(value.status)) return null;
    const day = value.added || value.updated || todayKey();
    return {
      status: value.status,
      added: value.added || day,
      updated: value.updated || day
    };
  }

  function getMemorizedAyahMap() {
    const raw = read(Keys.MEM_AYAHS, {}) || {};
    const out = {};
    for (const key of Object.keys(raw)) {
      const entry = normalizeMemEntry(raw[key]);
      if (entry) out[key] = entry;
    }
    return out;
  }

  function getMemorizedSurahMap() {
    return read(Keys.MEM_SURAHS, {}) || {};
  }

  /* Current status of one saved ayah, or null if not saved. */
  function getAyahMemStatus(key) {
    const entry = getMemorizedAyahMap()[key];
    return entry ? entry.status : null;
  }

  /* Only "memorized" counts as memorized everywhere. */
  function isAyahMemorized(key) {
    return getAyahMemStatus(key) === "memorized";
  }

  /* Add an ayah to the memorization list or change its status.
     Pass status = null to remove it. Khatm records are never
     touched — the two trackers are fully independent. */
  function setAyahMemStatus(key, status) {
    const map = getMemorizedAyahMap();
    if (MEM_STATUSES.includes(status)) {
      if (map[key]) {
        map[key] = { ...map[key], status, updated: todayKey() };
      } else {
        map[key] = { status, added: todayKey(), updated: todayKey() };
      }
    } else {
      delete map[key];
    }
    write(Keys.MEM_AYAHS, map);
    return MEM_STATUSES.includes(status) ? status : null;
  }

  /* Count of saved ayahs with a given status, excluding ayahs
     inside fully-recorded surahs (those count via the surah). */
  function countMemByStatus(status) {
    const surahMap = getMemorizedSurahMap();
    const ayahMap = getMemorizedAyahMap();
    let total = 0;
    for (const key of Object.keys(ayahMap)) {
      const surahNumber = key.split(":")[0];
      if (surahMap[surahNumber]) continue;
      if (ayahMap[key].status === status) total += 1;
    }
    return total;
  }

  /* Marking a whole surah also writes one memorized record per
     ayah, so per-ayah views always agree with this page. Unmarking
     removes only the "memorized" per-ayah records of that surah —
     ayahs saved as Learning or Needs Revision are kept. */
  function setSurahMemorized(surahNumber, memorized) {
    const n = Number(surahNumber);
    const map = getMemorizedSurahMap();
    const ayahMap = getMemorizedAyahMap();
    const today = todayKey();
    const surah = typeof getSurah === "function" ? getSurah(n) : null;

    if (memorized) {
      map[String(n)] = today;
      if (surah) {
        for (let a = 1; a <= surah.ayahs; a += 1) {
          const key = `${n}:${a}`;
          ayahMap[key] = ayahMap[key]
            ? { ...ayahMap[key], status: "memorized", updated: today }
            : { status: "memorized", added: today, updated: today };
        }
      }
    } else {
      delete map[String(n)];
      Object.keys(ayahMap).forEach((key) => {
        if (Number(key.split(":")[0]) === n && ayahMap[key].status === "memorized") {
          delete ayahMap[key];
        }
      });
    }

    write(Keys.MEM_SURAHS, map);
    write(Keys.MEM_AYAHS, ayahMap);
    return memorized;
  }

  /* Total memorized ayahs: full surahs count all their ayahs,
     individually saved ayahs count only when their status is
     "memorized" — Learning / Needs Revision do not count. */
  function countMemorizedAyahs() {
    const surahMap = getMemorizedSurahMap();
    let total = 0;

    for (const n of Object.keys(surahMap)) {
      const surah = typeof getSurah === "function" ? getSurah(n) : null;
      total += surah ? surah.ayahs : 0;
    }

    const ayahMap = getMemorizedAyahMap();
    for (const key of Object.keys(ayahMap)) {
      const surahNumber = key.split(":")[0];
      if (surahMap[surahNumber]) continue;
      if (ayahMap[key].status === "memorized") total += 1;
    }

    return total;
  }

  /* --- Per-surah viewed ayahs ---------------------------------
     "Read" for the Statistics page = ayahs actually viewed in
     the Reader. The Reader reports every newly-viewed ayah here.
     Khatm marks and memorized stars stay fully independent. */

  function getSurahViewedMap() {
    return read(Keys.SURAH_VIEWED, {}) || {};
  }

  function recordSurahAyahsViewed(surahNumber, ayahNumbers) {
    const surah = Number(surahNumber);
    if (!surah || surah < 1 || surah > 114) return;
    if (!Array.isArray(ayahNumbers) || !ayahNumbers.length) return;

    const map = getSurahViewedMap();
    const key = String(surah);
    const set = new Set(map[key] || []);
    let changed = false;
    for (const value of ayahNumbers) {
      const n = Number(value);
      if (Number.isInteger(n) && n >= 1 && !set.has(n)) {
        set.add(n);
        changed = true;
      }
    }
    if (!changed) return;
    map[key] = [...set].sort((a, b) => a - b);
    write(Keys.SURAH_VIEWED, map);
  }

  /* --- Reading log (automatic, updated by the Reader) -------- */

  function getReadingLog() {
    return read(Keys.READING_LOG, {});
  }

  /* Count ayahs the user actually looked at today. The Reader
     calls this once per newly-viewed ayah, deduplicated per
     session, so the number never invents reading. */
  function logAyahsViewed(count) {
    const add = Math.max(1, Number(count) || 1);
    const log = getReadingLog();
    const day = todayKey();
    log[day] = (Number(log[day]) || 0) + add;
    write(Keys.READING_LOG, log);
    return log[day];
  }

  function ayahsViewedOn(dateKey) {
    return Number(getReadingLog()[dateKey]) || 0;
  }

  /* --- Khatm sessions ---------------------------------------
     Model (v2): progress is counted in MUSHAF PAGES — 604 pages,
     marked in any order from the Read mode.
       session.read = { "120": "2026-11-26" }   page -> marked date
     A khatm is started once (from the Read-mode Khatm panel), optionally with a
     target number of days. Pause and stop keep all data:
       pausedAt  set  -> tracking paused, marks disabled, can resume
       stoppedAt set  -> session ended, kept in the past list
       completedAt set -> all 604 pages read
     Legacy sessions from the per-ayah model (keys like "2:255")
     are normalized: their ayah count is kept for display as
     legacyAyahs and an unfinished legacy session counts as
     stopped — page progress starts from zero. Khatm and
     Memorization remain fully independent records. */

  const TOTAL_PAGES = 604;
  const TOTAL_AYAHS = 6236;   // sum of surahs.js ayah counts

  function isLegacyKhatmSession(session) {
    return Object.keys(session.read || {}).some((key) => key.includes(":"));
  }

  function normalizeKhatmSession(session) {
    if (!session || typeof session !== "object") return session;
    let legacyAyahs = 0;
    if (isLegacyKhatmSession(session)) {
      /* Marks from the per-ayah model; an older numeric count
         (session.ayahsRead) is kept as a fallback for display. */
      legacyAyahs = Math.max(
        Object.keys(session.read).length,
        Number(session.ayahsRead) || 0
      );
    } else if (!session.read && Number(session.ayahsRead) > 0) {
      legacyAyahs = Number(session.ayahsRead);
    }
    const out = {
      ...session,
      read: session.read && !isLegacyKhatmSession(session) ? session.read : {},
      legacyAyahs
    };
    /* An old-format session that was never finished cannot track
       pages — it counts as stopped rather than active. */
    if (!out.completedAt && !out.stoppedAt &&
        (isLegacyKhatmSession(session) || !("read" in session))) {
      out.stoppedAt = session.pausedAt || session.startedAt || new Date().toISOString();
    }
    return out;
  }

  function getKhatmSessions() {
    return (read(Keys.KHATM, []) || []).map(normalizeKhatmSession);
  }

  /* The one session still open (not completed, not stopped). */
  function getActiveKhatm() {
    return getKhatmSessions().find((s) => !s.completedAt && !s.stoppedAt) || null;
  }

  /* True only when an active khatm is tracking marks (not paused). */
  function isKhatmTracking() {
    const session = getActiveKhatm();
    return Boolean(session && !session.pausedAt);
  }

  /* Pages read in a session (legacy ayah marks do not map to
     pages, so they add nothing to page progress). */
  function khatmPagesRead(session) {
    if (!session) return 0;
    return Object.keys(normalizeKhatmSession(session).read || {}).length;
  }

  function isKhatmPageRead(page) {
    const session = getActiveKhatm();
    if (!session) return false;
    return Boolean((session.read || {})[String(Number(page))]);
  }

  function startKhatm(options = {}) {
    if (getActiveKhatm()) return getActiveKhatm();

    const days = Number(options.targetDays);
    const session = {
      id: Date.now().toString(36),
      startedAt: new Date().toISOString(),
      targetDays: days >= 1 && days <= 3650 ? Math.floor(days) : null,
      completedAt: null,
      stoppedAt: null,
      pausedAt: null,
      read: {}                      // page number -> marked date
    };

    write(Keys.KHATM, [...getKhatmSessions().map((s) => ({ ...s })), session]);
    return session;
  }

  function updateKhatmSession(id, patch) {
    const sessions = getKhatmSessions().map((s) => ({ ...s }));
    const index = sessions.findIndex((s) => s.id === id);
    if (index === -1) return null;

    sessions[index] = { ...sessions[index], ...patch };
    write(Keys.KHATM, sessions);
    return sessions[index];
  }

  /* Mark / unmark one page as read in the active khatm.
     Only possible while tracking (active and not paused). */
  function setKhatmPageRead(page, isRead) {
    const session = getActiveKhatm();
    if (!session || session.pausedAt) return null;

    const read = { ...(session.read || {}) };
    const key = String(Math.min(TOTAL_PAGES, Math.max(1, Number(page))));
    if (isRead) read[key] = todayKey(); else delete read[key];

    const updated = updateKhatmSession(session.id, { read });
    return completeKhatmIfNeeded(updated);
  }

  /* Pause keeps every mark; nothing can be marked while paused. */
  function pauseKhatm() {
    const session = getActiveKhatm();
    if (!session || session.pausedAt) return session;
    return updateKhatmSession(session.id, { pausedAt: new Date().toISOString() });
  }

  function resumeKhatm() {
    const session = getActiveKhatm();
    if (!session || !session.pausedAt) return session;
    return updateKhatmSession(session.id, { pausedAt: null });
  }

  /* Stop ends the session but never deletes its data — it stays
     on record in the past list with the progress it reached. */
  function stopKhatm() {
    const session = getActiveKhatm();
    if (!session) return null;
    return updateKhatmSession(session.id, {
      stoppedAt: new Date().toISOString(),
      pausedAt: null
    });
  }

  function completeKhatmIfNeeded(session) {
    if (!session || session.completedAt) return session;
    if (Object.keys(session.read || {}).length >= TOTAL_PAGES) {
      return updateKhatmSession(session.id, {
        completedAt: new Date().toISOString(),
        pausedAt: null
      });
    }
    return session;
  }

  /* --- Ayahs marked read in Read mode ------------------------
     Toggling the numbered ayah-end circle stores the ayah and the
     mushaf page it belongs to. Counting the distinct pages gives
     the "x of 604 pages" progress without a lookup table, and a
     page drops back out of the count when its last mark is removed.
     This tracker is independent of khatm and memorization. */

  function getReadAyahMap() {
    const raw = read(Keys.READ_AYAHS, {}) || {};
    const out = {};
    for (const key of Object.keys(raw)) {
      const value = raw[key];
      if (typeof value === "string") {
        /* Early format: date only, page unknown. */
        out[key] = { date: value, page: null };
      } else if (value && typeof value === "object") {
        out[key] = {
          date: value.date || todayKey(),
          page: Number(value.page) || null
        };
      }
    }
    return out;
  }

  function isAyahRead(key) {
    return Boolean(getReadAyahMap()[key]);
  }

  function setAyahRead(key, on, page) {
    const map = getReadAyahMap();
    if (on) {
      map[key] = {
        date: todayKey(),
        page: Number(page) || (map[key] && map[key].page) || null
      };
    } else {
      delete map[key];
    }
    write(Keys.READ_AYAHS, map);
    return on;
  }

  /* Global ayah number (1-6236) -> { surah, ayah }, from the
     canonical per-surah counts in surahs.js. */
  function globalAyahLocation(globalN) {
    const n = Number(globalN);
    if (!Number.isInteger(n) || n < 1 || n > TOTAL_AYAHS) return null;
    let left = n;
    for (let s = 1; s <= 114; s += 1) {
      const meta = typeof getSurah === "function" ? getSurah(s) : null;
      const count = meta ? Number(meta.ayahs) : 0;
      if (left <= count) return { surah: s, ayah: left };
      left -= count;
    }
    return null;
  }

  /* Mark the clicked ayah and every ayah before it in reading order.
     One localStorage write, so even a click far into the Qur'an is
     instant. Pages already seen get their page recorded too. */
  function setAyahsReadThrough(globalN, pagesByGlobal) {
    const last = Math.min(TOTAL_AYAHS, Math.max(1, Number(globalN) || 1));
    const map = getReadAyahMap();
    const day = todayKey();
    for (let g = 1; g <= last; g += 1) {
      const loc = globalAyahLocation(g);
      if (!loc) continue;
      const key = `${loc.surah}:${loc.ayah}`;
      if (map[key]) continue;
      map[key] = {
        date: day,
        page: (pagesByGlobal && pagesByGlobal[g]) || null
      };
    }
    write(Keys.READ_AYAHS, map);
    return map;
  }

  function countReadAyahs() {
    return Object.keys(getReadAyahMap()).length;
  }

  /* Read ayahs in one surah, keyed by `surah:ayah` in the same map. */
  function countReadAyahsInSurah(surah) {
    const s = Number(surah);
    if (!Number.isInteger(s) || s < 1 || s > 114) return 0;
    const prefix = `${s}:`;
    return Object.keys(getReadAyahMap()).filter((key) => key.startsWith(prefix)).length;
  }

  /* Memorized ayahs in one surah. A fully memorized surah counts all of
     its ayahs; otherwise only individually memorized stars count. */
  function countMemorizedAyahsInSurah(surah) {
    const s = Number(surah);
    if (!Number.isInteger(s) || s < 1 || s > 114) return 0;
    const surahMap = getMemorizedSurahMap();
    if (surahMap[s]) {
      const meta = typeof getSurah === "function" ? getSurah(s) : null;
      return meta ? Number(meta.ayahs) || 0 : 0;
    }
    const prefix = `${s}:`;
    const ayahMap = getMemorizedAyahMap();
    return Object.keys(ayahMap).filter((key) =>
      key.startsWith(prefix) && ayahMap[key].status === "memorized"
    ).length;
  }

  function getReadPages() {
    const pages = new Set();
    for (const entry of Object.values(getReadAyahMap())) {
      if (Number.isInteger(entry.page) && entry.page >= 1 && entry.page <= TOTAL_PAGES) {
        pages.add(entry.page);
      }
    }
    return [...pages].sort((a, b) => a - b);
  }

  function countReadPages() {
    return getReadPages().length;
  }

  function isPageRead(page) {
    return getReadPages().includes(Number(page));
  }

  /* --- Preferences ------------------------------------------- */

  function getBookmarks() { return read(Keys.BOOKMARKS, {}) || {}; }
  function isBookmarked(key) { return Boolean(getBookmarks()[key]); }
  function setBookmarked(key, on) {
    const map = getBookmarks();
    if (on) map[key] = new Date().toISOString(); else delete map[key];
    write(Keys.BOOKMARKS, map);
    return on;
  }

  function getPreferences() {
    /* Tajweed colours are on by default. An explicit saved `false`
       still wins, so anyone who turned the toggle off stays off. */
    return { showTajwid: true, ...read(Keys.PREFS, {}) };
  }

  function setPreferences(prefs) {
    return write(Keys.PREFS, { ...getPreferences(), ...prefs });
  }

  /* --- Backup / restore ----------------------------------------
     Only the keys owned by this app are exported. Every storage
     operation still goes through read/write/remove, so a blocked
     or full localStorage never throws into the UI. */

  function exportData() {
    const data = {};
    Object.keys(Keys).forEach((name) => {
      const value = read(Keys[name], null);
      if (value !== null) data[Keys[name]] = value;
    });
    return {
      app: "quran-website",
      version: 1,
      savedAt: new Date().toISOString(),
      data
    };
  }

  function importData(backup) {
    if (!backup || backup.app !== "quran-website" ||
        !backup.data || typeof backup.data !== "object") {
      throw new Error("That file is not an Al-Furqon backup.");
    }
    Object.keys(Keys).forEach((name) => {
      const key = Keys[name];
      if (Object.prototype.hasOwnProperty.call(backup.data, key)) {
        write(key, backup.data[key]);
      } else {
        remove(key);
      }
    });
    return true;
  }

  function resetAll() {
    Object.keys(Keys).forEach((name) => remove(Keys[name]));
    return true;
  }

  return {
    Keys,
    read,
    write,
    getPosition,
    setPosition,
    clearPosition,
    getMemorizedAyahMap,
    getMemorizedSurahMap,
    getAyahMemStatus,
    setAyahMemStatus,
    isAyahMemorized,
    setSurahMemorized,
    countMemorizedAyahs,
    countMemByStatus,
    getReadingLog,
    ayahsViewedOn,
    logAyahsViewed,
    TOTAL_PAGES,
    TOTAL_AYAHS,
    getKhatmSessions,
    getActiveKhatm,
    isKhatmTracking,
    startKhatm,
    updateKhatmSession,
    khatmPagesRead,
    isKhatmPageRead,
    setKhatmPageRead,
    pauseKhatm,
    resumeKhatm,
    stopKhatm,
    todayKey,
    getReadAyahMap,
    isAyahRead,
    setAyahRead,
    globalAyahLocation,
    setAyahsReadThrough,
    countReadAyahs,
    countReadAyahsInSurah,
    countMemorizedAyahsInSurah,
    getReadPages,
    countReadPages,
    isPageRead,
    getBookmarks,
    isBookmarked,
    setBookmarked,
    getSurahViewedMap,
    recordSurahAyahsViewed,
    getPreferences,
    setPreferences,
    exportData,
    importData,
    resetAll
  };
})();

/* Some page scripts check `window.Store` before using it. */
window.Store = Store;
