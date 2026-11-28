/* ============================================================
   arabic-font.js — safe fallback for Arabic text.

   Quranic glyphs use the QCF V4/V2 page fonts loaded from Quran
   Foundation. Those are chosen by the Tajwid switch, not here.
   Amiri is the only local fallback while a page font is loading.
   ============================================================ */

(function () {
  "use strict";

  const OPTIONS = [["amiri", "Amiri"]];
  const VALID = new Set(OPTIONS.map(([value]) => value));

  function normalize(style) {
    return VALID.has(style) ? style : "amiri";
  }

  function apply(style) {
    document.documentElement.dataset.arabicFont = normalize(style);
  }

  window.QuranFont = { OPTIONS, normalize, apply };
})();
