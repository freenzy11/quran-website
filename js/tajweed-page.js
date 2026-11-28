/* ============================================================
   tajweed-page.js — Tajweed rules legend.

   Rule metadata and examples are not invented here: the names and
   colours come from js/tajwid.js (mapped to the Quran Foundation
   Tajweed classes), and every example is the first explicitly
   tagged run found in the live `text_uthmani_tajweed` field.
   ============================================================ */

(function () {
  "use strict";

  /* Surah 2 contains every published rule except Idgham
     Mutaqaribayn, which has no live tagged example available to every
     account. That rule still shows its official colour and name. */
  const SOURCE_SURAHS = [2];

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cardHTML(rule, example) {
    const exampleHTML = example
      ? `<span class="tajweed-example-ref">Qur’an ${example.surah}:${example.ayah}</span>
         <p class="tajweed-example-arabic" lang="ar" dir="rtl" translate="no">${
           window.QuranTajwid.renderUnits(example.units, false)
         }</p>`
      : `<p class="tajweed-example-arabic" lang="ar" dir="rtl" translate="no" aria-hidden="true">&mdash;</p>`;

    return `
      <article class="tajweed-card">
        <div class="tajweed-card-head">
          <span class="tajweed-swatch" style="background:var(--tj-${rule.id})" aria-hidden="true"></span>
          <div>
            <h2>${escapeHTML(rule.english)}</h2>
            <p class="tajweed-arabic-name" lang="ar" dir="rtl" translate="no">${escapeHTML(rule.arabic)}</p>
          </div>
        </div>
        <span class="tajweed-color">${escapeHTML(rule.color)}</span>
        <p class="tajweed-explanation">${escapeHTML(rule.explanation)}</p>
        <p class="tajweed-pronunciation"><strong>Pronunciation:</strong> ${escapeHTML(rule.pronunciation)}</p>
        <div class="tajweed-example">${exampleHTML}</div>
      </article>`;
  }

  async function loadExamples() {
    const status = document.getElementById("tajweed-status");
    if (!status) return {};
    try {
      if (!window.QuranAPI || !QuranAPI.fetchTajweedSurah) {
        throw new Error("Tajweed data API is unavailable.");
      }
      const examples = {};
      const total = window.QuranTajwid.RULES.length;

      let loadedAny = false;
      for (const surah of SOURCE_SURAHS) {
        if (Object.keys(examples).length === total) break;
        let map;
        try {
          map = await QuranAPI.fetchTajweedSurah(surah);
        } catch (err) {
          /* A prelive account may not expose every source surah. Keep
             the examples that did load instead of dropping them all. */
          continue;
        }
        if (!map.size) continue;
        loadedAny = true;
        const ayahs = [...map.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]));
        window.QuranTajwid.RULES.forEach((rule) => {
          if (examples[rule.code]) return;
          for (const [ayah, tagged] of ayahs) {
            const found = window.QuranTajwid.findExample(tagged.units, rule.code);
            if (found) {
              examples[rule.code] = {
                surah, ayah: Number(ayah), units: found.units
              };
              break;
            }
          }
        });
      }
      if (!loadedAny) throw new Error("No tagged examples are available.");

      const missing = total - Object.keys(examples).length;
      status.textContent = missing
        ? `Examples loaded for ${Object.keys(examples).length} of ${window.QuranTajwid.RULES.length} rules.`
        : `All ${window.QuranTajwid.RULES.length} rules below use their official colours, with examples from the live tagged text.`;
      return examples;
    } catch (err) {
      status.textContent =
        "The coloured examples could not be loaded. The rule names and official colours are still shown below.";
      return {};
    }
  }

  async function init() {
    document.documentElement.dataset.tajwid = "on";
    if (window.QuranFont && window.Store) {
      window.QuranFont.apply(Store.getPreferences().arabicFontStyle);
    }
    const grid = document.getElementById("tajweed-grid");
    if (!grid || !window.QuranTajwid) return;
    grid.innerHTML = window.QuranTajwid.RULES.map((rule) =>
      cardHTML(rule, null)
    ).join("");
    const examples = await loadExamples();
    grid.innerHTML = window.QuranTajwid.RULES.map((rule) =>
      cardHTML(rule, examples[rule.code])
    ).join("");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
