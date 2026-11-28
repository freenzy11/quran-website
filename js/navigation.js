/* ============================================================
   navigation.js — shared navigation behaviour.
   Active-link state, mobile menu, footer year.
   ============================================================ */

(function () {
  "use strict";

  /* Mark the link matching <body data-page="..."> as current. */
  function setActiveLink() {
    const page = document.body.dataset.page;
    document.querySelectorAll(".nav-menu a[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function initMobileMenu() {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.getElementById("nav-menu");
    if (!toggle || !menu) return;

    const close = () => {
      toggle.setAttribute("aria-expanded", "false");
      menu.classList.remove("open");
    };

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      menu.classList.toggle("open", !isOpen);
    });

    /* Close after choosing a link */
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });

    /* Close on Escape or on outside click */
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    document.addEventListener("click", (event) => {
      if (!toggle.contains(event.target) && !menu.contains(event.target)) close();
    });
  }

  function initFooterYear() {
    const el = document.getElementById("footer-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  /* Shared three-line header menu. Settings opens the dedicated
     settings page; the reader toolbar gear opens the quick drawer. */
  function initHeaderMenu() {
    const toggle = document.getElementById("site-menu-toggle");
    const menu = document.getElementById("site-menu");
    if (!toggle || !menu) return;

    const close = () => {
      menu.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        close();
      } else {
        menu.hidden = false;
        toggle.setAttribute("aria-expanded", "true");
      }
    });

    menu.addEventListener("click", (event) => {
      const settings = event.target.closest("[data-menu-settings]");
      if (settings) {
        event.preventDefault();
        close();
        window.location.assign(settings.dataset.settingsHref || "settings.html");
        return;
      }
      if (event.target.closest("a")) close();
    });

    document.addEventListener("click", (event) => {
      if (menu.hidden || event.target.closest(".site-menu-wrap")) return;
      close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || menu.hidden) return;
      close();
      toggle.focus();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setActiveLink();
    initMobileMenu();
    initHeaderMenu();
    initFooterYear();
  });
})();
