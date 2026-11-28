/* ============================================================
   more-settings.js — Listening and Reading controls in the
   Quran page’s Settings drawer. These used to live on the
   standalone Settings page;
   they are kept here so they can be changed while reading or
   listening. Every choice is written through Store.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let toastTimer = null;

  function toast(text) {
    const el = $("reader-toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  function setPressed(id, on) {
    const el = $(id);
    if (el) el.setAttribute("aria-pressed", String(Boolean(on)));
  }

  function isPressed(id) {
    const el = $(id);
    return Boolean(el && el.getAttribute("aria-pressed") === "true");
  }

  function fillSelect(select, options, current) {
    if (!select) return;
    select.innerHTML = "";
    options.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label;
      option.selected = String(value) === String(current);
      select.appendChild(option);
    });
    if (window.QuranSelects) window.QuranSelects.enhanceAll();
  }

  function applyFontStyle(style) {
    if (window.QuranFont) window.QuranFont.apply(style);
  }

  function applyTajwid(on) {
    document.documentElement.dataset.tajwid = on ? "on" : "off";
  }

  /* A small Memorize-mode preview so display choices are visible
     while they are changed, instead of only on the surah behind
     the drawer. The sample is global ayah 7; once its QCF V4 word
     glyphs arrive, the same page font colours it as the reader does.
     Until then the plain Uthmani spelling stays visible. */
  const PREVIEW_ARABIC =
    "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ";
  const PREVIEW_GLOBAL_AYAH = 7;
  let previewGlyphWords = null;
  let previewWordByWord = null;
  const PREVIEW_TRANSLIT =
    "Sirāta alladhīna anʿamta ʿalayhim ghayri al-maghḍūbi ʿalayhim wa-lā aḍ-ḍāllīn";
  const PREVIEW_TRANSLATION =
    "The path of those upon whom You have bestowed favor, not of those who have evoked anger or of those who are astray.";
  let previewTranslit = PREVIEW_TRANSLIT;
  let previewTranslation = PREVIEW_TRANSLATION;
  let previewStudyToken = 0;

  function renderPreview() {
    const el = $("preview-arabic");
    if (!el || !window.QuranTimings) return;
    el.innerHTML = Array.isArray(previewGlyphWords) && previewGlyphWords.length
      ? window.QuranTimings.wordsHTML(PREVIEW_ARABIC, {
          glyphWords: previewGlyphWords
        })
      : window.QuranTimings.wordsHTML(PREVIEW_ARABIC);
    if (window.QuranTimings.applyQcfFonts) {
      window.QuranTimings.applyQcfFonts(el);
    }
    const translit = $("preview-translit");
    if (translit) translit.textContent = previewTranslit;
    const translation = $("preview-translation");
    if (translation) translation.textContent = previewTranslation;
    const words = $("preview-wbw");
    if (words && window.QuranTimings) {
      words.innerHTML = previewWordByWord
        ? window.QuranTimings.meaningsHTML(previewWordByWord)
        : "";
    }
  }

  function loadPreviewGlyphs() {
    if (!window.QuranAPI || !QuranAPI.fetchAyahGlyphs) return;
    QuranAPI.fetchAyahGlyphs(PREVIEW_GLOBAL_AYAH)
      .then((glyphWords) => {
        previewGlyphWords = glyphWords;
        renderPreview();
        updatePreview();
      })
      .catch(() => { /* Offline: keep the exact plain Uthmani sample. */ });
  }

  function loadPreviewWordByWord() {
    if (!window.QuranAPI || !QuranAPI.fetchAyahWordByWord) return;
    QuranAPI.fetchAyahWordByWord(PREVIEW_GLOBAL_AYAH)
      .then((meanings) => {
        previewWordByWord = meanings;
        renderPreview();
        updatePreview();
      })
      .catch(() => { /* Offline: leave the meaning line empty. */ });
  }

  /* The sample above used to be a fixed English sentence, so changing
     the Translation select appeared to do nothing. Load ayah 1:7 in the
     selected edition and refresh both preview lines in place. */
  function loadPreviewStudy() {
    if (!window.QuranAPI || !QuranAPI.fetchSurahStudy) return;
    const token = ++previewStudyToken;
    const id = Store.getPreferences().translation || QuranAPI.TRANSLATIONS[0].id;
    QuranAPI.fetchSurahStudy(1, id)
      .then((data) => {
        if (token !== previewStudyToken) return;
        const ayah = data && Array.isArray(data.ayahs)
          ? data.ayahs.find((item) => Number(item.n) === 7)
          : null;
        if (!ayah) return;
        previewTranslation = ayah.translation || ayah.arabic || PREVIEW_TRANSLATION;
        previewTranslit = ayah.transliteration || PREVIEW_TRANSLIT;
        renderPreview();
      })
      .catch(() => { /* Offline: keep the last known sample text. */ });
  }

  function updatePreview() {
    const section = $("display-preview-section");
    const box = $("display-preview");
    if (!section || !box) return;
    /* The preview is now the first item in the Display tab, in both modes. */
    section.hidden = false;
    const prefs = Store.getPreferences();
    const showTranslation = prefs.showTranslation === undefined
      ? prefs.showTranslationRead !== false
      : prefs.showTranslation !== false;
    box.classList.toggle("is-text-hidden", isPressed("hide-text-toggle"));
    box.classList.toggle("is-translit-hidden", prefs.showTransliteration === false);
    box.classList.toggle("is-translation-hidden", !showTranslation);
    box.classList.toggle("is-wordbyword-hidden", prefs.showWordByWord !== true);
  }

  function announce(detail) {
    document.dispatchEvent(new CustomEvent("quran-prefs-changed", { detail }));
  }

  function init() {
    const prefs = Store.getPreferences();

    fillSelect(
      $("setting-reciter"),
      QuranAPI.RECITERS.map((r) => [r.id, r.label]),
      prefs.reciter || QuranAPI.RECITERS[0].id
    );
    fillSelect(
      $("setting-translation"),
      QuranAPI.TRANSLATIONS.map((t) => [t.id, t.label]),
      prefs.translation || QuranAPI.TRANSLATIONS[0].id
    );

    /* Arabic glyph faces come from Quran Foundation QCF V4/V2, selected
       by the Tajwid switch. Amiri is only a safe fallback while a page
       font loads, so there is no local font picker to maintain. */
    applyFontStyle(prefs.arabicFontStyle);

    setPressed("setting-tajwid", prefs.showTajwid !== false);
    applyTajwid(prefs.showTajwid !== false);
    setPressed("setting-autoplay", prefs.autoplayNextSurah === true);
    setPressed("setting-translit", prefs.showTransliteration !== false);
    setPressed("setting-wordbyword", prefs.showWordByWord === true);
    /* One control now hides immediately and persists as the default. */
    setPressed("hide-text-toggle", prefs.hideTextDefault === true);
    renderPreview();
    updatePreview();
    loadPreviewGlyphs();
    loadPreviewWordByWord();
    loadPreviewStudy();
  }

  function stopCurrentAudio(message) {
    const playing = $("play-toggle") &&
      $("play-toggle").getAttribute("aria-pressed") === "true";
    if (!playing) return;
    if (window.Mushaf) window.Mushaf.stopAudio();
    if (window.Memorize) window.Memorize.stopAudio();
    toast(message);
  }

  /* Two top-level drawer sections: Display (live preview first) and
     Audio (reciter + auto-play). Display is the default tab. */
  function bindSettingsTabs() {
    const tabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-settings-panel]"));
    if (!tabs.length || !panels.length) return;

    function activate(name, focus) {
      let activeTab = null;
      const list = document.getElementById("settings-tabs");
      if (list) list.dataset.active = name;
      tabs.forEach((tab) => {
        const on = tab.dataset.settingsTab === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on) activeTab = tab;
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.settingsPanel !== name;
      });
      updatePreview();
      if (focus && activeTab) activeTab.focus();
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab.dataset.settingsTab));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        activate(tabs[next].dataset.settingsTab, true);
      });
    });

    const initial = tabs.find((tab) => tab.classList.contains("is-active")) || tabs[0];
    activate(initial.dataset.settingsTab, false);
  }

  function bind() {
    bindSettingsTabs();
    const reciter = $("setting-reciter");
    if (reciter) reciter.addEventListener("change", () => {
      Store.setPreferences({ reciter: reciter.value });
      stopCurrentAudio("Reciter changed — recitation stopped. Press Play to continue.");
    });

    const translation = $("setting-translation");
    if (translation) translation.addEventListener("change", () => {
      /* Picking an edition is an explicit request to read it, so turn
         the shared Translation display on instead of leaving it hidden. */
      Store.setPreferences({
        translation: translation.value,
        showTranslation: true,
        showTranslationRead: true
      });
      announce({
        translation: translation.value,
        showTranslation: true,
        showTranslationRead: true
      });
      loadPreviewStudy();
      stopCurrentAudio("Translation changed — recitation stopped.");
      toast("Translation language saved and shown.");
    });

    const tajwid = $("setting-tajwid");
    if (tajwid) tajwid.addEventListener("click", () => {
      const on = !isPressed("setting-tajwid");
      setPressed("setting-tajwid", on);
      applyTajwid(on);
      Store.setPreferences({ showTajwid: on });
      announce({ showTajwid: on });
      /* Swap the page fonts in place: V4 is coloured, V2 is plain. */
      if (window.QuranTimings && window.QuranTimings.applyQcfFonts) {
        window.QuranTimings.applyQcfFonts(document);
      }
      toast(on ? "Tajwid colours on." : "Tajwid colours off.");
    });

    document.addEventListener("quran-prefs-changed", (event) => {
      const detail = event.detail || {};
      /* Memorize mode owns the single hide-text control; mirror its
         state here so the drawer and live preview change in the same tap. */
      if ("hideTextNow" in detail || "hideTextDefault" in detail) {
        const on = "hideTextNow" in detail
          ? detail.hideTextNow === true
          : detail.hideTextDefault === true;
        setPressed("hide-text-toggle", on);
      }
      if ("translation" in detail) loadPreviewStudy();
      updatePreview();
    });
    document.addEventListener("quran-mode-changed", () => updatePreview());

    [["setting-autoplay", "autoplayNextSurah"],
     ["setting-translit", "showTransliteration"],
     ["setting-wordbyword", "showWordByWord"]].forEach(([id, key]) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", () => {
        const on = !isPressed(id);
        setPressed(id, on);
        Store.setPreferences({ [key]: on });
        announce({ [key]: on });
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    bind();
  });
})();
