/* ============================================================
   qcf-font.js — per-page QCF glyph fonts.

   QCF V4 is a glyph font: Quran Foundation's code_v2 words are
   private-use characters that only draw correctly with the font for
   that word's Mushaf page. Fonts are requested on demand, added to
   document.fonts once, and cached by page + version.

   V4 COLRv1 carries Tajweed colours. V2 uses the same code_v2 glyph
   shapes without those colours, so the Tajwid on/off control can
   switch families without changing the text or word indexes.
   ============================================================ */

(function () {
  "use strict";

  const BASE = "https://verses.quran.foundation/fonts/quran/hafs";
  const MIN_PAGE = 1;
  const MAX_PAGE = 604;
  const loading = new Map();
  const ready = new Set();

  function pageNumber(value) {
    const page = Number(value);
    if (!Number.isInteger(page)) return MIN_PAGE;
    return Math.min(MAX_PAGE, Math.max(MIN_PAGE, page));
  }

  function versionName(value) {
    return String(value || "v4") === "v2" ? "v2" : "v4";
  }

  function family(page, version) {
    return `p${pageNumber(page)}-${versionName(version)}`;
  }

  function source(page, version) {
    const number = pageNumber(page);
    const versionId = versionName(version);
    if (versionId === "v2") {
      const localName = `QCF2_P${String(number).padStart(3, "0")}`;
      return `local(${localName}), ` +
        `url("${BASE}/v2/woff2/p${number}.woff2") format("woff2"), ` +
        `url("${BASE}/v2/woff/p${number}.woff") format("woff"), ` +
        `url("${BASE}/v2/ttf/p${number}.ttf") format("truetype")`;
    }
    const localName = `QCF4_P${String(number).padStart(3, "0")}`;
    const base = `${BASE}/v4/colrv1`;
    return `local(${localName}), ` +
      `url("${base}/woff2/p${number}.woff2") format("woff2"), ` +
      `url("${base}/woff/p${number}.woff") format("woff"), ` +
      `url("${base}/ttf/p${number}.ttf") format("truetype")`;
  }

  function load(page, version) {
    const number = pageNumber(page);
    const versionId = versionName(version);
    const key = `${versionId}:${number}`;
    if (loading.has(key)) return loading.get(key);

    if (typeof FontFace === "undefined" || !document.fonts) {
      const unsupported = Promise.resolve(null);
      loading.set(key, unsupported);
      return unsupported;
    }

    const name = family(number, versionId);
    const promise = (async () => {
      try {
        const existing = Array.from(document.fonts)
          .find((face) => face.family === name);
        if (existing) {
          if (existing.status !== "loaded") await existing.load();
        } else {
          const face = new FontFace(name, source(number, versionId));
          face.display = "block";
          document.fonts.add(face);
          await face.load();
        }
        ready.add(key);
        return name;
      } catch (err) {
        /* Missing font files must never remove the Arabic text. */
        console.warn(
          `QCF ${versionId} font for page ${number} could not be loaded; using Unicode fallback.`,
          err
        );
        return null;
      }
    })();

    loading.set(key, promise);
    return promise;
  }

  function loadPages(values, version) {
    const versionId = versionName(version);
    const pages = Array.from(new Set(
      (Array.isArray(values) ? values : []).map(pageNumber)
    ));
    return Promise.all(pages.map((page) =>
      load(page, versionId).then((name) => [page, name])
    )).then((entries) => new Map(entries));
  }

  function isReady(page, version) {
    const key = `${versionName(version)}:${pageNumber(page)}`;
    return ready.has(key) && Boolean(document.fonts) &&
      document.fonts.check(`16px "${family(page, version)}"`);
  }

  window.QuranQcfFont = {
    BASE, family, source, load, loadPages, isReady,
    /* Keep the original CDN name available to older callers. */
    CDN: `${BASE}/v4/colrv1`
  };
})();
