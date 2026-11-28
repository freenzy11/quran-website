/* ============================================================
   account.js — sign-in page interactions.

   The Al-Furqon account flow is not connected to a backend yet.
   These handlers keep the design interactive without pretending
   to create a session or send an email.
   ============================================================ */

(function () {
  "use strict";

  const form = document.getElementById("login-form");
  const status = document.getElementById("login-status");
  const email = document.getElementById("login-email");
  const google = document.getElementById("login-google");

  function showStatus(message) {
    if (!status) return;
    status.textContent = message;
    status.hidden = false;
  }

  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (email && !email.checkValidity()) {
        email.reportValidity();
        return;
      }
      showStatus("Sign-in is coming soon. Your email has not been sent.");
    });
  }

  if (google) {
    google.addEventListener("click", () => {
      showStatus("Google sign-in is coming soon. No account was created.");
    });
  }
})();
