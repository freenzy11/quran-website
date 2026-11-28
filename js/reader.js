/* ============================================================
   reader.js — Memorize mode controller (pages/quran.html).

   Study view: one surah at a time, each ayah shown as Arabic +
   transliteration (QF resource 57) + translation. Tools:

   - verse-by-verse recitation with repeat 1/3/5/10 and speed
     0.75/1/1.25, surah-wide playback, optional next-surah autoplay
   - tap an Arabic word to hear a separate word-only clip
   - bookmark and memorized-star buttons on every ayah
   - Surah / Juz / Page index with search (shared slide-over drawer)
   - quick “Hide text” drawer, with the default saved in Settings
   - reading-position tracking and reading-log via Store

   Reciter, translation language, font style, transliteration,
   hide-text default, khatm and goals are set once in Settings.
   No Khatm controls live here — the two trackers stay independent.
   ============================================================ */

(function () {
  "use strict";

  /* --- Element handles --------------------------------------- */

  const els = {
    article: document.getElementById("surah-reader"),
    index: document.getElementById("surah-index"),
    indexTabs: document.getElementById("index-tabs"),
    indexSearch: document.getElementById("index-search"),
    indexList: document.getElementById("surah-list"),
    indexClose: document.getElementById("index-close"),
    hideText: document.getElementById("hide-text-toggle"),
    toast: document.getElementById("reader-toast")
  };

  /* --- State -------------------------------------------------- */

  let surahNumber = 1;
  let ayahs = [];          // loaded ayah data for the current surah
  let loadToken = 0;       // cancels stale loads
  let repeatLeft = 1;      // plays remaining for the current ayah
  let observer = null;     // reading-position observer
  let positionTimer = null;
  let viewedAyahs = null;  // ayah numbers already counted this load
  let indexTab = "surah";  // surah | juz | page
  let indexQuery = "";
  let positionLock = null;  // explicit ?ayah/X target: do not let the observer drift

  /* Canonical start of each juz (surah + ayah). */
  const JUZ_STARTS = [
    [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
    [5, 82], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
    [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
    [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
    [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1]
  ];

  function countAyahViewed(n) {
    if (!viewedAyahs) viewedAyahs = new Set();
    if (viewedAyahs.has(n)) return;
    viewedAyahs.add(n);
    Store.logAyahsViewed(1);
    /* Statistics "read" surahs: this ayah was just viewed */
    Store.recordSurahAyahsViewed(surahNumber, [n]);
  }

  const audio = new Audio();
  audio.preload = "none";
  let loadedAyahNum = null;   // ayah whose audio is loaded
  let playingAyahNum = null;  // ayah currently playing or paused
  let surahPlaylist = false;  // auto-advance through the surah

  /* Arabic font size steps (px), shared with Read mode */
  const FONT_SIZES = [22, 26, 30, 34, 40];
  const DEFAULT_FONT_INDEX = 2;
  let fontIndex = DEFAULT_FONT_INDEX;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8.5 5.5v13l11-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5h3.2v14H8zM12.8 5H16v14h-3.2z" fill="currentColor"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h10v16l-5-3.5L7 20z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
  };

  /* --- Small helpers ------------------------------------------ */

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  let toastTimer = null;
  function showToast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
  }

  /* --- Hide text (settings drawer) --------------------------------- */

  function applyHideText(on) {
    if (!els.article) return;
    els.article.classList.toggle("hide-mem-text", on);
    if (els.hideText) els.hideText.setAttribute("aria-pressed", String(on));
    if (on) {
      els.article.querySelectorAll(".ayah.reveal").forEach((el) => {
        el.classList.remove("reveal");
      });
    }
  }

  function applyTranslitVisibility() {
    if (!els.article) return;
    els.article.classList.toggle("hide-translit", prefs().showTransliteration === false);
  }

  /* Word meanings are rendered with every surah, so switching this
     preference is instant and works without another API request. */
  function applyWordByWordVisibility() {
    if (!els.article) return;
    els.article.classList.toggle(
      "hide-mem-wordbyword", prefs().showWordByWord !== true
    );
  }

  function applyFontStyle() {
    if (window.QuranFont) window.QuranFont.apply(prefs().arabicFontStyle);
  }

  function announcePlayState(playing) {
    document.dispatchEvent(new CustomEvent("quran-play-state", {
      detail: { mode: "memorize", playing }
    }));
  }

  function prefs() {
    return Store.getPreferences();
  }

  function reciterId() {
    return prefs().reciter || QuranAPI.RECITERS[0].id;
  }

  function repeatCount() {
    const v = Number(prefs().repeat);
    return [1, 3, 5, 10].includes(v) ? v : 1;
  }

  function speedValue() {
    const v = Number(prefs().speed);
    return [0.75, 1, 1.25].includes(v) ? v : 1;
  }

  function translationId() {
    const id = prefs().translation;
    return QuranAPI.TRANSLATIONS.some((t) => t.id === id) ? id : QuranAPI.TRANSLATIONS[0].id;
  }

  function translationShown() {
    const p = prefs();
    return p.showTranslation === undefined
      ? p.showTranslationRead !== false
      : p.showTranslation !== false;
  }

  function toggleTranslation() {
    const show = !translationShown();
    Store.setPreferences({ showTranslation: show, showTranslationRead: show });
    document.dispatchEvent(new CustomEvent("quran-prefs-changed", {
      detail: { showTranslation: show, showTranslationRead: show }
    }));
    if (!els.article) return;
    els.article.classList.toggle("hide-mem-translation", !show);
    showToast(show ? "Translation shown." : "Translation hidden.");
  }

  /* Load a surah in the chosen translation; if that edition fails
     but English works, fall back to English. */
  async function fetchWithFallback(n) {
    const wanted = translationId();
    try {
      return await QuranAPI.fetchSurahStudy(n, wanted);
    } catch (err) {
      const def = QuranAPI.TRANSLATIONS[0].id;
      if (wanted === def) throw err;
      const data = await QuranAPI.fetchSurahStudy(n, def);
      Store.setPreferences({ translation: def });
      populateExtraSelects();
      showToast("That translation is unavailable. Showing English.");
      return data;
    }
  }

  function ayahKey(n) {
    return `${surahNumber}:${n}`;
  }

  /* --- Preferences: font size ------------------------------------

     The single A− / A+ control is bound in mushaf.js and writes
     the shared preference. This mode reads it and refreshes when
     the toolbar changes it. */

  function applyFontSize() {
    const stored = prefs().arabicSizeIndex;
    const fontIndex = Number.isInteger(stored)
      ? Math.max(0, Math.min(FONT_SIZES.length - 1, stored))
      : DEFAULT_FONT_INDEX;
    const px = FONT_SIZES[fontIndex];
    document.documentElement.style.setProperty("--ayah-arabic-size", `${px + 2}px`);
  }

  /* --- Qur’an index (Surah / Juz / Page) -------------------------- */

  function escapeAttr(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }

  function squashIndex(value) {
    return String(value).toLowerCase().replace(/[\s\-''/]/g, "");
  }

  function buildIndex() {
    if (!els.indexList) return;
    let items = "";

    if (indexTab === "juz") {
      items = JUZ_STARTS.map(([surahN, ayahN], index) => {
        const surah = getSurah(surahN);
        const name = surah ? surah.name : `Surah ${surahN}`;
        const meaning = surah && surah.english ? ` · ${surah.english}` : "";
        return `
          <li>
            <button type="button" class="surah-item" data-kind="juz"
                    data-juz="${index + 1}" data-surah="${surahN}" data-ayah="${ayahN}"
                    data-search="${escapeAttr(`juz ${index + 1} ${name} ${meaning} ${ayahN}`)}">
              <span class="surah-item-num">${index + 1}</span>
              <span class="surah-item-main">
                <span class="surah-item-name">Juz ${index + 1}</span>
                <span class="surah-item-meta">Starts at ${escapeHTML(name)} ${ayahN}${escapeHTML(meaning)}</span>
              </span>
            </button>
          </li>`;
      }).join("");
    } else if (indexTab === "page") {
      const total = Store.TOTAL_PAGES || 604;
      items = Array.from({ length: total }, (_, i) => i + 1).map((page) => `
        <li>
          <button type="button" class="surah-item" data-kind="page"
                  data-page="${page}" data-search="page ${page}">
            <span class="surah-item-num">${page}</span>
            <span class="surah-item-main">
              <span class="surah-item-name">Page ${page}</span>
            </span>
          </button>
        </li>`).join("");
    } else {
      items = SURAHS.map((s) => {
        const meaning = s.english && s.english !== s.name
          ? `— <span class="surah-item-meaning">${escapeHTML(s.english)}</span> · `
          : "";
        return `
          <li>
            <button type="button" class="surah-item" data-kind="surah" data-n="${s.n}"
                    data-search="${escapeAttr(`${s.n} ${s.name} ${s.english || ""}`)}"
                    ${s.n === surahNumber ? 'aria-current="true"' : ""}>
              <span class="surah-item-num">${s.n}</span>
              <span class="surah-item-main">
                <span class="surah-item-name">${escapeHTML(s.name)}</span>
                <span class="surah-item-meta">${meaning}${s.ayahs} ayahs</span>
              </span>
              <span class="surah-item-arabic" lang="ar" dir="rtl" translate="no">${escapeHTML(s.arabic)}</span>
            </button>
          </li>`;
      }).join("");
    }

    els.indexList.innerHTML = items;
    filterIndex(indexQuery);
  }

  function setIndexTab(tab) {
    if (!["surah", "juz", "page"].includes(tab)) return;
    indexTab = tab;
    indexQuery = "";

    if (els.indexSearch) {
      els.indexSearch.value = "";
      els.indexSearch.placeholder = tab === "juz"
        ? "Search 30 juz…"
        : tab === "page"
          ? "Go to page 1–604…"
          : "Search 114 surahs…";
    }
    if (els.indexTabs) {
      els.indexTabs.querySelectorAll(".index-tab").forEach((btn) => {
        const active = btn.dataset.indexTab === tab;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
        btn.tabIndex = active ? 0 : -1;
      });
    }
    buildIndex();
  }

  function updateIndexCurrent() {
    if (!els.indexList) return;
    els.indexList.querySelectorAll('.surah-item[data-kind="surah"]').forEach((item) => {
      if (Number(item.dataset.n) === surahNumber) {
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  function filterIndex(query) {
    if (!els.indexList) return;
    indexQuery = String(query || "");
    /* Ignore hyphens and spaces so common spellings like "Yasin"
       find "Ya-Sin" and "Al Fatiha" finds "Al-Fatihah". */
    const q = squashIndex(indexQuery);
    els.indexList.querySelectorAll(".surah-item").forEach((item) => {
      const match = !q || squashIndex(item.dataset.search || "").includes(q);
      item.parentElement.hidden = !match;
    });
  }

  /* --- Rendering ------------------------------------------------ */

  function renderLoading(meta) {
    if (!els.article) return;
    els.article.innerHTML = `
      <div class="reader-state" role="status">
        <span class="reader-spinner" aria-hidden="true"></span>
        <p>Loading Surah ${escapeHTML(meta.name)}&hellip;</p>
      </div>`;
    document.title = `Surah ${meta.name} — Al-Furqon`;
  }

  function renderError(message) {
    if (!els.article) return;
    els.article.innerHTML = `
      <div class="reader-state">
        <p class="reader-state-title">Could not load this surah.</p>
        <p class="reader-state-text">${escapeHTML(message)} The Qur’an text is fetched live from the Quran API, so an internet connection is required.</p>
        <button type="button" class="btn btn-primary retry-btn">Try again</button>
      </div>`;
  }

  function ayahBlock(a) {
    const marked = Store.isBookmarked(ayahKey(a.n));
    const memorized = Store.isAyahMemorized(ayahKey(a.n));
    const hasMeanings = Array.isArray(a.wordByWord) &&
      a.wordByWord.some((m) => String(m == null ? "" : m).trim());
    const wordOptions = { glyphWords: a.glyphWords };
    const arabicHTML = hasMeanings
      ? QuranTimings.stackedWordsHTML(a.arabic, a.wordByWord, wordOptions)
      : QuranTimings.wordsHTML(a.arabic, wordOptions);
    return `
      <article class="ayah${memorized ? " is-memorized" : ""}" id="ayah-${a.n}" data-n="${a.n}" data-global="${a.global}" data-juz="${a.juz}">
        <div class="ayah-head">
          <span class="ayah-num">${a.n}</span>
          <span class="ayah-rule" aria-hidden="true"></span>
          <div class="ayah-actions">
            <button type="button" class="ayah-btn ayah-play" data-n="${a.n}"
                    aria-label="Play ayah ${a.n}">
              <span class="icon icon-play" aria-hidden="true">${ICONS.play}</span>
              <span class="icon icon-pause" aria-hidden="true">${ICONS.pause}</span>
            </button>
            <button type="button" class="ayah-btn ayah-bm" data-n="${a.n}"
                    aria-pressed="${marked}" title="Bookmark"
                    aria-label="${marked ? "Remove bookmark from" : "Bookmark"} ayah ${a.n}">
              ${ICONS.bookmark}
            </button>
            <button type="button" class="ayah-btn ayah-star" data-n="${a.n}"
                    aria-pressed="${memorized}" title="Memorized"
                    aria-label="${memorized ? "Remove ayah " + a.n + " from memorized" : "Mark ayah " + a.n + " as memorized"}">
              ${ICONS.star}
            </button>
          </div>
        </div>
        <p class="ayah-arabic${hasMeanings ? " has-wbw" : ""}" lang="ar" dir="rtl" translate="no">${arabicHTML}</p>
        <p class="ayah-translit">${QuranTimings.wordsHTML(a.transliteration)}</p>
        <p class="ayah-translation">${escapeHTML(a.translation)}</p>
      </article>`;
  }

  /* Same compact, rounded arrow-navigation pattern as the mushaf page
     bar: next on the left (←, RTL turning), previous on the right (→),
     with the current position centred between them. */
  function pagerHTML(meta) {
    const prev = meta.n > 1 ? getSurah(meta.n - 1) : null;
    const next = meta.n < 114 ? getSurah(meta.n + 1) : null;
    const arrow = (kind, surah) => {
      if (!surah) return '<span class="pager-spacer" aria-hidden="true"></span>';
      const label = `${kind === "next" ? "Next" : "Previous"} surah: ${surah.n} · ${surah.name}`
        .replace(/"/g, "&quot;");
      return `<button type="button" class="page-nav-btn pager-link pager-${kind}"
                      data-n="${surah.n}" aria-label="${label}" title="${label}">
                <span aria-hidden="true">${kind === "next" ? "&larr;" : "&rarr;"}</span>
              </button>`;
    };
    return `
      <nav class="surah-pager" aria-label="Surah navigation">
        ${arrow("next", next)}
        <span class="page-position">Surah ${meta.n} of 114</span>
        ${arrow("prev", prev)}
      </nav>`;
  }

  function renderSurah(meta, data) {
    if (!els.article) return;
    ayahs = data.ayahs;
    viewedAyahs = new Set();   // fresh count per surah load

    /* Trust the API for the ayah list; warn if our metadata
       disagrees so drift is visible instead of silent. */
    if (ayahs.length !== meta.ayahs) {
      console.warn(
        `Reader: API reports ${ayahs.length} ayahs for surah ${meta.n}, metadata says ${meta.ayahs}. Rendering API data.`
      );
    }

    let blocks = "";
    let lastJuz = null;
    for (const a of ayahs) {
      if (a.n !== ayahs[0].n && a.juz !== lastJuz) {
        blocks += `<p class="juz-divider">Juz ${a.juz}</p>`;
      }
      lastJuz = a.juz;
      blocks += ayahBlock(a);
    }

    els.article.innerHTML = `
      <header class="surah-head">
        <svg class="surah-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="5.2" y="5.2" width="13.6" height="13.6"/>
            <rect x="5.2" y="5.2" width="13.6" height="13.6" transform="rotate(45 12 12)"/>
          </g>
        </svg>
        <p class="surah-eyebrow">Surah ${meta.n} · ${escapeHTML(meta.origin)}</p>
        <div class="surah-title-row">
          <h1 class="surah-title">${escapeHTML(meta.name)}</h1>
          <p class="surah-title-arabic" lang="ar" dir="rtl" translate="no">${escapeHTML(meta.arabic)}</p>
        </div>
        <p class="surah-meta">${surahMetaText(meta.n, ayahs.length)}</p>
      </header>
      ${data.headerBismillah ? '<p class="bismillah" lang="ar" dir="rtl" translate="no">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>' : ""}
      <div class="ayah-list">${blocks}</div>
      ${pagerHTML(meta)}`;

    if (window.QuranTimings && window.QuranTimings.applyQcfFonts) {
      window.QuranTimings.applyQcfFonts(els.article);
    }

    document.title = `Surah ${meta.name} — Al-Furqon`;
    updateSurahPlayButton();

    /* Keep the setting through surah changes and retries. */
    if (els.hideText && els.hideText.getAttribute("aria-pressed") === "true") {
      applyHideText(true);
    }
    /* Read progress is per surah, so it follows this surah load. */
    if (window.Mushaf) window.Mushaf.refreshKhatm();
  }

  /* --- Reading position ------------------------------------------ */

  function savePosition(ayahN) {
    const ayah = ayahs.find((a) => a.n === Number(ayahN));
    Store.setPosition({
      surah: surahNumber,
      ayah: ayah ? ayah.n : undefined,
      page: ayah ? ayah.page : undefined,
      juz: ayah ? ayah.juz : undefined
    });
  }

  function savePositionDebounced(ayahN) {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => savePosition(ayahN), 700);
  }

  function setupPositionObserver() {
    if (observer) observer.disconnect();
    if (!("IntersectionObserver" in window)) return;

    observer = new IntersectionObserver(
      (entries) => {
        if (positionLock !== null) return;
        /* The ayah crossing the upper-middle band of the viewport
           is considered "current". */
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        const n = Number(visible[0].target.dataset.n);
        markCurrentAyah(n);
        savePositionDebounced(n);
      },
      { rootMargin: "-25% 0px -55% 0px" }
    );

    els.article.querySelectorAll(".ayah").forEach((el) => observer.observe(el));
  }

  function markCurrentAyah(n) {
    els.article.querySelectorAll(".ayah.is-current").forEach((el) => {
      el.classList.remove("is-current");
    });
    const el = els.article.querySelector(`.ayah[data-n="${n}"]`);
    if (el) {
      el.classList.add("is-current");
      countAyahViewed(Number(n));
    }
  }

  /* --- Playback --------------------------------------------------- */

  function refreshPlayButtons() {
    els.article.querySelectorAll(".ayah-play").forEach((btn) => {
      const active = Number(btn.dataset.n) === playingAyahNum;
      btn.classList.toggle("is-playing", active);
      btn.classList.toggle("is-paused", active && audio.paused);
      const n = btn.dataset.n;
      btn.setAttribute(
        "aria-label",
        active && !audio.paused ? `Pause ayah ${n}` : `Play ayah ${n}`
      );
    });
    updateSurahPlayButton();
  }

  function updateSurahPlayButton() {
    const active = surahPlaylist && playingAyahNum !== null;
    const inMemorize = !window.QuranPage || window.QuranPage.currentMode() === "memorize";
    if (inMemorize) {
      const btn = document.getElementById("play-toggle");
      if (btn) {
        btn.setAttribute("aria-pressed", String(active));
        btn.setAttribute("aria-label", active ? "Pause recitation" : "Play recitation");
        const label = btn.querySelector(".label");
        if (label) label.textContent = active ? "Pause" : "Play";
      }
      announcePlayState(active);
    }
  }

  function togglePlay() {
    if (surahPlaylist && playingAyahNum !== null) stopPlayback();
    else playSurah();
  }

  function clearPlaybackUI() {
    QuranTimings.stop();
    playingAyahNum = null;
    surahPlaylist = false;
    refreshPlayButtons();
  }

  function stopPlayback() {
    QuranTimings.stop();
    if (window.QuranWordAudio) window.QuranWordAudio.stop();
    audio.pause();
    audio.removeAttribute("src");
    try { audio.load(); } catch (err) { /* no-op */ }
    clearPlaybackUI();
  }

  /* Same word-only player as Read mode. The surah is known here
     from the loaded surah; ayah and word come from the span. */
  function playWord(word) {
    if (!window.QuranWordAudio) return;
    stopPlayback();
    window.QuranWordAudio.play(word, surahNumber, {
      rate: speedValue,
      onError: () => showToast("Word audio could not be loaded — please try again.")
    });
  }

  function playAyah(n, options = {}) {
    const ayah = ayahs.find((a) => a.n === Number(n));
    if (!ayah) return;

    /* Pause / resume when tapping the same ayah */
    if (playingAyahNum === ayah.n) {
      if (audio.paused) {
        audio.play().catch(() => clearPlaybackUI());
      } else {
        audio.pause();
      }
      refreshPlayButtons();
      return;
    }

    stopPlayback();
    playingAyahNum = ayah.n;
    loadedAyahNum = ayah.n;
    surahPlaylist = Boolean(options.playlist);
    repeatLeft = repeatCount();
    audio.defaultPlaybackRate = speedValue();
    audio.playbackRate = speedValue();

    audio.src = QuranAPI.audioURL(ayah.global, reciterId());
    const article = els.article.querySelector(`.ayah[data-n="${ayah.n}"]`);
    if (article) {
      QuranTimings.play({
        audio, root: article, surah: surahNumber,
        ayah: ayah.n, reciterId: reciterId()
      });
    } else {
      QuranTimings.stop();
    }
    audio.play().catch(() => {
      showToast("Audio could not be played — please try again.");
      clearPlaybackUI();
    });

    refreshPlayButtons();
    savePosition(ayah.n);
    markCurrentAyah(ayah.n);
  }

  function playSurah() {
    if (surahPlaylist && playingAyahNum !== null) {
      stopPlayback();
      return;
    }
    const resume = playingAyahNum && loadedAyahNum === playingAyahNum
      ? playingAyahNum
      : 1;
    playAyah(resume, { playlist: true });
    const el = els.article.querySelector(`.ayah[data-n="${resume}"]`);
    if (el) {
      el.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto" : "smooth",
        block: "center"
      });
    }
  }

  /* --- Bookmarks ---------------------------------------------------- */

  function toggleBookmark(n) {
    const key = ayahKey(n);
    const now = !Store.isBookmarked(key);
    Store.setBookmarked(key, now);
    const btn = els.article.querySelector(`.ayah-bm[data-n="${n}"]`);
    if (btn) {
      btn.setAttribute("aria-pressed", String(now));
      btn.setAttribute("aria-label", `${now ? "Remove bookmark from" : "Bookmark"} ayah ${n}`);
    }
    showToast(now ? `Ayah ${n} bookmarked.` : `Bookmark removed from ayah ${n}.`);
  }

  /* --- Memorized star ---------------------------------------------- */

  function toggleMemorized(n) {
    const key = ayahKey(n);
    const wasMemorized = Store.isAyahMemorized(key);
    Store.setAyahMemStatus(key, wasMemorized ? null : "memorized");

    const btn = els.article.querySelector(`.ayah-star[data-n="${n}"]`);
    if (btn) {
      btn.setAttribute("aria-pressed", String(!wasMemorized));
      btn.setAttribute("aria-label", wasMemorized
        ? `Mark ayah ${n} as memorized`
        : `Remove ayah ${n} from memorized`);
    }
    const block = els.article.querySelector(`.ayah[data-n="${n}"]`);
    if (block) block.classList.toggle("is-memorized", !wasMemorized);
    updateSurahMeta();
    /* The shared top bar counts memorized ayahs in this mode. */
    if (window.Mushaf) window.Mushaf.refreshKhatm();

    showToast(wasMemorized
      ? `Ayah ${n} removed from Memorized.`
      : `Ayah ${n} marked as Memorized — see it on the Statistics page.`);
  }

  /* --- Surah meta line -------------------------------------------- */

  function surahMetaText(surahN, totalAyahs) {
    let text = `${totalAyahs} ayahs`;

    const memCount = ayahs.filter((a) =>
      Store.isAyahMemorized(`${surahN}:${a.n}`)
    ).length;
    if (memCount === totalAyahs && totalAyahs > 0) {
      text += ` · all ${totalAyahs} memorized`;
    } else if (memCount > 0) {
      text += ` · ${memCount} memorized`;
    }

    return text;
  }

  function updateSurahMeta() {
    const metaEl = els.article.querySelector(".surah-meta");
    if (!metaEl || !ayahs.length) return;
    metaEl.textContent = surahMetaText(surahNumber, ayahs.length);
  }

  /* --- URL handling ------------------------------------------------ */

  function parseParams() {
    const params = new URLSearchParams(location.search);
    const surah = Number(params.get("surah"));
    const ayah = Number(params.get("ayah"));
    return {
      surah: surah >= 1 && surah <= 114 ? surah : null,
      ayah: ayah >= 1 ? ayah : null
    };
  }

  function updateURL(ayahN, mode) {
    if (!window.QuranPage) return;
    window.QuranPage.syncURL();
  }

  /* --- Load a surah -------------------------------------------------- */

  async function loadSurah(n, targetAyah, options = {}) {
    const meta = getSurah(n);
    if (!meta) {
      showToast("That surah does not exist — choose one from 1 to 114.");
      return;
    }

    stopPlayback();
    clearTimeout(positionTimer);
    const token = ++loadToken;
    surahNumber = meta.n;
    renderLoading(meta);
    updateIndexCurrent();

    try {
      const data = await fetchWithFallback(meta.n);
      if (token !== loadToken) return; // a newer load superseded this one

      renderSurah(meta, data);
      applyHideText(prefs().hideTextDefault === true);
      applyTranslitVisibility();
      applyWordByWordVisibility();
      els.article.classList.toggle("hide-mem-translation", !translationShown());

      /* Clamp the requested ayah to what actually exists. While a
         deep-linked ayah is open, keep the saved position locked to
         it until the reader scrolls themselves. */
      let scrollTo = null;
      if (targetAyah) {
        const found = ayahs.find((a) => a.n === Number(targetAyah));
        if (found) scrollTo = found.n;
      }
      positionLock = scrollTo;

      setupPositionObserver();

      if (scrollTo) {
        markCurrentAyah(scrollTo);
        requestAnimationFrame(() => {
          const el = els.article.querySelector(`.ayah[data-n="${scrollTo}"]`);
          if (el) {
            /* "instant" overrides the page's smooth scroll-behavior so
               the position observer marks the target, not an intermediate
               ayah mid-animation. */
            el.scrollIntoView({ behavior: "instant", block: "start" });
            markCurrentAyah(scrollTo);
          }
        });
      } else {
        window.scrollTo(0, 0);
        const first = ayahs[0];
        if (first) markCurrentAyah(first.n);
      }

      savePosition(scrollTo || ayahs[0] && ayahs[0].n);
      updateURL(scrollTo, options.updateURL ? "push" : "replace");
    } catch (err) {
      if (token !== loadToken) return;
      renderError(err && err.message ? err.message : "Unknown error.");
    }
  }

  /* --- Delegated events ----------------------------------------------- */

  function bindEvents() {
    /* Article: play / bookmark / star / pager / retry / reveal */
    if (els.article) {
      els.article.addEventListener("click", (event) => {
        const play = event.target.closest(".ayah-play");
        if (play) {
          playAyah(Number(play.dataset.n), { playlist: false });
          return;
        }
        const bm = event.target.closest(".ayah-bm");
        if (bm) {
          toggleBookmark(Number(bm.dataset.n));
          return;
        }
        const star = event.target.closest(".ayah-star");
        if (star) {
          toggleMemorized(Number(star.dataset.n));
          return;
        }
        const pager = event.target.closest(".pager-link");
        if (pager) {
          event.preventDefault();
          loadSurah(Number(pager.dataset.n), null, { updateURL: true });
          return;
        }
        if (event.target.closest(".retry-btn")) {
          const { ayah } = parseParams();
          loadSurah(surahNumber, ayah, { updateURL: false });
          return;
        }
        /* Tap an Arabic word to hear only that word. Keep this before
           the hidden-text reveal so it does not unhide the ayah. */
        const word = event.target.closest(".ayah-arabic .w");
        if (word) {
          playWord(word);
          return;
        }
        /* Hidden-text testing: tap the Arabic to reveal just that ayah. */
        if (els.article.classList.contains("hide-mem-text")) {
          const ayahEl = event.target.closest(".ayah");
          if (ayahEl && !event.target.closest("button, a, .ayah-wbw, .wbw-meaning")) {
            ayahEl.classList.toggle("reveal");
            showToast(ayahEl.classList.contains("reveal")
              ? `Ayah ${ayahEl.dataset.n} revealed — tap again to hide it.`
              : `Ayah ${ayahEl.dataset.n} hidden again.`);
          }
        }
      });
    }

    /* Qur’an index — Surah / Juz / Page tabs, shared by both modes */
    if (els.indexTabs) {
      els.indexTabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-index-tab]");
        if (!tab) return;
        setIndexTab(tab.dataset.indexTab);
        if (els.indexSearch) els.indexSearch.focus();
      });
    }
    if (els.indexList) {
      els.indexList.addEventListener("click", (event) => {
        const item = event.target.closest(".surah-item");
        if (!item) return;
        const kind = item.dataset.kind || "surah";
        const inRead = window.QuranPage &&
          window.QuranPage.currentMode() === "read";

        if (kind === "juz") {
          const surahN = Number(item.dataset.surah);
          const ayahN = Number(item.dataset.ayah);
          if (inRead) {
            window.QuranPage.jumpToSurah(surahN, ayahN);
          } else {
            loadSurah(surahN, ayahN, { updateURL: true });
            if (window.QuranPage) window.QuranPage.closeIndex();
          }
          return;
        }

        if (kind === "page") {
          const page = Number(item.dataset.page);
          if (inRead) {
            window.Mushaf.loadPage(page);
            window.QuranPage.closeIndex();
          } else if (window.QuranPage && window.QuranPage.openReadPage) {
            window.QuranPage.openReadPage(page);
          }
          return;
        }

        const n = Number(item.dataset.n);
        if (inRead) {
          window.QuranPage.jumpToSurah(n);
        } else {
          loadSurah(n, null, { updateURL: true });
          if (window.QuranPage) window.QuranPage.closeIndex();
        }
      });
    }
    if (els.indexSearch) {
      els.indexSearch.addEventListener("input", (e) => filterIndex(e.target.value));
    }

    /* A single Settings control hides the Arabic immediately and saves
       the same state for the next Memorize session. */
    if (els.hideText) {
      els.hideText.addEventListener("click", () => {
        const on = els.hideText.getAttribute("aria-pressed") !== "true";
        applyHideText(on);
        Store.setPreferences({ hideTextDefault: on });
        document.dispatchEvent(new CustomEvent("quran-prefs-changed", {
          detail: { hideTextNow: on, hideTextDefault: on }
        }));
        showToast(on
          ? "Arabic hidden — tap any ayah to reveal it."
          : "Arabic shown again.");
      });
    }

    /* Shared toolbar: repeat and speed stay during listening;
       play, reciter and translation are routed by quran-page / Settings. */
    const repeatEl = document.getElementById("repeat-select");
    if (repeatEl) repeatEl.addEventListener("change", () => {
      Store.setPreferences({ repeat: Number(repeatEl.value) });
      repeatLeft = repeatCount();
    });
    const speedEl = document.getElementById("speed-select");
    if (speedEl) speedEl.addEventListener("change", () => {
      Store.setPreferences({ speed: Number(speedEl.value) });
      audio.defaultPlaybackRate = speedValue();
      audio.playbackRate = speedValue();
    });
    /* Audio lifecycle */
    audio.addEventListener("ended", () => {
      if (loadedAyahNum !== null && repeatLeft > 1) {
        repeatLeft -= 1;
        audio.currentTime = 0;
        audio.play().catch(() => clearPlaybackUI());
        return;
      }
      if (surahPlaylist && loadedAyahNum !== null) {
        const next = ayahs.find((a) => a.n === loadedAyahNum + 1);
        if (next) {
          playAyah(next.n, { playlist: true });
          const el = els.article.querySelector(`.ayah[data-n="${next.n}"]`);
          if (el) {
            el.scrollIntoView({
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto" : "smooth",
              block: "center"
            });
          }
          return;
        }
        if (prefs().autoplayNextSurah && surahNumber < 114) {
          const next = surahNumber + 1;
          showToast(`Surah complete — continuing with Surah ${next}.`);
          loadSurah(next, 1, { updateURL: true }).then(() => {
            playAyah(1, { playlist: true });
          });
          return;
        }
        showToast("Surah complete.");
      }
      clearPlaybackUI();
    });
    audio.addEventListener("error", () => {
      if (loadedAyahNum === null) return;
      showToast("Audio unavailable — check your connection.");
      clearPlaybackUI();
    });
    audio.addEventListener("play", refreshPlayButtons);
    audio.addEventListener("pause", refreshPlayButtons);
  }

  /* Reciter and translation language are set once in Settings.
     Repeat and speed stay in the shared toolbar. */
  function populateToolbarSelects() {
    populateExtraSelects();
  }

  function fillSelect(id, options, current) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = options.map(([value, label]) =>
      `<option value="${escapeHTML(value)}" ${String(value) === String(current) ? "selected" : ""}>${escapeHTML(label)}</option>`
    ).join("");
  }

  function populateExtraSelects() {
    fillSelect("repeat-select", [1, 3, 5, 10].map((n) => [n, `Repeat ${n}\u00d7`]), repeatCount());
    fillSelect("speed-select", [0.75, 1, 1.25].map((n) => [n, `${n}\u00d7 speed`]), speedValue());
  }

  /* --- Init ------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", () => {
    applyFontStyle();
    applyFontSize();
    applyTranslitVisibility();
    applyWordByWordVisibility();
    populateToolbarSelects();
    setIndexTab("surah");
    bindEvents();
    /* A real scroll gesture releases a deep-linked position lock so
       the observer can follow the reader again. */
    ["wheel", "touchmove", "keydown"].forEach((type) => {
      window.addEventListener(type, () => { positionLock = null; }, { passive: true });
    });

    document.addEventListener("quran-prefs-changed", (event) => {
      const detail = event.detail || {};
      applyFontStyle();
      applyFontSize();
      applyTranslitVisibility();
      applyWordByWordVisibility();
      if ("hideTextDefault" in detail) {
        applyHideText(prefs().hideTextDefault === true);
      }
      if ("translation" in detail && window.QuranPage &&
          window.QuranPage.currentMode() === "memorize") {
        loadSurah(surahNumber, null, { updateURL: false });
      }
    });
    /* The first surah load happens when Memorize mode is
       activated (js/quran-page.js) — never eagerly. */
  });

  /* Public surface used by js/quran-page.js */
  window.Memorize = {
    open: (surah, ayah) => loadSurah(surah, ayah, { updateURL: false }),
    stopAudio: stopPlayback,
    togglePlay,
    toggleTranslation,
    current: () => surahNumber,
    currentAyah: () => {
      const el = els.article.querySelector(".ayah.is-current");
      return el ? Number(el.dataset.n) : null;
    }
  };
})();
