/* ============================================================
   quran-page.js — mode coordinator for pages/quran.html.

   Owns the Read | Memorize switch and the one compact toolbar:
   - remembers the mode in localStorage (via Store, try/catch)
   - shows only the active mode's view and audio bar
   - drives the shared Play / Translation controls
   - keeps ?mode=&page=&surah=&ayah= in the URL shareable
   - routes legacy links (?surah=X&ayah=Y) to the right page
   - owns the shared Surah / Juz / Page index and small drawers
   ============================================================ */

(function () {
  "use strict";

  const els = {
    body: document.body,
    modeRead: document.getElementById("mode-read"),
    modeMemorize: document.getElementById("mode-memorize"),
    playToggle: document.getElementById("play-toggle"),
    translationToggle: document.getElementById("translation-toggle"),
    readView: document.getElementById("read-view"),
    memorizeView: document.getElementById("memorize-view"),
    audioBar: document.getElementById("audio-bar"),
    index: document.getElementById("surah-index"),
    indexBackdrop: document.getElementById("index-backdrop"),
    indexToggles: Array.from(document.querySelectorAll(".index-toggle")),
    indexClose: document.getElementById("index-close"),
    quickSettingsToggle: document.getElementById("quick-settings-toggle"),
    quickDrawer: document.getElementById("quick-settings-drawer"),
    quickBackdrop: document.getElementById("quick-settings-backdrop"),
    quickClose: document.getElementById("quick-settings-close"),
    focusToggle: document.getElementById("focus-toggle"),
    focusExit: document.getElementById("focus-exit")
  };

  let mode = "read";
  let readLoaded = false;
  let memorizeLoaded = false;
  let focusMode = false;
  let enteredFullscreen = false;

  /* --- URL ------------------------------------------------------ */

  function parseParams() {
    const params = new URLSearchParams(location.search);
    const num = (name, min, max) => {
      const v = Number(params.get(name));
      return Number.isInteger(v) && v >= min && v <= max ? v : null;
    };
    const rawMode = params.get("mode");
    return {
      mode: rawMode === "read" || rawMode === "memorize" ? rawMode : null,
      page: num("page", 1, Store.TOTAL_PAGES),
      surah: num("surah", 1, 114),
      ayah: num("ayah", 1, 286)
    };
  }

  function syncURL() {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (mode === "read" && window.Mushaf) {
      params.set("page", String(window.Mushaf.current()));
    }
    if (mode === "memorize" && window.Memorize) {
      params.set("surah", String(window.Memorize.current()));
      const ayah = window.Memorize.currentAyah && window.Memorize.currentAyah();
      if (ayah) params.set("ayah", String(ayah));
    }
    history.replaceState({ mode }, "", `?${params.toString()}`);
  }

  /* --- Drawer transitions ----------------------------------------
     Keep the element in the DOM until its slide-out finishes, then
     set hidden so [hidden] can remove it from layout/a11y. */

  const DRAWER_MS = 300;
  const drawerTimers = new WeakMap();

  function showDrawer(drawer, backdrop) {
    if (!drawer || !backdrop) return;
    clearTimeout(drawerTimers.get(drawer));
    drawer.hidden = false;
    backdrop.hidden = false;
    void drawer.offsetWidth;
    drawer.classList.add("is-open");
    backdrop.classList.add("is-open");
  }

  function hideDrawer(drawer, backdrop) {
    if (!drawer || !backdrop) return;
    clearTimeout(drawerTimers.get(drawer));
    drawer.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    drawerTimers.set(drawer, window.setTimeout(() => {
      if (!drawer.classList.contains("is-open")) {
        drawer.hidden = true;
        backdrop.hidden = true;
      }
    }, DRAWER_MS));
  }

  /* --- Settings drawer --------------------------------------------
     A right-side slide-over, not a toolbar dropdown. It holds the
     listening / reading choices used while on the Qur’an page. */

  function settingsDrawerIsOpen() {
    return Boolean(els.quickDrawer && els.quickDrawer.classList.contains("is-open"));
  }

  function openSettingsDrawer() {
    if (!els.quickDrawer || !els.quickBackdrop) return;
    closeIndex();
    showDrawer(els.quickDrawer, els.quickBackdrop);
    document.body.classList.add("settings-drawer-open");
    if (els.quickSettingsToggle) els.quickSettingsToggle.setAttribute("aria-expanded", "true");
    const activeTab = els.quickDrawer.querySelector('[data-settings-tab][aria-selected="true"]');
    if (activeTab) activeTab.focus();
    else if (els.quickClose) els.quickClose.focus();
  }

  function closeSettingsDrawer() {
    if (!els.quickDrawer || !els.quickBackdrop) return;
    hideDrawer(els.quickDrawer, els.quickBackdrop);
    document.body.classList.remove("settings-drawer-open");
    if (els.quickSettingsToggle) els.quickSettingsToggle.setAttribute("aria-expanded", "false");
  }

  /* --- Focus mode -------------------------------------------------
     Distraction-free reading: only the mushaf / ayah list and page
     navigation remain. Fullscreen is used when the browser allows it;
     the CSS works on its own when it does not. */
  function setFocusMode(on) {
    focusMode = Boolean(on);
    els.body.classList.toggle("focus-mode", focusMode);
    if (els.focusExit) els.focusExit.hidden = !focusMode;
    if (els.focusToggle) {
      els.focusToggle.setAttribute("aria-pressed", String(focusMode));
      els.focusToggle.setAttribute("aria-label", focusMode ? "Exit focus mode" : "Enter focus mode");
    }

    if (focusMode) {
      closeIndex();
      closeSettingsDrawer();
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          enteredFullscreen = true;
        }).catch(() => {
          enteredFullscreen = false;
        });
      }
      if (els.focusExit) els.focusExit.focus({ preventScroll: true });
      return;
    }

    if (enteredFullscreen && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      enteredFullscreen = false;
    }
    if (els.focusToggle) els.focusToggle.focus({ preventScroll: true });
  }

  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) return;
    enteredFullscreen = false;
    if (focusMode) setFocusMode(false);
  });

  /* Public aliases used by the mode controllers. */
  function openSettings() { openSettingsDrawer(); }
  function closeSettings() { closeSettingsDrawer(); }

  /* --- Qur’an index drawer (shared) ------------------------------- */

  function openIndex() {
    closeSettingsDrawer();
    showDrawer(els.index, els.indexBackdrop);
    document.body.classList.add("index-open");
    els.indexToggles.forEach((btn) => btn.setAttribute("aria-expanded", "true"));
    const search = document.getElementById("index-search");
    if (search) search.focus();
  }

  function closeIndex() {
    hideDrawer(els.index, els.indexBackdrop);
    document.body.classList.remove("index-open");
    els.indexToggles.forEach((btn) => btn.setAttribute("aria-expanded", "false"));
  }

  function indexIsOpen() {
    return els.index.classList.contains("is-open");
  }

  /* --- Shared toolbar --------------------------------------------- */

  function setPlayState(playing) {
    if (!els.playToggle) return;
    els.playToggle.setAttribute("aria-pressed", String(Boolean(playing)));
    els.playToggle.setAttribute("aria-label", playing ? "Pause recitation" : "Play recitation");
    const label = els.playToggle.querySelector(".label");
    if (label) label.textContent = playing ? "Pause" : "Play";
  }

  function togglePlay() {
    if (mode === "read") {
      if (window.Mushaf && window.Mushaf.togglePlay) window.Mushaf.togglePlay();
    } else if (window.Memorize && window.Memorize.togglePlay) {
      window.Memorize.togglePlay();
    }
  }

  function toggleTranslation() {
    const controller = mode === "read" ? window.Mushaf : window.Memorize;
    if (controller && controller.toggleTranslation) controller.toggleTranslation();
  }

  function applyTranslationState() {
    let on = false;
    try {
      const prefs = Store.getPreferences();
      /* Until the shared toggle is used, keep the historical defaults:
         off in Read mode, on in Memorize mode. */
      on = prefs.showTranslation === undefined
        ? (mode === "read"
          ? prefs.showTranslationRead === true
          : prefs.showTranslationRead !== false)
        : prefs.showTranslation !== false;
    } catch (err) { /* keep the offline-safe default */ }
    if (els.translationToggle) els.translationToggle.setAttribute("aria-pressed", String(on));
  }

  /* --- Mode switching ---------------------------------------------- */

  function currentMode() {
    return mode;
  }

  /* Quran Foundation asks that streamed audio and translations keep
     their author credits visible alongside the content. The IDs in
     localStorage are the legacy preference IDs; labels come from the
     normalized catalog in quran-api.js. */
  function applyCredits() {
    const el = document.getElementById("content-credits");
    if (!el || !window.QuranAPI) return;
    const prefs = Store.getPreferences();
    const reciter = QuranAPI.RECITERS.find((item) => item.id === prefs.reciter) ||
      QuranAPI.RECITERS[0];
    const translation = QuranAPI.TRANSLATIONS.find((item) => item.id === prefs.translation) ||
      QuranAPI.TRANSLATIONS[0];
    el.textContent =
      ` Recitation: ${reciter.label}. Translation: ${translation.label}.`;
  }

  function setMode(next, load) {
    mode = next === "memorize" ? "memorize" : "read";

    els.body.classList.toggle("mode-read", mode === "read");
    els.body.classList.toggle("mode-memorize", mode === "memorize");

    els.modeRead.setAttribute("aria-pressed", String(mode === "read"));
    els.modeMemorize.setAttribute("aria-pressed", String(mode === "memorize"));
    /* Only the active mode's view is on screen; [hidden] wins over
       the layout classes in the stylesheets. */
    if (els.readView) els.readView.hidden = mode !== "read";
    if (els.memorizeView) els.memorizeView.hidden = mode !== "memorize";
    els.audioBar.hidden = mode !== "read";

    Store.setPreferences({ mode });
    document.dispatchEvent(new CustomEvent("quran-mode-changed", { detail: { mode } }));
    setPlayState(false);
    applyTranslationState();
    /* The ayah progress line is shared; refresh it on every switch. */
    if (window.Mushaf) window.Mushaf.refreshKhatm();

    if (mode === "read") {
      if (window.Memorize) window.Memorize.stopAudio();
      if (load && window.Mushaf) {
        readLoaded = true;
        /* Reload on every switch so the mushaf opens at the exact
           ayah Memorize last recorded, not a stale page. */
        readStart().then((start) => {
          if (mode === "read" && window.Mushaf) {
            window.Mushaf.loadPage(start.page, { focus: start.focus });
          }
        });
      } else if (window.Mushaf) {
        window.Mushaf.refreshKhatm();
      }
    } else {
      if (window.Mushaf) window.Mushaf.stopAudio();
      if (load && window.Memorize) {
        memorizeLoaded = true;
        const params = parseParams();
        const stored = Store.getPosition();
        const start = params.surah ||
          (stored && getSurah(stored.surah) ? Number(stored.surah) : 1);
        const ayah = params.ayah ||
          (stored && Number(stored.surah) === Number(start) ? stored.ayah : null);
        window.Memorize.open(start, ayah);
      }
    }
    closeIndex();
    closeSettingsDrawer();
  }

  /* Read and Memorize share one position record. An explicit ?page=
     still wins; otherwise the stored page is opened with its stored
     surah/ayah as the scroll focus, so switching modes mirrors the
     exact place instead of restarting the page. */
  async function readStart() {
    const params = parseParams();
    if (params.page) {
      return {
        page: params.page,
        focus: params.surah
          ? { surah: params.surah, ayah: params.ayah || 1 }
          : null
      };
    }

    const stored = Store.getPosition() || {};
    const surah = Number(stored.surah);
    const ayah = Number(stored.ayah);
    const focus = Number.isInteger(surah) && surah >= 1 && surah <= 114 &&
      Number.isInteger(ayah) && ayah >= 1 && ayah <= 286
      ? { surah, ayah }
      : null;

    const page = Number(stored.page);
    if (Number.isInteger(page) && page >= 1 && page <= Store.TOTAL_PAGES) {
      return { page, focus };
    }

    if (focus) {
      try {
        const resolved = await QuranAPI.fetchSurahPageOf(surah, ayah);
        if (Number.isInteger(resolved)) return { page: resolved, focus };
      } catch (err) { /* fall through to the older preference */ }
    }

    const prefs = Store.getPreferences();
    const last = Number(prefs.lastReadPage);
    return {
      page: Number.isInteger(last) && last >= 1 && last <= Store.TOTAL_PAGES ? last : 1,
      focus: null
    };
  }

  /* A ?surah=X&ayah=Y link in Read mode turns into the mushaf
     page that holds that ayah — answered by the API itself. */
  async function jumpToSurah(surahNumber, ayahNumber) {
    if (mode !== "read") {
      setMode("read", false);
    }
    readLoaded = true;
    try {
      const page = await QuranAPI.fetchSurahPageOf(surahNumber, ayahNumber);
      window.Mushaf.loadPage(page, {
        focus: { surah: surahNumber, ayah: ayahNumber || 1 }
      });
    } catch (err) {
      window.Mushaf.loadPage(1);
    }
    closeIndex();
  }

  /* Page entries are mushaf positions, so they always open in Read mode. */
  function openReadPage(pageNumber) {
    if (mode !== "read") setMode("read", false);
    readLoaded = true;
    if (window.Mushaf) window.Mushaf.loadPage(pageNumber);
    closeIndex();
  }

  /* --- Events ---------------------------------------------------------- */

  function bindEvents() {
    els.modeRead.addEventListener("click", () => {
      if (mode !== "read") setMode("read", true);
    });
    els.modeMemorize.addEventListener("click", () => {
      if (mode !== "memorize") setMode("memorize", true);
    });

    if (els.playToggle) els.playToggle.addEventListener("click", togglePlay);
    if (els.translationToggle) els.translationToggle.addEventListener("click", toggleTranslation);

    els.indexToggles.forEach((btn) => btn.addEventListener("click", () => openIndex()));
    if (els.indexClose) els.indexClose.addEventListener("click", closeIndex);
    if (els.indexBackdrop) els.indexBackdrop.addEventListener("click", closeIndex);

    if (els.quickSettingsToggle) {
      els.quickSettingsToggle.addEventListener("click", () => {
        if (settingsDrawerIsOpen()) closeSettingsDrawer(); else openSettingsDrawer();
      });
    }

    if (els.quickClose) els.quickClose.addEventListener("click", closeSettingsDrawer);
    if (els.quickBackdrop) els.quickBackdrop.addEventListener("click", closeSettingsDrawer);

    if (els.focusToggle) {
      els.focusToggle.addEventListener("click", () => setFocusMode(!focusMode));
    }
    if (els.focusExit) els.focusExit.addEventListener("click", () => setFocusMode(false));

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (focusMode) setFocusMode(false);
      else if (settingsDrawerIsOpen()) closeSettingsDrawer();
      else if (indexIsOpen()) closeIndex();
    });

    document.addEventListener("quran-play-state", (event) => {
      if (event.detail && event.detail.mode === mode) setPlayState(event.detail.playing);
    });
    document.addEventListener("quran-prefs-changed", (event) => {
      applyCredits();
      const detail = event.detail || {};
      if (!("showTranslation" in detail) && !("showTranslationRead" in detail)) return;
      applyTranslationState();
    });

    /* Back / forward: re-route from the URL */
    window.addEventListener("popstate", () => {
      const params = parseParams();
      const next = params.mode || mode;
      if (next !== mode) setMode(next, false);
      if (next === "read") {
        readLoaded = true;
        if (params.surah && !params.page) {
          jumpToSurah(params.surah, params.ayah);
        } else {
          readStart().then((start) => {
            if (window.Mushaf) window.Mushaf.loadPage(start.page, { focus: start.focus });
          });
        }
      } else if (params.surah) {
        memorizeLoaded = true;
        window.Memorize.open(params.surah, params.ayah);
      }
    });
  }

  /* --- Init ------------------------------------------------------------ */

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    applyCredits();
    const params = parseParams();
    /* A deeper link to a mushaf page or an ayah always means Read
       mode, even if Memorize was the last mode used. */
    const deepLink = !params.mode && (params.page || params.surah);
    const initial = params.mode ||
      (deepLink ? "read"
        : (Store.getPreferences().mode === "memorize" ? "memorize" : "read"));
    const needsJump = initial === "read" && params.surah && !params.page;

    /* A legacy ?surah=X&ayah=Y link is loaded once by jumpToSurah,
       so setMode must not race it with the stored position. */
    setMode(initial, !needsJump);

    if (needsJump) jumpToSurah(params.surah, params.ayah);
  });

  /* Public surface used by mushaf.js / reader.js */
  window.QuranPage = {
    currentMode,
    syncURL,
    jumpToSurah,
    openReadPage,
    closeIndex,
    openSettings,
    closeSettings,
    setFocusMode,
    setPlayState
  };
})();
