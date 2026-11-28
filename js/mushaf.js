/* ============================================================
   mushaf.js — Read mode controller (pages/quran.html).

   A printed-mushaf feel: one of the 604 Madani pages at a time,
   Arabic only, centered, on soft paper. Data comes live from
   Quran Foundation /content/api/v4/verses/by_page/{n} — nothing is
   hard-coded. Line breaks differ from the printed mushaf, which
   is acceptable for an open-license font.

   - swipe or arrow keys / buttons to turn pages
   - surah title banner + bismillah line when a surah starts here
   - ayah-end markers (small numbered circles)
   - page number and juz at the bottom
   - small audio bar: verse-by-verse recitation of this page
   - tap a word to hear a separate word-only clip (no hover buttons)
   - shared toolbar translation toggle (OFF by default)
   - the thin ayah progress line at the top and one "Mark page
     as read" button at the bottom of each page while a khatm
     is active. Khatm start / pause / stop now live in Settings;
     progress is never lost. Khatm and memorized stars are
     fully independent.
   ============================================================ */

(function () {
  "use strict";

  const els = {
    article:      document.getElementById("mushaf"),
    position:     document.getElementById("page-position"),
    prev:         document.getElementById("page-prev"),
    next:         document.getElementById("page-next"),
    markRow:      document.getElementById("mark-page-row"),
    markBtn:      document.getElementById("mark-page"),
    khatmLine:    document.getElementById("khatm-line"),
    khatmFill:    document.getElementById("khatm-line-fill"),
    khatmLabel:   document.getElementById("khatm-line-label"),
    surahReadLine:  document.getElementById("surah-read-line"),
    surahReadLabel: document.getElementById("surah-read-label"),
    readProgress: document.getElementById("read-progress"),
    translation:  document.getElementById("translation-toggle"),
    toast:        document.getElementById("reader-toast"),
    audioBar:     document.getElementById("audio-bar"),
    audioToggle:  document.getElementById("audio-toggle"),
    audioPrev:    document.getElementById("audio-prev"),
    audioNext:    document.getElementById("audio-next"),
    audioLabel:   document.getElementById("audio-bar-label"),
    readView:     document.getElementById("read-view")
  };

  const FONT_SIZES = [22, 26, 30, 34, 40];
  const DEFAULT_FONT_INDEX = 2;

  const state = {
    page: 1,
    data: null,          // { page, ayahs } for the current page
    translation: null,   // same page in the chosen translation (lazy)
    loading: false,
    fontIndex: DEFAULT_FONT_INDEX
  };

  const audio = new Audio();
  audio.preload = "none";
  let audioIndex = -1;       // index into state.data.ayahs
  let audioStarted = false;  // true once playback started this page
  let readRepeatLeft = 1;    // repeat count for the current read-mode ayah

  /* --- Small helpers ------------------------------------------ */

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function toArabicDigits(n) {
    return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  }

  let toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
  }

  function prefs() {
    return Store.getPreferences();
  }

  function translationId() {
    const id = prefs().translation;
    return QuranAPI.TRANSLATIONS.some((t) => t.id === id)
      ? id
      : QuranAPI.TRANSLATIONS[0].id;
  }

  function translationShown() {
    const p = prefs();
    return p.showTranslation === undefined
      ? p.showTranslationRead === true
      : p.showTranslation !== false;
  }

  function readRepeat() {
    const v = Number(prefs().repeat);
    return [1, 3, 5, 10].includes(v) ? v : 1;
  }

  function reducedMotion() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* --- Font size ------------------------------------------------
     One A− / A+ control drives both CSS variables, so the two
     modes stay in step. Memorize mode listens for the preference
     event and updates its own article immediately. */

  function applyArabicFont() {
    if (window.QuranFont) window.QuranFont.apply(prefs().arabicFontStyle);
  }

  function applyFontSize() {
    const px = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, state.fontIndex))];
    document.documentElement.style.setProperty("--mushaf-arabic-size", `${px}px`);
    document.documentElement.style.setProperty("--ayah-arabic-size", `${px + 2}px`);
    document.querySelectorAll(".font-smaller").forEach((b) => {
      b.disabled = state.fontIndex <= 0;
    });
    document.querySelectorAll(".font-larger").forEach((b) => {
      b.disabled = state.fontIndex >= FONT_SIZES.length - 1;
    });
  }

  function announcePrefs(extra) {
    document.dispatchEvent(new CustomEvent("quran-prefs-changed", { detail: extra }));
  }

  function announcePlayState(playing) {
    document.dispatchEvent(new CustomEvent("quran-play-state", {
      detail: { mode: "read", playing }
    }));
  }

  function bindFontButtons() {
    document.querySelectorAll(".font-smaller").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.fontIndex = Math.max(0, state.fontIndex - 1);
        Store.setPreferences({ arabicSizeIndex: state.fontIndex });
        applyFontSize();
        announcePrefs({ arabicSizeIndex: state.fontIndex });
      });
    });
    document.querySelectorAll(".font-larger").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.fontIndex = Math.min(FONT_SIZES.length - 1, state.fontIndex + 1);
        Store.setPreferences({ arabicSizeIndex: state.fontIndex });
        applyFontSize();
        announcePrefs({ arabicSizeIndex: state.fontIndex });
      });
    });
  }

  /* --- Read tracker: top progress line only ------------------------ */

  function markerTitle(n, read) {
    return read
      ? `Ayah ${n} — marked as read.`
      : `Ayah ${n} — not marked as read.`;
  }

  function setMarkerState(marker, read) {
    marker.classList.toggle("is-read", read);
    marker.setAttribute("aria-pressed", String(read));
    const title = markerTitle(Number(marker.dataset.n), read);
    marker.title = title;
    marker.setAttribute("aria-label", title);
  }

  function allPageAyahsRead() {
    if (!state.data || !state.data.ayahs.length) return false;
    return state.data.ayahs.every((a) =>
      Store.isAyahRead(`${a.surahNumber}:${a.n}`));
  }

  /* Clicking an ayah means "I've read up to here": that ayah and
     every ayah before it in Quranic order get marked. */
  function setReadThrough(globalN) {
    const pages = {};
    if (state.data) {
      state.data.ayahs.forEach((a) => { pages[a.global] = a.page || state.page; });
    }
    Store.setAyahsReadThrough(globalN, pages);
    els.article.querySelectorAll('.m-marker[data-global]').forEach((m) => {
      if (Number(m.dataset.global) <= globalN) setMarkerState(m, true);
    });
  }

  /* "Mark page as read" marks through the last ayah on this page.
     Unmarking affects only this page, leaving earlier reading intact. */
  function setPageAyahsRead(read) {
    if (!state.data) return;
    if (read) {
      const last = state.data.ayahs.reduce((max, a) => Math.max(max, a.global), 0);
      if (last) setReadThrough(last);
      return;
    }
    state.data.ayahs.forEach((ayah) => {
      const key = `${ayah.surahNumber}:${ayah.n}`;
      if (!Store.isAyahRead(key)) return;
      Store.setAyahRead(key, false, ayah.page || state.page);
      const marker = els.article.querySelector(`.m-marker[data-global="${ayah.global}"]`);
      if (marker) setMarkerState(marker, false);
    });
  }

  function refreshReadProgress() {
    /* The ayah progress line is shared by both modes. Only the
       "Mark page as read" button belongs to Read mode. */
    const inReadMode = document.body.classList.contains("mode-read");
    els.khatmLine.hidden = false;
    /* The page mark button exists only while a khatm is active. */
    els.markRow.hidden = !inReadMode || !Store.getActiveKhatm();

    /* Read mode tracks ayahs marked read; Memorize mode tracks the
       memorized stars. Same bar, different source of truth. */
    const memorizing = !inReadMode;
    const count = memorizing
      ? Store.countMemorizedAyahs()
      : Store.countReadAyahs();
    const label = memorizing ? "memorized" : "read";
    const total = Store.TOTAL_AYAHS;
    els.khatmFill.style.width = `${(count / total) * 100}%`;
    /* Tiny counts still need a visible sliver of progress. */
    els.khatmFill.style.minWidth = count > 0 ? "12px" : "0px";
    els.khatmLabel.textContent = `${count} of ${total} ayahs ${label}`;

    /* Per-surah count, from the same persisted read-ayah map. Read
       mode uses the first ayah on the open page; Memorize mode uses
       the surah currently loaded there. */
    if (els.surahReadLine && els.surahReadLabel) {
      const surahNumber = inReadMode
        ? (state.data && state.data.ayahs.length
            ? state.data.ayahs[0].surahNumber : null)
        : (window.Memorize ? window.Memorize.current() : null);
      const meta = surahNumber ? getSurah(surahNumber) : null;
      if (meta) {
        const surahCount = memorizing
          ? Store.countMemorizedAyahsInSurah(surahNumber)
          : Store.countReadAyahsInSurah(surahNumber);
        const surahTotal = Number(meta.ayahs) || 0;
        const pct = surahTotal ? Math.round((surahCount / surahTotal) * 100) : 0;
        const strong = document.createElement("strong");
        strong.textContent = `${surahCount} of ${surahTotal} ayahs ${label} (${pct}%)`;
        els.surahReadLabel.replaceChildren(
          document.createTextNode(`Surah ${meta.name}: `), strong
        );
        els.surahReadLine.hidden = false;
      } else {
        els.surahReadLine.hidden = true;
      }
    }
    if (els.readProgress) {
      els.readProgress.setAttribute("aria-label", `Ayahs ${label}`);
      els.readProgress.setAttribute("aria-valuemax", String(total));
      els.readProgress.setAttribute("aria-valuenow", String(count));
      els.readProgress.setAttribute("aria-valuetext", `${count} of ${total} ayahs ${label}`);
    }

    const marked = allPageAyahsRead();
    els.markBtn.setAttribute("aria-pressed", String(marked));
    els.markBtn.textContent = marked ? "Page marked as read — unmark" : "Mark page as read";
  }

  /* External callers (khatm panel, mode coordinator) use this name. */
  function refreshKhatm() {
    refreshReadProgress();
  }

  function togglePageMark() {
    const read = !allPageAyahsRead();
    setPageAyahsRead(read);

    if (Store.isKhatmTracking()) {
      const session = Store.setKhatmPageRead(state.page, read);
      document.dispatchEvent(new CustomEvent("khatm-page-marked"));
      if (session && session.completedAt && read) {
        refreshReadProgress();
        showToast("Khatm complete — all 604 pages read. May it be accepted.");
        return;
      }
    }

    refreshReadProgress();
    showToast(read
      ? `Page ${state.page} marked as read — ${Store.countReadAyahs()} ayahs up to here.`
      : `Page ${state.page} unmarked — its ayahs are no longer counted as read.`);
  }

  /* --- Rendering -------------------------------------------------- */

  function renderLoading() {
    els.article.innerHTML = `
      <div class="reader-state" role="status">
        <span class="reader-spinner" aria-hidden="true"></span>
        <p>Loading page ${state.page}&hellip;</p>
      </div>`;
  }

  function renderError(message) {
    els.article.innerHTML = `
      <div class="reader-state">
        <p class="reader-state-title">Could not load this page.</p>
        <p class="reader-state-text">${escapeHTML(message)} The Qur’an text is fetched live from the Quran API, so an internet connection is required.</p>
        <button type="button" class="btn btn-primary retry-btn">Try again</button>
      </div>`;
  }

  /* Bismillah header line (real text from the mushaf convention;
     the API strips it per surah so it is shown exactly once). */
  const BISMILLAH_HTML =
    '<p class="m-bismillah" lang="ar" dir="rtl" translate="no">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>';

  function bannerHTML(surahNumber) {
    const meta = getSurah(surahNumber);
    if (!meta) return "";
    return `
      <header class="m-banner">
        <p class="m-banner-eyebrow">Surah ${meta.n} · ${escapeHTML(meta.origin)}</p>
        <div class="m-banner-row">
          <h2 class="m-banner-name">${escapeHTML(meta.name)}</h2>
          <p class="m-banner-arabic" lang="ar" dir="rtl" translate="no">${escapeHTML(meta.arabic)}</p>
        </div>
        <p class="m-banner-meta">${meta.ayahs} ayahs</p>
      </header>`;
  }

  function markerHTML(ayah) {
    const key = `${ayah.surahNumber}:${ayah.n}`;
    const read = Store.isAyahRead(key);
    const title = markerTitle(ayah.n, read);
    return `<button type="button" class="m-marker${read ? " is-read" : ""}" lang="ar" dir="rtl" translate="no"
      data-s="${ayah.surahNumber}" data-n="${ayah.n}" data-page="${ayah.page}"
      data-global="${ayah.global}" aria-pressed="${read}" title="${escapeHTML(title)}"
      aria-label="${escapeHTML(title)}">${toArabicDigits(ayah.n)}</button>`;
  }

  function ayahSpan(ayah) {
    const key = `${ayah.surahNumber}:${ayah.n}`;
    const marked = Store.isBookmarked(key);
    return `<span class="m-ayah-wrap">
      <span class="m-ayah${marked ? " is-bookmarked" : ""}" lang="ar" dir="rtl" translate="no" data-s="${ayah.surahNumber}" data-n="${ayah.n}" data-global="${ayah.global}" title="Tap a word to hear it">${QuranTimings.wordsHTML(ayah.arabic, { glyphWords: ayah.glyphWords })}</span>${markerHTML(ayah)}
    </span>`;
  }

  function renderPage(data, focus = null) {
    QuranTimings.stop();
    state.data = data;
    audioIndex = -1;
    audioStarted = false;

    /* Group the page's ayahs by surah, in order */
    const segments = [];
    for (const ayah of data.ayahs) {
      const last = segments[segments.length - 1];
      if (!last || last.surahNumber !== ayah.surahNumber) {
        segments.push({ surahNumber: ayah.surahNumber, ayahs: [ayah] });
      } else {
        last.ayahs.push(ayah);
      }
    }

    const showTranslation = translationShown();
    let html = "";

    for (const segment of segments) {
      const first = segment.ayahs[0];
      const startsHere = first.n === 1;

      if (startsHere) {
        html += bannerHTML(segment.surahNumber);
        /* Surah 1's ayah 1 IS the Bismillah; surah 9 has none. */
        if (segment.surahNumber !== 1 && segment.surahNumber !== 9 &&
            first.bismillahStripped) {
          html += BISMILLAH_HTML;
        }
      }

      if (showTranslation) {
        html += '<div class="m-blocks">';
        for (const ayah of segment.ayahs) {
          const translation = state.translationText(segment.surahNumber, ayah.n);
          html += `
            <div class="m-block">
              <p class="m-arabic" lang="ar" dir="rtl" translate="no">${ayahSpan(ayah)}</p>
              <p class="m-translation">${escapeHTML(translation)}</p>
            </div>`;
        }
        html += "</div>";
      } else {
        html += `<div class="m-flow" lang="ar" dir="rtl" translate="no">`;
        for (const ayah of segment.ayahs) {
          html += ayahSpan(ayah) + " ";
        }
        html += "</div>";
      }
    }

    /* Page footer: juz and page number */
    const first = data.ayahs[0];
    const last = data.ayahs[data.ayahs.length - 1];
    const juz = first.juz === last.juz
      ? `Juz ${last.juz}`
      : `Juz ${first.juz}–${last.juz}`;
    html += `<footer class="m-footer"><span>${juz}</span><span>Page ${data.page}</span></footer>`;

    els.article.innerHTML = html;
    /* QCF V4/V2 already draws the ayah number inside its end glyph, so
       hide the duplicate .m-marker circle. Markers stay in the DOM for
       read progress and highlighting only — numbers are not clickable. */
    const glyphEnds = els.article.querySelectorAll(".qcf-end");
    els.article.classList.toggle("has-qcf-end", glyphEnds.length > 0);
    if (window.QuranTimings && window.QuranTimings.applyQcfFonts) {
      window.QuranTimings.applyQcfFonts(els.article);
    }
    els.position.textContent = `Page ${data.page} of ${Store.TOTAL_PAGES}`;
    document.title = `Page ${data.page} — Al-Furqon`;

    /* Reading log: every ayah on this page was just viewed.
       Statistics also keeps which surahs the ayahs belong to
       ("read" surahs on the Surah map). */
    Store.logAyahsViewed(data.ayahs.length);
    const viewedBySurah = {};
    for (const ayah of data.ayahs) {
      (viewedBySurah[ayah.surahNumber] = viewedBySurah[ayah.surahNumber] || []).push(ayah.n);
    }
    Object.keys(viewedBySurah).forEach((surahN) => {
      Store.recordSurahAyahsViewed(surahN, viewedBySurah[surahN]);
    });

    /* One shared position for both modes. Memorize stores the same
       page/surah/ayah record, so switching modes mirrors the exact
       place instead of jumping back to a stale read page. */
    const focusAyah = focus && data.ayahs.find((a) =>
      a.n === Number(focus.ayah) &&
      (!focus.surah || a.surahNumber === Number(focus.surah))
    );
    const positionAyah = focusAyah || first;
    Store.setPosition({
      page: data.page,
      surah: positionAyah.surahNumber,
      ayah: positionAyah.n,
      juz: positionAyah.juz
    });
    Store.setPreferences({ lastReadPage: data.page });

    if (focusAyah) {
      const marker = els.article.querySelector(
        `.m-marker[data-s="${focusAyah.surahNumber}"][data-n="${focusAyah.n}"]`
      );
      if (marker) marker.scrollIntoView({
        behavior: reducedMotion() ? "auto" : "smooth",
        block: "center"
      });
    }

    setAudioLabel();
    refreshReadProgress();
  }

  /* Translation text lookup — filled when the translation edition
     has been fetched for this page; empty until then. */
  state.translationText = function (surahNumber, ayahN) {
    if (!state.translation) return "";
    const found = state.translation.ayahs.find((a) =>
      a.surahNumber === surahNumber && a.n === ayahN
    );
    return found ? found.arabic : ""; // translation editions carry text in `arabic`
  };

  async function ensureTranslation() {
    if (state.translation || !state.data) return;
    try {
      const data = await QuranAPI.fetchPage(state.page, translationId());
      state.translation = data;
      rerender();
    } catch (err) {
      showToast("Translation unavailable — check your connection.");
    }
  }

  function rerender() {
    if (!state.data) return;
    const scrollY = window.scrollY;
    renderPage(state.data);
    window.scrollTo(0, scrollY);
  }

  /* --- Load a page ------------------------------------------------ */

  async function loadPage(pageNumber, options = {}) {
    const page = Math.min(Store.TOTAL_PAGES, Math.max(1, Number(pageNumber) || 1));
    stopPageAudio();
    state.page = page;
    state.translation = null;   // fresh translation for the new page
    state.loading = true;
    renderLoading();

    try {
      const data = await QuranAPI.fetchPage(page, "quran-uthmani");
      state.loading = false;
      renderPage(data, options.focus || null);
      if (!options.focus) window.scrollTo(0, 0);
      if (window.QuranPage && window.QuranPage.syncURL) window.QuranPage.syncURL();
      /* Translation lines are fetched on demand, after the page
         paints; the rerender keeps the scroll position. */
      if (translationShown()) await ensureTranslation();
    } catch (err) {
      state.loading = false;
      renderError(err && err.message ? err.message : "Unknown error.");
    }
  }

  function turnPage(delta) {
    const target = state.page + delta;
    if (target < 1 || target > Store.TOTAL_PAGES) {
      showToast(delta < 0
        ? "This is the first page."
        : "This is the last page — the Qur’an ends here.");
      return;
    }
    loadPage(target);
  }

  /* --- Audio bar --------------------------------------------------- */

  function reciterId() {
    return prefs().reciter || QuranAPI.RECITERS[0].id;
  }

  /* Highlight the ayah currently being recited, and keep it in view.
     The ayah span and its numbered marker are siblings in the DOM. */
  function updateRecitingHighlight(scrollIntoView) {
    els.article.querySelectorAll(".m-ayah.is-reciting, .m-marker.is-reciting")
      .forEach((el) => el.classList.remove("is-reciting"));

    if (audioIndex < 0 || !state.data) return;
    const ayah = state.data.ayahs[audioIndex];
    if (!ayah) return;

    const el = els.article.querySelector(`.m-ayah[data-global="${ayah.global}"]`);
    if (!el) return;
    el.classList.add("is-reciting");
    const marker = els.article.querySelector(`.m-marker[data-global="${ayah.global}"]`);
    if (marker) marker.classList.add("is-reciting");

    if (!scrollIntoView) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 90 || rect.bottom > window.innerHeight - 40) {
      el.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto" : "smooth",
        block: "center"
      });
    }
  }

  function setAudioLabel() {
    if (!state.data) {
      els.audioLabel.textContent = "Ready";
      return;
    }
    if (audioIndex >= 0 && state.data.ayahs[audioIndex]) {
      const ayah = state.data.ayahs[audioIndex];
      const surah = getSurah(ayah.surahNumber);
      els.audioLabel.textContent =
        `${surah ? surah.name : `Surah ${ayah.surahNumber}`} · ayah ${ayah.n}`;
    } else {
      els.audioLabel.textContent = `Page ${state.page} · ${state.data.ayahs.length} ayahs`;
    }
    els.audioBar.classList.toggle("is-playing", !audio.paused && audioIndex >= 0);
    updateRecitingHighlight(!audio.paused);
  }

  function playbackRate() {
    return [0.75, 1, 1.25].includes(Number(prefs().speed))
      ? Number(prefs().speed) : 1;
  }

  function playAyahAtIndex(index) {
    if (!state.data) return;
    stopWordAudio();
    const ayah = state.data.ayahs[index];
    if (!ayah) return;
    audioIndex = index;
    audioStarted = true;
    readRepeatLeft = readRepeat();
    audio.playbackRate = playbackRate();
    audio.src = QuranAPI.audioURL(ayah.global, reciterId());
    const span = els.article.querySelector(`.m-ayah[data-global="${ayah.global}"]`);
    if (span) {
      QuranTimings.play({
        audio, root: span, surah: ayah.surahNumber,
        ayah: ayah.n, reciterId: reciterId()
      });
    } else {
      QuranTimings.stop();
    }
    audio.play().then(() => setAudioLabel()).catch(() => {
      showToast("Audio could not be played — please try again.");
      clearAudio();
    });
    setAudioLabel();
  }

  function audioToggle() {
    if (!state.data) return;
    if (audioStarted && audioIndex >= 0) {
      if (audio.paused) audio.play().catch(() => clearAudio());
      else audio.pause();
      setAudioLabel();
      return;
    }
    playAyahAtIndex(0);
  }

  function stopPageAudio() {
    stopWordAudio();
    QuranTimings.stop();
    audio.pause();
    audio.removeAttribute("src");
    try { audio.load(); } catch (err) { /* no-op */ }
    audioStarted = false;
    audioIndex = -1;
    els.audioBar.classList.remove("is-playing");
    setAudioLabel();
  }

  function clearAudio() {
    stopWordAudio();
    QuranTimings.stop();
    audioStarted = false;
    audioIndex = -1;
    els.audioBar.classList.remove("is-playing");
    setAudioLabel();
  }

  /* --- Word-by-word pronunciation ---------------------------------- */

  function stopWordAudio() {
    /* The shared player also clears the .is-word-playing highlight. */
    if (window.QuranWordAudio) window.QuranWordAudio.stop();
  }

  function resetWordLabel() {
    if (state.data) {
      els.audioLabel.textContent = `Page ${state.page} · ${state.data.ayahs.length} ayahs`;
    }
  }

  /* Tap a word: play only that word — a separate clip, not a
     slice of the verse recitation. The same shared player is
     used by Memorize mode. */
  function playWord(word) {
    if (!state.data || !window.QuranWordAudio) return;
    stopPageAudio();

    const ayahSpan = word.closest(".m-ayah");
    if (!ayahSpan) return;
    const surah = Number(ayahSpan.dataset.s);

    window.QuranWordAudio.play(word, surah, {
      rate: playbackRate,
      onStart: (el) => { els.audioLabel.textContent = `Word: ${el.textContent}`; },
      onEnd: resetWordLabel,
      onError: () => {
        resetWordLabel();
        showToast("Word audio could not be loaded — please try again.");
      }
    });
  }

  /* --- Translation toggle (read mode) -------------------------------- */

  function applyTranslationToggle() {
    const show = translationShown();
    document.body.classList.toggle("hide-read-translation", !show);
    els.translation.setAttribute("aria-pressed", String(show));
  }

  function toggleTranslation() {
    const show = !translationShown();
    Store.setPreferences({ showTranslation: show, showTranslationRead: show });
    applyTranslationToggle();
    announcePrefs({ showTranslation: show, showTranslationRead: show });
    if (show) ensureTranslation();
    else rerender();
  }

  /* --- Events ---------------------------------------------------------- */

  function bindEvents() {
    els.prev.addEventListener("click", () => turnPage(-1));
    els.next.addEventListener("click", () => turnPage(1));
    els.markBtn.addEventListener("click", togglePageMark);
    /* The shared Translation button is bound once in quran-page.js,
       which routes it to the active mode — no second handler here. */

    /* Retry button (rendered inside error state) and word audio.
       Ayah numbers are display-only: no per-ayah read tracking. */
    els.article.addEventListener("click", (event) => {
      if (event.target.closest(".retry-btn")) {
        loadPage(state.page);
        return;
      }
      const word = event.target.closest(".m-ayah .w");
      if (word) playWord(word);
    });

    /* Audio bar */
    els.audioToggle.addEventListener("click", audioToggle);
    els.audioPrev.addEventListener("click", () => {
      if (!state.data) return;
      const target = audioIndex === -1 ? 0 : Math.max(0, audioIndex - 1);
      playAyahAtIndex(target);
    });
    els.audioNext.addEventListener("click", () => {
      if (!state.data) return;
      const target = Math.min(state.data.ayahs.length - 1, audioIndex + 1);
      if (audioIndex === -1) playAyahAtIndex(0);
      else playAyahAtIndex(target);
    });
    audio.addEventListener("ended", () => {
      if (audioIndex >= 0 && readRepeatLeft > 1) {
        readRepeatLeft -= 1;
        audio.currentTime = 0;
        audio.play().catch(() => clearAudio());
        return;
      }
      if (state.data && audioIndex >= 0 && audioIndex < state.data.ayahs.length - 1) {
        playAyahAtIndex(audioIndex + 1);
      } else {
        clearAudio();
      }
    });
    audio.addEventListener("pause", () => {
      setAudioLabel();
      announcePlayState(false);
    });
    audio.addEventListener("play", () => {
      setAudioLabel();
      announcePlayState(true);
    });

    /* Listening / Reading choices changed in the More panel. */
    document.addEventListener("quran-prefs-changed", (event) => {
      const detail = event.detail || {};
      if ("arabicFontStyle" in detail || "arabicSizeIndex" in detail) {
        applyArabicFont();
        applyFontSize();
      }
      if ("translation" in detail) {
        state.translation = null;
        if (translationShown()) ensureTranslation();
        else rerender();
      }
    });

    audio.addEventListener("error", () => {
      if (audioIndex === -1) return;
      showToast("Audio unavailable — check your connection.");
      clearAudio();
    });

    /* Keyboard page turning — skip when typing or when the
       surah index drawer is open */
    document.addEventListener("keydown", (event) => {
      if (!document.body.classList.contains("mode-read")) return;
      if (document.body.classList.contains("index-open")) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (event.key === "ArrowLeft") turnPage(1);      // RTL: next page is on the left
      if (event.key === "ArrowRight") turnPage(-1);
    });

    /* Swipe to turn pages */
    let touchStart = null;
    els.readView.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    els.readView.addEventListener("touchend", (event) => {
      if (!touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 48 || Math.abs(dy) > Math.abs(dx)) return;
      turnPage(dx < 0 ? 1 : -1);   // swipe left = next (RTL page turn)
    }, { passive: true });
  }

  /* --- Init / public surface -------------------------------------------- */

  function init() {
    if (init.done) return;
    init.done = true;
    const stored = prefs().arabicSizeIndex;
    state.fontIndex = Number.isInteger(stored)
      ? Math.max(0, Math.min(FONT_SIZES.length - 1, stored))
      : DEFAULT_FONT_INDEX;
    applyArabicFont();
    applyFontSize();
    applyTranslationToggle();
    bindFontButtons();
    bindEvents();
    refreshReadProgress();
  }

  document.addEventListener("DOMContentLoaded", init);

  window.Mushaf = {
    init,
    loadPage,
    refreshKhatm,
    refreshReadProgress,
    toggleTranslation,
    togglePlay: audioToggle,
    stopAudio: stopPageAudio,
    current: () => state.page
  };
})();
