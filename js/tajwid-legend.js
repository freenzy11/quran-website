// ============================================================
// Tajweed Legend System — works with existing tajwid.js markup
// Format: <span class="tj tj-rule-code">text</span>
// Listens for data-tajwid attribute set by existing settings toggle
// ============================================================

(function () {
  "use strict";

  // ── Tajweed rule definitions matching tajwid.js + CSS variables
  // These MUST match the CSS variable names in style.css
  // and the rule codes from tajwid.js RULES array.
  const RULES = {
    // code: { name, color, cssClass }
    "hamza-wasl": { name: "Hamzat al-wasl", color: "#AAAAAA", css: "tj-hamza-wasl" },
    silent:   { name: "Silent letter", color: "#AAAAAA", css: "tj-silent" },
    "laam-shamsiyah": { name: "Lam Shamsiyah", color: "#AAAAAA", css: "tj-lam-shamsiyyah" },
    "madda-normal": { name: "Normal Madd", color: "#537FFF", css: "tj-madda-normal" },
    "madda-permissible": { name: "Permissible Madd", color: "#4050FF", css: "tj-madda-permissible" },
    "madda-necessary": { name: "Necessary Madd", color: "#000EBC", css: "tj-madda-necessary" },
    "madda-obligatory": { name: "Obligatory Madd", color: "#2144C1", css: "tj-madda-obligatory" },
    qalaqah: { name: "Qalqalah", color: "#DD0008", css: "tj-qalaqah" },
    "ikhafa-shafawi": { name: "Ikhfa Shafawi", color: "#D500B7", css: "tj-ikhafa-shafawi" },
    ikhafa: { name: "Ikhfa", color: "#9400A8", css: "tj-ikhafa" },
    iqlab: { name: "Iqlab", color: "#26BFFD", css: "tj-iqlab" },
    "idgham-shafawi": { name: "Idgham Shafawi", color: "#58B800", css: "tj-idgham-shafawi" },
    "idgham-with-ghunnah": { name: "Idgham with Ghunnah", color: "#169777", css: "tj-idgham-with-ghunnah" },
    "idgham-without-ghunnah": { name: "Idgham without Ghunnah", color: "#169200", css: "tj-idgham-without-ghunnah" },
    "idgham-mutajanisayn": { name: "Idgham Mutajanisayn", color: "#A1A1A1", css: "tj-idgham-mutajanisayn" },
    "idgham-mutaqaribayn": { name: "Idgham Mutaqaribayn", color: "#A1A1A1", css: "tj-idgham-mutaqaribayn" },
    ghunnah: { name: "Ghunnah", color: "#FF7E1E", css: "tj-ghunnah" },
    tafkhim: { name: "Tafkhim (heavy letter)", color: "#A0522D", css: "tj-tafkhim" }
  };

  // ── State ───────────────────────────────────────────────────
  let loggedNoColor = [];

  // ── Initialise: called on page load ─────────────────────────
  function init() {
    loggedNoColor = [];
    buildLegend();
    applyTajweedColors();
    setupTajwidObserver();
  }

  // ── Build the legend HTML ─────────────────────────────────────
  function buildLegend() {
    const container = document.getElementById("tajweed-legend-container");
    if (!container) return;

    // Colours must match the CSS variable values in style.css
    const legendColors = {
      "hamza-wasl": "#AAAAAA", silent: "#AAAAAA", "laam-shamsiyah": "#AAAAAA",
      "madda-normal": "#537FFF", "madda-permissible": "#4050FF",
      "madda-necessary": "#000EBC", "madda-obligatory": "#2144C1", qalaqah: "#DD0008",
      "ikhafa-shafawi": "#D500B7", ikhafa: "#9400A8", iqlab: "#26BFFD",
      "idgham-shafawi": "#58B800", "idgham-with-ghunnah": "#169777",
      "idgham-without-ghunnah": "#169200",
      "idgham-mutajanisayn": "#A1A1A1", "idgham-mutaqaribayn": "#A1A1A1",
      ghunnah: "#FF7E1E", tafkhim: "#A0522D"
    };

    let html = `<div id="tajweed-legend" style="margin: 16px 0; max-width: 320px; font-family: system-ui, sans-serif;">`;
    html += `<div style="font-size: 12px; text-transform: uppercase; color: #6B6B6B; margin-bottom: 8px;">Tajweed Rules</div>`;
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 4px;">`;

    Object.entries(RULES).forEach(([code, rule]) => {
      const color = legendColors[code] || "#CCCCCC";
      html += `<div style="display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 4px; font-size: 11px;">`;
      html += `<span style="width: 16px; height: 16px; background: ${color}; border: 1px solid #6B6B6B;"></span>`;
      html += `<span>${rule.name}</span>`;
      html += `</div>`;
    });

    html += `</div>`;
    if (loggedNoColor.length > 0) {
      html += `<div style="margin-top: 12px; font-size: 11px; color: #666;"><strong>No colour assigned:</strong> ${loggedNoColor.join(", ")}</div>`;
    }
    html += `<div style="margin-top: 12px; padding: 8px; background: #f8f8f8; border-radius: 6px; font-size: 11px; color: #444;"><strong>Tajweed ON:</strong> Rules above become coloured when enabled</div>`;
    html += `</div>`;

    container.innerHTML = html;
  }

  // ── Apply Tajweed colours to the page text ────────────────────
  function applyTajweedColors() {
    // Read the current Tajwid state from the html element
    const html = document.documentElement;
    const isTajweedOn = html.getAttribute("data-tajwid") === "on";

    const legend = document.getElementById("tajweed-legend");
    if (legend) legend.style.display = isTajweedOn ? "block" : "none";
    if (!isTajweedOn) {
      removeTajweedColors();
      return;
    }

    // ── Strategy: Find <span class="tj tj-rule-code"> elements ────
    // The existing tajwid.js generates spans like:
    // <span class="tj tj-hamza-wasl">ٱ</span>
    // <span class="tj tj-madda-normal">م</span>
    // We find all such elements and apply colours based on their rule class.

    // First, remove any previously applied colours
    removeTajweedColors();

    // Find all elements with class "tj" (the Tajweed span class)
    const tjElements = document.querySelectorAll(".tj");
    const elementsToColor = new Set();

    // Helper: get the rule key from a Tajweed element
    function getRuleKey(el) {
      // First try dataset.rule
      if (el.dataset && el.dataset.rule) {
        return el.dataset.rule.replace("tj-", "");
      }
      // Fall back to finding the class starting with "tj-" that is not "tj"
      const classList = el.classList;
      for (let i = 0; i < classList.length; i++) {
        const className = classList[i];
        if (className.startsWith("tj-") && className !== "tj") {
          return className.replace("tj-", "");
        }
      }
      return null;
    }

    tjElements.forEach(el => {
      const ruleKey = getRuleKey(el);
      if (ruleKey && RULES[ruleKey]) {
        elementsToColor.add(el);
      } else if (ruleKey) {
        loggedNoColor.push(ruleKey);
      }
    });

    // Apply colours to matching elements
    elementsToColor.forEach(el => {
      const ruleKey = getRuleKey(el);

      if (RULES[ruleKey]) {
        el.style.color = RULES[ruleKey].color;
        // Apply font-weight: 700 for bold Tajweed text
        if (window.getComputedStyle(el).fontWeight !== "700") {
          el.style.fontWeight = "700";
        }
      }
    });

    //
  }

  // ── Remove previously applied Tajweed colours ─────────────────
  function removeTajweedColors() {
    const tjElements = document.querySelectorAll(".tj");
    for (let i = 0; i < tjElements.length; i++) {
      const el = tjElements[i];
      const classList = el.classList;
      if (classList.length >= 2) {
        const ruleCode = classList[1];
        const ruleKey = ruleCode.replace("tj-", "");
        if (RULES[ruleKey]) {
          // Reset this element's inline styles
          el.style.color = "";
          el.style.fontWeight = "";
        }
      }
    }
  }

  // ── Set up MutationObserver for data-tajwid changes ───────────────
  function setupTajwidObserver() {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      applyTajweedColors();
    });

    observer.observe(html, {
      attributes: true,
      attributeFilter: ["data-tajwid"]
    });

    // Also call once on init to set initial state
    applyTajweedColors();
  }

  // ── Public API ────────────────────────────────────────────────
  window.TajweedLegend = {
    init,
    applyTajweedColors,
    RULES
  };

  // ── DOMContentLoaded: bootstrap the system ────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    // Ensure legend container exists
    if (!document.getElementById("tajweed-legend-container")) {
      const div = document.createElement("div");
      div.id = "tajweed-legend-container";
      div.style.cssText = "position: relative; z-index: 1000; margin: 16px 0;";
      document.body.appendChild(div);
    }

    // Initialise the Tajweed legend system
    TajweedLegend.init();
  });

})();