/* ============================================================
   timings.js — word-by-word recitation highlighting.

   Timing data: cpfair/quran-align, release 2016-11-24 (CC BY 4.0).
   It stores, per ayah, [first word, word after last, start ms, end ms]
   ranges inside the same verse-by-verse MP3s the reader plays.

   Quran Foundation Uthmani text tokenises the same way once Quranic
   pause marks (U+06D6–U+06ED) are left out of the count, so data-w
   indexes line up with the alignment's word indexes.
   ============================================================ */
window.QuranTimings = (() => {
  "use strict";

  const BASE = "../data/timings";
  const RECITERS = {
    "ar.alafasy": "alafasy",
    "ar.husary": "husary",
    "ar.minshawi": "minshawi"
    /* ar.hudhaify has no published alignment in this dataset. */
  };
  const WAQF = /^[\u06D6-\u06ED]+$/;

  const cache = new Map();
  let token = 0;
  let frame = 0;
  let current = null;

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* V4 paints Tajweed colours into the glyphs. When the reader's
     Tajwid switch is off, V2 draws the same code_v2 shapes in plain
     ink; no Unicode fallback or data-w index has to change. */
  function fontVersion() {
    try {
      const prefs = window.Store ? Store.getPreferences() : null;
      return prefs && prefs.showTajwid === false ? "v2" : "v4";
    } catch (err) {
      return "v4";
    }
  }

  /* Wrap each countable word in a span. QCF V4 callers pass the word
     objects returned by quran-api.js: each word already has its page
     glyph (code_v2), a Unicode fallback, and its Mushaf page. Pause and
     ayah-end tokens stay visible but get no data-w index. */
  function wordsHTML(text, options = {}) {
    if (Array.isArray(options.glyphWords) && options.glyphWords.length) {
      return glyphWordsHTML(options.glyphWords);
    }
    if (options.tajwid && window.QuranTajwid &&
        window.QuranTajwid.markupWithWords) {
      return window.QuranTajwid.markupWithWords(
        options.tajweedUnits || text
      );
    }
    let index = 0;
    return String(text == null ? "" : text).split(/(\s+)/).map((part) => {
      if (!part) return "";
      if (/^\s+$/.test(part)) return part;
      if (WAQF.test(part)) return escapeHTML(part);
      return `<span class="w" data-w="${index++}" lang="ar" dir="rtl" translate="no">${escapeHTML(part)}</span>`;
    }).join("");
  }

  function glyphWordsHTML(words) {
    let wordIndex = 0;
    const version = fontVersion();
    return words.map((word) => {
      const entry = word || {};
      const glyph = String(entry.glyph || "");
      const fallback = String(entry.fallback || "");
      const page = Math.min(604, Math.max(1, Number(entry.page) || 1));
      const name = window.QuranQcfFont
        ? window.QuranQcfFont.family(page, version) : "";
      const ready = Boolean(name) && Boolean(glyph) &&
        window.QuranQcfFont.isReady(page, version);
      const text = ready ? glyph : fallback;
      const data = `data-qcf-page="${page}" data-qcf-glyph="${escapeHTML(glyph)}" data-qcf-family="${escapeHTML(name)}" data-qcf-version="${version}"`;

      if (entry.type && entry.type !== "word") {
        return `<span class="qcf-end" lang="ar" dir="rtl" translate="no" ${data}>${escapeHTML(text)}</span>`;
      }

      const index = wordIndex++;
      const className = ready
        ? "w qcf-word qcf-glyph" : "w qcf-word qcf-fallback";
      const style = ready
        ? ` style="font-family:'${name}',var(--font-arabic),serif"` : "";
      return `<span class="${className}" data-w="${index}" lang="ar" dir="rtl" translate="no" ${data}${style}>${escapeHTML(text)}</span>`;
    }).join(" ");
  }

  /* Fonts load after the first paint. Swap each word in place so event
     handlers, .w data-w indexes and word-by-word columns are unchanged. */
  function applyQcfFonts(root) {
    if (!root || !window.QuranQcfFont) return Promise.resolve();
    const nodes = Array.from(root.querySelectorAll("[data-qcf-page][data-qcf-glyph]"));
    if (!nodes.length) return Promise.resolve();

    const version = fontVersion();
    const pages = nodes.map((el) => Number(el.dataset.qcfPage));
    return window.QuranQcfFont.loadPages(pages, version).then((families) => {
      nodes.forEach((el) => {
        const family = families.get(Number(el.dataset.qcfPage));
        if (!family || !el.dataset.qcfGlyph) return;
        el.textContent = el.dataset.qcfGlyph;
        el.style.fontFamily = `"${family}", var(--font-arabic), serif`;
        el.dataset.qcfFamily = family;
        el.dataset.qcfVersion = version;
        el.classList.add("qcf-glyph");
        el.classList.remove("qcf-fallback");
      });
    });
  }

  /* Render the official word-by-word meanings as a second, aligned
     line. These spans are display-only: word-tap audio is bound to
     `.ayah-arabic .w`, so meanings never trigger a bookmark. */
  function meaningsHTML(meanings) {
    if (!Array.isArray(meanings)) return "";
    return meanings.reduce((html, meaning, index) => {
      if (!String(meaning == null ? "" : meaning).trim()) return html;
      return html + `
      <span class="wbw-word" data-w="${index}"><span lang="en" dir="ltr">${escapeHTML(meaning)}</span></span>`;
    }, "");
  }

  /* Memorize mode: stack each meaning directly under its Arabic word.
     The base markup still comes from wordsHTML(), so QCF glyph words and
     .w data-w indexes (word audio + timing highlight) are untouched. */
  function stackedWordsHTML(text, meanings, options = {}) {
    const base = wordsHTML(text, options);
    const list = Array.isArray(meanings) ? meanings : [];
    const template = document.createElement("template");
    template.innerHTML = base;

    let html = "";
    for (const node of Array.from(template.content.childNodes)) {
      if (node.nodeType === 1 && node.nodeName === "SPAN" &&
          node.classList.contains("w") && node.hasAttribute("data-w")) {
        const index = Number(node.getAttribute("data-w"));
        const meaning = list[index];
        const label = meaning && String(meaning).trim()
          ? `<span class="wbw-meaning" lang="en" dir="ltr">${escapeHTML(meaning)}</span>`
          : "";
        html += `<span class="wbw-column" data-w="${index}" lang="ar" dir="rtl" translate="no">${node.outerHTML}${label}</span>`;
        continue;
      }
      if (node.nodeType === 1) {
        html += node.outerHTML;
        continue;
      }
      const value = node.nodeValue || "";
      if (value.trim()) {
        html += escapeHTML(value);
      } else if (/\s/.test(value)) {
        /* Kept for the toggle-off inline layout; hidden in flex mode. */
        html += `<span class="wbw-space">${escapeHTML(value)}</span>`;
      }
    }
    return html;
  }

  function supported(reciterId) {
    return Boolean(RECITERS[reciterId]);
  }

  function loadSurah(surah, reciterId) {
    const slug = RECITERS[reciterId];
    if (!slug) return Promise.resolve(null);
    const key = `${slug}:${surah}`;
    if (cache.has(key)) return cache.get(key);
    const promise = fetch(`${BASE}/${slug}/${surah}.json`)
      .then((res) => res.ok ? res.json() : null)
      .catch(() => null);
    cache.set(key, promise);
    return promise;
  }

  function clearActive(root) {
    if (root) {
      root.querySelectorAll(".w.is-active").forEach((el) => {
        el.classList.remove("is-active");
      });
    }
  }

  function setActive(root, from, to) {
    root.querySelectorAll(".w[data-w]").forEach((el) => {
      const i = Number(el.dataset.w);
      el.classList.toggle("is-active", i >= from && i < to);
    });
  }

  function tick() {
    frame = 0;
    if (!current) return;
    const { audio, root, segments, scale } = current;
    const ms = audio.currentTime * 1000 / scale;

    let hit = null;
    for (const seg of segments) {
      if (ms >= seg.start && ms < seg.end) hit = seg;
      if (seg.start > ms) break;
    }
    if (hit) setActive(root, hit.w0, hit.w1);
    else clearActive(root);

    frame = requestAnimationFrame(tick);
  }

  /* Start tracking one ayah. Replaces any previous tracking. */
  function play({ audio, root, surah, ayah, reciterId }) {
    stop();
    const mine = token;
    if (!audio || !root || !supported(reciterId)) return;

    loadSurah(surah, reciterId).then((data) => {
      if (mine !== token || !data) return;
      const raw = data[String(ayah)];
      if (!raw || !raw.length) return;

      const segments = [];
      for (let i = 0; i + 3 < raw.length; i += 4) {
        segments.push({
          w0: raw[i], w1: raw[i + 1],
          start: raw[i + 2], end: raw[i + 3]
        });
      }
      if (!segments.length) return;

      /* The CDN file can be a different encode/length than the one
         that was aligned. Stretch the timeline to the real duration. */
      const last = segments[segments.length - 1].end;
      const applyScale = () => {
        if (!current || current.audio !== audio || !last) return;
        const ratio = (audio.duration * 1000) / last;
        current.scale = ratio > 0.6 && ratio < 1.6 ? ratio : 1;
      };

      current = { audio, root, segments, scale: 1 };
      if (root.classList.contains("ayah")) root.classList.add("is-word-highlighting");
      if (audio.readyState >= 1) applyScale();
      else audio.addEventListener("loadedmetadata", applyScale, { once: true });
      if (!frame) frame = requestAnimationFrame(tick);
    });
  }

  function stop() {
    token += 1;
    if (current) {
      clearActive(current.root);
      current.root.classList.remove("is-word-highlighting");
    }
    current = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  return {
    wordsHTML, meaningsHTML, stackedWordsHTML, applyQcfFonts,
    supported, play, stop
  };
})();
