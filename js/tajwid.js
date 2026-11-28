/* ============================================================
   tajwid.js — official Tajweed-tagged text renderer.

   Source: Quran Foundation Content APIs v4 field
   `text_uthmani_tajweed`, e.g.
   ا<tajweed class=madda_necessary>لٓ</tajweed> <span class=end>١</span>
   The legacy compact notation ([h:1[ٱ], [l[ل], ...) is still
   accepted so cached/previous callers keep working.

   Rule names and colours come from the same published Tajweed
   table, and are mapped to QF class names below. The
   only inferred rule is automatic Tafkhim: untagged heavy letters
   (خ ص ض ط ظ غ ق) and their following diacritics are coloured.
    Explicit QF tags always win and are never overwritten. Markup
   is always created; the showTajwid preference only switches the
   colours on or off, so toggling is instant. No raw markup is
   ever inserted into the DOM — everything is escaped text.
   ============================================================ */

(function () {
  "use strict";

  /* The complete set published by the API. The `madda-necessary`
     tag is present in the API data and in the official guide, but
     was omitted from the old PHP table; its identity and colour are
     taken from the current guide and the maintained JS parser. */
  const RULES = [
    {
      code: "h", id: "hamza-wasl", css: "tj-hamza-wasl", color: "#AAAAAA",
      arabic: "همزة الوصل", english: "Hamzat ul Wasl",
      explanation: "The connecting hamza at the start of a word.",
      pronunciation: "Pronounced when you begin speech with it; dropped when the previous word is joined."
    },
    {
      code: "s", id: "silent", css: "tj-silent", color: "#AAAAAA",
      arabic: "حرف ساكن", english: "Silent Letter",
      explanation: "A letter carrying sukūn and no vowel.",
      pronunciation: "The letter is not pronounced; the tongue only forms its position."
    },
    {
      code: "l", id: "laam-shamsiyah", css: "tj-lam-shamsiyyah", color: "#AAAAAA",
      arabic: "لام شمسية", english: "Lam Shamsiyyah",
      explanation: "The lām of alif-lām before a solar letter.",
      pronunciation: "The lām is not pronounced; it merges into the following letter, which carries shadda."
    },
    {
      code: "n", id: "madda-normal", css: "tj-madda-normal", color: "#537FFF",
      arabic: "مد عادي", english: "Normal Madd",
      explanation: "The standard natural prolongation.",
      pronunciation: "Stretch the vowel for two vowel counts."
    },
    {
      code: "p", id: "madda-permissible", css: "tj-madda-permissible", color: "#4050FF",
      arabic: "مد جائز", english: "Permissible Madd",
      explanation: "A prolongation whose length depends on whether you pause.",
      pronunciation: "Two counts when continuing; four or six when pausing, according to the recitation."
    },
    {
      code: "m", id: "madda-necessary", css: "tj-madda-necessary", color: "#000EBC",
      arabic: "مد واجب", english: "Necessary Madd",
      explanation: "A required prolongation marked by an alif with a madd sign.",
      pronunciation: "Always stretch for six vowel counts, whether continuing or pausing."
    },
    {
      code: "q", id: "qalaqah", css: "tj-qalaqah", color: "#DD0008",
      arabic: "قلقلة", english: "Qalqalah",
      explanation: "An echo on ق، ب، ج، د، ط when they carry sukūn.",
      pronunciation: "Release the letter with a small bouncing echo: قـ، بـ، جـ، دـ، طـ."
    },
    {
      code: "o", id: "madda-obligatory", css: "tj-madda-obligatory", color: "#2144C1",
      arabic: "مد لازم", english: "Obligatory Madd",
      explanation: "A mandatory prolongation, normally followed by a sukūn or shadda.",
      pronunciation: "Stretch for four or five vowel counts; it may not be shortened."
    },
    {
      code: "c", id: "ikhafa-shafawi", css: "tj-ikhafa-shafawi", color: "#D500B7",
      arabic: "إخفاء شفوي", english: "Ikhafa Shafawi",
      explanation: "A mīm with sukūn or tanwīn followed by bāʾ.",
      pronunciation: "Hide the mīm with a light nasal resonance, without closing the lips fully."
    },
    {
      code: "f", id: "ikhafa", css: "tj-ikhafa", color: "#9400A8",
      arabic: "إخفاء", english: "Ikhafa",
      explanation: "A nūn with sukūn or tanwīn before one of fifteen letters.",
      pronunciation: "Hide the nūn with ghunnah, holding the nasal sound for two counts."
    },
    {
      code: "w", id: "idgham-shafawi", css: "tj-idgham-shafawi", color: "#58B800",
      arabic: "إدغام شفوي", english: "Idgham Shafawi",
      explanation: "A mīm with sukūn or tanwīn followed by another mīm.",
      pronunciation: "Merge the two mīms into one, held with ghunnah."
    },
    {
      code: "i", id: "iqlab", css: "tj-iqlab", color: "#26BFFD",
      arabic: "إقلاب", english: "Iqlab",
      explanation: "A nūn with sukūn or tanwīn followed by bāʾ.",
      pronunciation: "Change the nūn sound into a mīm with ghunnah before the bāʾ."
    },
    {
      code: "a", id: "idgham-with-ghunnah", css: "tj-idgham-with-ghunnah", color: "#169777",
      arabic: "إدغام بغنة", english: "Idgham with Ghunnah",
      explanation: "A nūn with sukūn or tanwīn merging into ي، ن، م، و.",
      pronunciation: "Merge the nūn into the next letter while keeping a two-count nasal resonance."
    },
    {
      code: "u", id: "idgham-without-ghunnah", css: "tj-idgham-without-ghunnah", color: "#169200",
      arabic: "إدغام بلا غنة", english: "Idgham without Ghunnah",
      explanation: "A nūn with sukūn or tanwīn merging into ل or ر.",
      pronunciation: "Merge the nūn completely into the next letter, with no nasal resonance."
    },
    {
      code: "d", id: "idgham-mutajanisayn", css: "tj-idgham-mutajanisayn", color: "#A1A1A1",
      arabic: "إدغام متجانسين", english: "Idgham Mutajanisayn",
      explanation: "Two letters with the same articulation point merging.",
      pronunciation: "Pronounce them as one doubled letter, without ghunnah."
    },
    {
      code: "b", id: "idgham-mutaqaribayn", css: "tj-idgham-mutaqaribayn", color: "#A1A1A1",
      arabic: "إدغام متقاربين", english: "Idgham Mutaqaribayn",
      explanation: "Two letters with nearby articulation points merging.",
      pronunciation: "Pronounce them as one merged sound, without ghunnah."
    },
    {
      code: "g", id: "ghunnah", css: "tj-ghunnah", color: "#FF7E1E",
      arabic: "غنة", english: "Ghunnah",
      explanation: "Nasal resonance on a doubled nūn or mīm.",
      pronunciation: "Hold the sound in the nose for two vowel counts."
    },
    {
      code: "t", id: "tafkhim", css: "tj-tafkhim", color: "#A0522D",
      arabic: "تفخيم", english: "Tafkhim (Heavy Letter)",
      explanation: "The seven heavy letters خ، ص، ض، ط، ظ، غ، ق are pronounced with a full, broad sound.",
      pronunciation: "Raise the back of the tongue slightly and let the sound fill the mouth."
    }
  ];

  const BY_CODE = new Map(RULES.map((rule) => [rule.code, rule]));
  const TAFKHIM_RULE = BY_CODE.get("t");

  /* Quran Foundation uses descriptive class names instead of the
     legacy one-letter codes. Several madda variants share the same
     existing colour class. Unknown QF classes intentionally fall
     through to the visible fallback colour. */
  const QF_CLASS_TO_CODE = {
    ham_wasl: "h",
    slnt: "s",
    laam_shamsiyah: "l",
    madda_normal: "n",
    madda_permissible: "p",
    madda_necessary: "m",
    madda_obligatory: "o",
    madda_obligatory_mottasel: "o",
    madda_obligatory_monfasel: "o",
    qalaqah: "q",
    ikhafa_shafawi: "c",
    ikhafa: "f",
    iqlab: "i",
    idgham_shafawi: "w",
    idgham_ghunnah: "a",
    idgham_wo_ghunnah: "u",
    idgham_mutajanisayn: "d",
    idgham_mutaqaribayn: "b",
    ghunnah: "g"
  };

  /* Any code not yet in RULES still renders as text, but gets a
     visible fallback colour and a one-time warning instead of being
     silently dropped. This keeps new Quran Foundation classes easy to spot. */
  const FALLBACK_RULE = {
    code: "?", id: "unknown", css: "tj-unknown", color: "#6B6B6B"
  };
  const unknownRules = new Map();
  const warnedCodes = new Set();

  function warnUnknownRule(code) {
    const key = String(code == null ? "" : code).trim() || "(empty)";
    if (warnedCodes.has(key)) return;
    warnedCodes.add(key);
    console.warn(
      `[QuranTajwid] Unrecognized Tajweed rule tag "${key}" from Quran Foundation. ` +
      "Rendering with the fallback colour; add it to RULES and style.css.",
      { code: key, knownCodes: RULES.map((rule) => rule.code) }
    );
  }

  function ruleForCode(code) {
    const known = BY_CODE.get(code);
    if (known) return known;

    warnUnknownRule(code);
    const slug = String(code == null ? "" : code)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "unknown";
    const id = `unknown-${slug}`;
    if (!unknownRules.has(id)) {
      unknownRules.set(id, {
        ...FALLBACK_RULE,
        code: String(code == null ? "" : code),
        id,
        css: "tj-unknown"
      });
    }
    return unknownRules.get(id);
  }

  const DIACRITIC = /[\u064B-\u065F\u0670\u06D6-\u06ED\u200C\u200D]/;
  const LETTER = /[\u0621-\u064A\u066E-\u06D3\u06FA-\u06FC]/;
  /* حروف الاستعلاء: خ ص ض ط ظ غ ق */
  const TAFKHIM_LETTER = /[\u062E\u0635-\u0638\u063A\u0642]/;
  const BISMILLAH_NAKED = "بسم الله الرحمن الرحيم";

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function decodeEntity(entity) {
    const name = entity.slice(1, -1).toLowerCase();
    if (name === "amp") return "&";
    if (name === "lt") return "<";
    if (name === "gt") return ">";
    if (name === "quot") return '"';
    if (name === "apos") return "'";
    if (name === "nbsp") return "\u00A0";
    if (name[0] === "#") {
      const hex = name[1] === "x" || name[1] === "X";
      const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isInteger(code) && code > 0 && code <= 0x10FFFF) {
        try { return String.fromCodePoint(code); } catch (_) { return ""; }
      }
    }
    return entity;
  }

  /* Automatic Tafkhim is deliberately conservative: it only touches
     units with no explicit rule, and never crosses into a tagged run.
     Following diacritics are included so the letter and its marks stay
     the same colour without changing the visible text. */
  function applyAutomaticTafkhim(units) {
    for (let i = 0; i < units.length; i += 1) {
      const unit = units[i];
      if (unit.rule !== null || !TAFKHIM_LETTER.test(unit.ch)) continue;
      unit.rule = TAFKHIM_RULE;
      for (let j = i + 1; j < units.length; j += 1) {
        const next = units[j];
        if (next.rule !== null || !DIACRITIC.test(next.ch)) break;
        next.rule = TAFKHIM_RULE;
      }
    }
    return units;
  }

  /* Quran Foundation sends real markup. Parse it as data: tags only
     select a rule, and every visible character is escaped later by
     runHTML(). The verse-number `<span class=end>١</span>` is dropped
     because the reader draws that marker itself. */
  function parseQF(text) {
    const chars = Array.from(text);
    const units = [];
    const stack = [];
    let skipDepth = 0;

    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      if (ch === "<") {
        const closeAt = chars.indexOf(">", i + 1);
        if (closeAt >= 0) {
          const tagText = chars.slice(i + 1, closeAt).join("");
          i = closeAt;
          const closing = /^\/\s*([a-z0-9-]+)/i.exec(tagText);
          const opening = /^([a-z0-9-]+)([^/]*)\/?$/i.exec(tagText);

          if (closing) {
            const name = closing[1].toLowerCase();
            if (name === "span" && skipDepth > 0) skipDepth -= 1;
            else if (stack.length) stack.pop();
            continue;
          }
          if (opening) {
            const name = opening[1].toLowerCase();
            const attrs = opening[2] || "";
            const classMatch = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
            const className = classMatch
              ? String(classMatch[1] || classMatch[2] || classMatch[3] || "")
              : "";
            const classes = className.split(/\s+/).filter(Boolean);

            if (name === "span" && classes.includes("end")) {
              skipDepth += 1;
              continue;
            }
            if (tagText.trim().endsWith("/")) continue;
            if (name === "tajweed") {
              const code = QF_CLASS_TO_CODE[className] || className || "unknown";
              stack.push(ruleForCode(code));
            } else {
              stack.push(FALLBACK_RULE);
            }
            continue;
          }
          /* Malformed tag: show it rather than losing text. */
          units.push({ ch: "<", rule: null });
          for (const c of Array.from(tagText)) units.push({ ch: c, rule: null });
          units.push({ ch: ">", rule: null });
          continue;
        }
      }
      if (skipDepth > 0) continue;

      if (ch === "&") {
        const entity = /^&(?:#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(
          chars.slice(i, i + 12).join("")
        );
        if (entity) {
          const decoded = decodeEntity(entity[0]);
          for (const c of Array.from(decoded)) {
            units.push({ ch: c, rule: stack.length ? stack[stack.length - 1] : null });
          }
          i += entity[0].length - 1;
          continue;
        }
      }
      units.push({ ch, rule: stack.length ? stack[stack.length - 1] : null });
    }
    return applyAutomaticTafkhim(units);
  }

  /* Parse tagged text into visible characters, each carrying the
     rule that was explicitly supplied for it. Both QF markup and
     the legacy compact notation are accepted. */
  function parse(text) {
    const raw = String(text == null ? "" : text).replace(/\uFEFF/g, "").trim();
    if (/<\s*(?:tajweed|span|\/)\b/i.test(raw)) return parseQF(raw);

    const chars = Array.from(raw);
    const units = [];
    const stack = [];

    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      if (ch === "[") {
        let header = "";
        while (i + 1 < chars.length && chars[i + 1] !== "[") {
          header += chars[i + 1];
          i += 1;
        }
        if (i + 1 < chars.length && chars[i + 1] === "[") {
          i += 1;
          const code = header.split(":")[0];
          stack.push(ruleForCode(code));
          continue;
        }
        /* Malformed tag: show it rather than losing text. */
        units.push({ ch: "[", rule: null });
        Array.from(header).forEach((c) => units.push({ ch: c, rule: null }));
        continue;
      }
      if (ch === "]") {
        if (stack.length) stack.pop();
        continue;
      }
      const active = stack.length ? stack[stack.length - 1] : null;
      units.push({ ch, rule: active });
    }
    return applyAutomaticTafkhim(units);
  }

  function plainText(units) {
    return (units || []).map((unit) => unit.ch).join("");
  }

  function naked(text) {
    let out = "";
    for (const ch of Array.from(String(text || ""))) {
      if (DIACRITIC.test(ch)) continue;
      out += ch === "\u0671" ? "\u0627" : ch;
    }
    return out;
  }

  /* The same Bismillah handling the Arabic edition uses, applied to
     the tagged edition before it is rendered. */
  function stripBismillah(tagged) {
    const units = Array.isArray(tagged) ? tagged : parse(tagged);
    const raw = plainText(units);
    const chars = Array.from(raw);
    let seen = "";

    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      if (DIACRITIC.test(ch)) continue;
      seen += ch === "\u0671" ? "\u0627" : ch;
      if (seen === BISMILLAH_NAKED) {
        const rest = chars.slice(i + 1)
          .filter((c) => !DIACRITIC.test(c))
          .join("");
        if (rest) {
          /* units and chars stay index-aligned: entities are expanded
             into one unit each during parsing. Slice at the match. */
          return { units: units.slice(i + 1), stripped: true };
        }
        return { units, stripped: false };
      }
      if (!BISMILLAH_NAKED.startsWith(seen)) break;
    }
    return { units, stripped: false };
  }

  function runHTML(units) {
    let html = "";
    let run = "";
    let rule = null;
    const flush = () => {
      if (!run) return;
      html += rule
        ? `<span class="tj ${rule.css}" data-rule="${escapeHTML(rule.id)}" data-code="${escapeHTML(rule.code)}">${escapeHTML(run)}</span>`
        : escapeHTML(run);
      run = "";
    };
    for (const unit of units) {
      if (unit.rule !== rule) {
        flush();
        rule = unit.rule;
      }
      run += unit.ch;
    }
    flush();
    return html;
  }

  function renderUnits(units, withWords) {
    if (!Array.isArray(units)) return "";
    let html = "";
    let wordIndex = 0;
    let i = 0;

    while (i < units.length) {
      const ch = units[i].ch;
      if (/\s/.test(ch)) {
        html += escapeHTML(ch);
        i += 1;
        continue;
      }
      const token = [];
      while (i < units.length && !/\s/.test(units[i].ch)) {
        token.push(units[i]);
        i += 1;
      }
      const inner = runHTML(token);
      const countable = token.some((unit) => LETTER.test(unit.ch));
      if (withWords && countable) {
        html += `<span class="w" data-w="${wordIndex++}">${inner}</span>`;
      } else {
        html += inner;
      }
    }
    return html;
  }

  /* Backwards-compatible call used by timings.js for plain tokens. */
  function markup(text) {
    return renderUnits(parse(text), false);
  }

  /* Full ayah renderer: keeps the same .w data-w indexes as the
     untagged edition so word-tap audio and highlighting still work. */
  function markupWithWords(text) {
    return renderUnits(Array.isArray(text) ? text : parse(text), true);
  }

  function stripBismillahWithWords(text) {
    return stripBismillah(text);
  }

  /* Find the first tagged or auto-detected run for a rule, for the legend. */
  function findExample(units, code) {
    let start = -1;
    for (let i = 0; i < units.length; i += 1) {
      const hit = units[i].rule && units[i].rule.code === code;
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) return { units: units.slice(start, i), rule: BY_CODE.get(code) };
    }
    if (start >= 0) return { units: units.slice(start), rule: BY_CODE.get(code) };
    return null;
  }

  /* Developer check: compare parser codes with the stylesheet and,
     when the legend script is loaded, with the legend definitions. */
  function collectSelectors(cssRules, out) {
    for (const cssRule of Array.from(cssRules || [])) {
      if (cssRule.selectorText) out.add(cssRule.selectorText);
      if (cssRule.cssRules) collectSelectors(cssRule.cssRules, out);
    }
  }

  function audit() {
    const selectors = new Set();
    for (const sheet of Array.from(document.styleSheets || [])) {
      try {
        collectSelectors(sheet.cssRules, selectors);
      } catch (_) {
        /* Ignore cross-origin stylesheets we cannot inspect. */
      }
    }
    const selectorText = Array.from(selectors).join("\n");
    const legendRules = window.TajweedLegend && window.TajweedLegend.RULES;
    const result = {
      codes: RULES.map((rule) => rule.code),
      rules: RULES.map((rule) => ({
        code: rule.code, id: rule.id, css: rule.css, color: rule.color
      })),
      missingCSS: RULES
        .filter((rule) => !selectorText.includes(`.${rule.css}`))
        .map((rule) => rule.css),
      missingLegend: [],
      unknownTags: Array.from(unknownRules.values()).map((rule) => ({
        code: rule.code, id: rule.id
      }))
    };
    if (legendRules) {
      result.missingLegend = RULES
        .filter((rule) => !legendRules[rule.id])
        .map((rule) => rule.id);
    }
    return result;
  }

  function reportAudit() {
    const result = audit();
    if (result.missingCSS.length) {
      console.warn("[QuranTajwid] Missing CSS colour classes:", result.missingCSS);
    }
    if (result.missingLegend.length) {
      console.warn("[QuranTajwid] Rules missing from the legend:", result.missingLegend);
    }
    return result;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", reportAudit, { once: true });
  } else {
    reportAudit();
  }

  window.QuranTajwid = {
    RULES,
    BY_CODE,
    parse,
    plainText,
    stripBismillah,
    stripBismillahWithWords,
    renderUnits,
    markup,
    markupWithWords,
    findExample,
    audit,
    reportAudit,
    unknownRules: () => Array.from(unknownRules.values())
  };
})();
