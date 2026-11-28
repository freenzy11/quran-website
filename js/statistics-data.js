/* ============================================================
   statistics-data.js — connects the supplied statistics page to
   this site's own Store data.

   The page controller (js/statistics.js) expects one object on
   window.QURAN_STATS_DATA. This file builds that object from the
   real reading log, memorized stars, marked ayahs and khatm.
   No sample numbers are used.
   ============================================================ */

(function () {
  "use strict";

  /* Quran Foundation juz starts, cached so the juz map still works
     when the API cannot be reached. */
  const FALLBACK_JUZ_STARTS = [
    [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
    [5, 82], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
    [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
    [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
    [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1]
  ];
  const JUZ_CACHE_KEY = "juz-boundaries";

  function surahCount(n) {
    const surah = typeof getSurah === "function" ? getSurah(n) : null;
    return surah ? Number(surah.ayahs) || 0 : 0;
  }

  function verseKeyFromGlobal(globalAyah) {
    let remaining = Number(globalAyah);
    if (!Number.isInteger(remaining) || remaining < 1) return null;
    const list = typeof SURAHS !== "undefined" && Array.isArray(SURAHS) ? SURAHS : [];
    for (const surah of list) {
      if (remaining <= surah.ayahs) return `${surah.n}:${remaining}`;
      remaining -= surah.ayahs;
    }
    return null;
  }

  function loadJuzReferences() {
    const cached = Store.read(JUZ_CACHE_KEY, null);
    if (cached && Array.isArray(cached.refs) && cached.refs.length === 30) {
      return Promise.resolve(cached.refs);
    }

    /* Quran Foundation catalog, via the same backend proxy the reader
       uses. `first_verse_id` is the canonical 1–6236 ayah index. */
    return fetch("/api/qf/content/api/v4/juzs")
      .then((response) => {
        if (!response.ok) throw new Error(`API ${response.status}`);
        return response.json();
      })
      .then((json) => {
        const juzs = json && Array.isArray(json.juzs) ? json.juzs : [];
        /* QF publishes canonical and duplicate mushaf rows; keep one
           boundary per juz before building the map. */
        const unique = new Map();
        for (const juz of juzs) {
          const number = Number(juz.juz_number);
          if (number >= 1 && number <= 30 && !unique.has(number)) unique.set(number, juz);
        }
        const refs = Array.from(unique.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, juz]) => verseKeyFromGlobal(Number(juz.first_verse_id)))
          .map((key) => {
            const parts = key ? key.split(":") : [];
            return { surah: Number(parts[0]), ayah: Number(parts[1]) };
          })
          .filter((ref) => ref.surah >= 1 && ref.ayah >= 1);
        if (refs.length !== 30) throw new Error("Unexpected juz data");
        Store.write(JUZ_CACHE_KEY, { refs, savedAt: Store.todayKey() });
        return refs;
      })
      .catch(() => FALLBACK_JUZ_STARTS.map(([surah, ayah]) => ({ surah, ayah })));
  }

  function juzSegments(refs) {
    const segments = [];
    for (let j = 0; j < refs.length; j += 1) {
      const start = refs[j];
      const end = j + 1 < refs.length ? refs[j + 1] : null;
      const startCount = surahCount(start.surah);
      if (!startCount) continue;

      if (!end) {
        segments.push({ juz: j + 1, surah: start.surah, from: start.ayah, to: startCount });
        for (let s = start.surah + 1; s <= 114; s += 1) {
          if (surahCount(s)) segments.push({ juz: j + 1, surah: s, from: 1, to: surahCount(s) });
        }
        continue;
      }

      if (end.surah === start.surah) {
        segments.push({ juz: j + 1, surah: start.surah, from: start.ayah, to: end.ayah - 1 });
      } else {
        segments.push({ juz: j + 1, surah: start.surah, from: start.ayah, to: startCount });
        for (let s = start.surah + 1; s < end.surah; s += 1) {
          if (surahCount(s)) segments.push({ juz: j + 1, surah: s, from: 1, to: surahCount(s) });
        }
        segments.push({ juz: j + 1, surah: end.surah, from: 1, to: end.ayah - 1 });
      }
    }
    return segments;
  }

  function buildData(refs) {
    const fullSurahs = Store.getMemorizedSurahMap() || {};
    const ayahMap = Store.getMemorizedAyahMap() || {};
    const readMap = Store.getReadAyahMap() || {};
    const viewedMap = Store.getSurahViewedMap() || {};
    const memorizedByS = {};
    const readSurahs = [];

    for (let s = 1; s <= 114; s += 1) memorizedByS[s] = 0;

    for (const [n] of Object.entries(fullSurahs)) {
      const count = surahCount(n);
      if (count) memorizedByS[n] = count;
    }

    for (const [key, entry] of Object.entries(ayahMap)) {
      if (!entry || entry.status !== "memorized") continue;
      const n = Number(String(key).split(":")[0]);
      if (!n || n < 1 || n > 114 || fullSurahs[String(n)]) continue;
      const count = surahCount(n);
      if (memorizedByS[n] < count) memorizedByS[n] += 1;
    }

    for (let s = 1; s <= 114; s += 1) {
      const viewed = Array.isArray(viewedMap[String(s)]) && viewedMap[String(s)].length > 0;
      const marked = Object.keys(readMap).some((key) => Number(String(key).split(":")[0]) === s);
      if (viewed || marked) readSurahs.push(s);
    }

    const juzPct = {};
    const byJuz = new Map();
    for (const segment of juzSegments(refs)) {
      const total = Math.max(0, segment.to - segment.from + 1);
      if (!total) continue;
      let memorized = 0;
      if (fullSurahs[String(segment.surah)]) {
        memorized = total;
      } else {
        for (let a = segment.from; a <= segment.to; a += 1) {
          const entry = ayahMap[`${segment.surah}:${a}`];
          if (entry && entry.status === "memorized") memorized += 1;
        }
      }
      const acc = byJuz.get(segment.juz) || { total: 0, memorized: 0 };
      acc.total += total;
      acc.memorized += memorized;
      byJuz.set(segment.juz, acc);
    }
    for (const [juz, acc] of byJuz) {
      juzPct[juz] = acc.total ? Math.round((acc.memorized / acc.total) * 100) : 0;
    }

    let khatm = null;
    const session = Store.getActiveKhatm();
    if (session) {
      const pagesRead = Store.khatmPagesRead(session);
      const markedPages = new Set(
        Object.keys(session.read || {}).map((page) => Number(page)).filter(Number.isInteger)
      );
      const totalPages = Store.TOTAL_PAGES || 604;
      const startDate = Store.todayKey(new Date(session.startedAt));
      const today = Store.todayKey();
      const elapsed = Math.max(0, Math.round(
        (new Date(`${today}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000
      ));
      const days = Number(session.targetDays) || null;
      const remaining = Math.max(0, totalPages - pagesRead);
      const remainingDays = days ? Math.max(1, days - elapsed) : 1;
      const portion = Math.max(1, Math.ceil(remaining / remainingDays));

      let first = 1;
      while (first <= totalPages && markedPages.has(first)) first += 1;
      const last = Math.min(totalPages, Math.max(first, first + portion - 1));

      khatm = {
        startDate,
        days,
        pagesRead,
        todayPages: first <= totalPages ? [first, last] : [totalPages, totalPages]
      };
    }

    const goal = Math.floor(Number(Store.getPreferences().dailyGoalAyahs));

    return {
      readByDay: Store.getReadingLog() || {},
      memorizedByS,
      readSurahs,
      juzPct,
      dailyGoal: goal >= 1 ? goal : 40,
      khatm
    };
  }

  function start() {
    loadJuzReferences().then((refs) => {
      window.QURAN_STATS_DATA = buildData(refs);
      const script = document.createElement("script");
      script.src = "../js/statistics.js";
      document.body.appendChild(script);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
