/* ============================================================
   selects.js — styled dropdowns that match the site design.

   Replaces the browser's plain native dropdown popup with a
   custom listbox (underline skin in the Reader toolbar, box
   skin in forms). The native <select> stays in the DOM as the
   hidden source of truth, so reader.js and memorize.js keep
   reading .value and listening for "change" exactly as before.
   ============================================================ */

(function () {
  "use strict";

  var CHEVRON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" ' +
    'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var CHECK =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function enhance(select) {
    if (select.dataset.selectEnhanced === "1") return;
    select.dataset.selectEnhanced = "1";

    var skin = select.classList.contains("tool-select")
      ? "select--underline"
      : "select--box";

    /* Label text (even visually hidden ones) becomes the aria label */
    var labelText = "";
    var label = document.querySelector('label[for="' + select.id + '"]');
    if (label) labelText = label.textContent.trim();

    var wrapper = document.createElement("div");
    wrapper.className = "select " + skin;

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (labelText) trigger.setAttribute("aria-label", labelText);

    var valueEl = document.createElement("span");
    valueEl.className = "select-value";
    /* Some selects are filters, so the closed trigger keeps a
       generic name ("Qari", "Translation") instead of showing the
       currently selected option. The menu still lists every name. */
    var triggerLabel = select.getAttribute("data-trigger-label") || "";

    var chevron = document.createElement("span");
    chevron.className = "select-chevron";
    chevron.innerHTML = CHEVRON;

    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    var menu = document.createElement("div");
    menu.className = "select-menu";
    menu.setAttribute("role", "listbox");
    if (labelText) menu.setAttribute("aria-label", labelText);

    var parent = select.parentNode;
    parent.insertBefore(wrapper, select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    wrapper.appendChild(select);
    select.classList.add("select-native");
    select.tabIndex = -1;

    var isOpen = false;
    var activeIndex = -1;
    var optionEls = [];

    function optionList() {
      return Array.prototype.slice.call(select.options);
    }

    function renderOptions() {
      menu.innerHTML = "";
      optionEls = [];
      optionList().forEach(function (opt, i) {
        var item = document.createElement("button");
        item.type = "button";
        item.className = "select-option";
        item.setAttribute("role", "option");
        item.dataset.index = String(i);

        var text = document.createElement("span");
        text.className = "select-option-label";
        text.textContent = opt.text;

        var mark = document.createElement("span");
        mark.className = "select-option-check";
        mark.innerHTML = CHECK;

        item.appendChild(text);
        item.appendChild(mark);
        if (opt.disabled) item.classList.add("is-disabled");
        if (i === select.selectedIndex) item.classList.add("is-selected");
        if (i === activeIndex) item.classList.add("is-active");

        menu.appendChild(item);
        optionEls.push(item);
      });
      syncTrigger();
    }

    function syncTrigger() {
      var opt = select.options[select.selectedIndex];
      valueEl.textContent = triggerLabel || (opt ? opt.text : "");
      optionEls.forEach(function (el, i) {
        el.classList.toggle("is-selected", i === select.selectedIndex);
      });
    }

    /* Scroll only the listbox. scrollIntoView() also scrolls the
       document and nudges the page sideways when a toolbar menu
       opens near the right edge. */
    function scrollToOption(i) {
      var el = optionEls[i];
      if (!el) return;
      var top = el.offsetTop;
      var bottom = top + el.offsetHeight;
      if (top < menu.scrollTop) menu.scrollTop = top;
      else if (bottom > menu.scrollTop + menu.clientHeight) {
        menu.scrollTop = bottom - menu.clientHeight;
      }
    }

    function setActive(i, scroll) {
      var n = optionEls.length;
      if (!n) return;
      activeIndex = ((i % n) + n) % n;
      optionEls.forEach(function (el, j) {
        el.classList.toggle("is-active", j === activeIndex);
      });
      if (scroll !== false) scrollToOption(activeIndex);
    }

    function place() {
      var rect = trigger.getBoundingClientRect();
      var menuW = menu.offsetWidth || menu.scrollWidth || 210;
      var menuH = menu.scrollHeight || 320;
      var up = window.innerHeight - rect.bottom < menuH + 16 &&
        rect.top > menuH + 16;
      var right = window.innerWidth - rect.right < menuW + 16 &&
        rect.left > menuW + 16;
      menu.classList.toggle("select-menu--up", up);
      menu.classList.toggle("select-menu--right", right);
    }

    function openMenu() {
      if (isOpen) return;
      isOpen = true;
      activeIndex = select.selectedIndex;
      renderOptions();
      wrapper.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      place();
      scrollToOption(select.selectedIndex);
    }

    function closeMenu(refocus) {
      if (!isOpen) return;
      isOpen = false;
      wrapper.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      if (refocus) trigger.focus();
    }

    function choose(i) {
      var opts = optionList();
      if (!opts[i] || opts[i].disabled) return;
      if (String(select.value) !== String(opts[i].value)) {
        select.value = opts[i].value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncTrigger();
      closeMenu(true);
    }

    /* --- Events -------------------------------------------------- */

    trigger.addEventListener("click", function () {
      if (isOpen) closeMenu(false);
      else openMenu();
    });

    var typeBuffer = "";
    var typeTime = 0;

    trigger.addEventListener("keydown", function (e) {
      if (!isOpen) {
        if (["ArrowDown", "ArrowUp", "Enter", " "].indexOf(e.key) !== -1) {
          e.preventDefault();
          openMenu();
        }
        return;
      }
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive(activeIndex + 1);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActive(activeIndex - 1);
          break;
        case "Home":
          e.preventDefault();
          setActive(0);
          break;
        case "End":
          e.preventDefault();
          setActive(optionEls.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          choose(activeIndex);
          break;
        case "Escape":
          closeMenu(false);
          break;
        case "Tab":
          closeMenu(false);
          break;
        default:
          /* Type-ahead: jump to options starting with typed letters */
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            var now = Date.now();
            if (now - typeTime > 800) typeBuffer = "";
            typeTime = now;
            typeBuffer += e.key.toLowerCase();
            var find = function () {
              return optionList().findIndex(function (o) {
                return !o.disabled &&
                  o.text.toLowerCase().indexOf(typeBuffer) === 0;
              });
            };
            var idx = find();
            if (idx === -1 && typeBuffer.length > 1) {
              typeBuffer = e.key.toLowerCase();
              idx = find();
            }
            if (idx !== -1) setActive(idx);
          }
      }
    });

    menu.addEventListener("click", function (e) {
      var item = e.target.closest(".select-option");
      if (!item) return;
      choose(optionEls.indexOf(item));
    });

    /* Close when clicking outside the dropdown */
    document.addEventListener("click", function (e) {
      if (!isOpen) return;
      if (wrapper.contains(e.target)) return;
      closeMenu(false);
    });

    /* Reposition if the viewport changes while open */
    window.addEventListener("resize", function () {
      if (isOpen) place();
    });

    /* The native select is repopulated by reader.js / memorize.js
       after page load — rebuild the styled menu whenever it changes. */
    new MutationObserver(function () {
      renderOptions();
    }).observe(select, { childList: true });

    renderOptions();
  }

  function init() {
    Array.prototype.forEach.call(
      document.querySelectorAll("select"),
      enhance
    );
  }

  /* Lists rendered after load (e.g. the surah index in the Reader) call
     this to style their newly created selects. Already-enhanced
     selects are skipped. */
  window.QuranSelects = { enhanceAll: init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
