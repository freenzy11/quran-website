/* ============================================================
   khatm-panel.js — Khatm controls in Settings.

   A khatm is started, paused and stopped from one section of the
   Settings page. Start takes an optional target number of days
   (1–3,650) or no time limit. Pause disables marking but keeps
   every mark; stop ends the session without deleting its data.
   Progress is counted in mushaf pages by "Mark page as read" in
   Read mode, and that button appears only while a khatm is active.
   ============================================================ */

(function () {
  "use strict";

  const container = document.getElementById("khatm-settings");
  let msgTimer = null;

  function showMessage(text) {
    if (!container) return;
    const msg = container.querySelector(".settings-msg");
    if (!msg) return;
    msg.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msg.textContent = ""; }, 8000);
  }

  function render() {
    if (!container) return;
    const session = Store.getActiveKhatm();
    container.innerHTML = session ? activeHTML(session) : startHTML();
  }

  function startHTML() {
    return `
      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-label">Khatm</span>
          <p class="setting-hint">Track all ${Store.TOTAL_PAGES} mushaf pages. “Mark page as read” will appear under the mushaf while a khatm is active.</p>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <label class="khatm-field" for="khatm-days">Target days (optional)</label>
          <p class="setting-hint">Leave empty for no time limit.</p>
        </div>
        <input type="number" id="khatm-days" class="khatm-input" min="1" max="3650"
               placeholder="No time limit" inputmode="numeric">
      </div>
      <div class="setting-row">
        <div class="setting-copy">
          <button type="button" class="settings-btn settings-btn-primary" id="khatm-start">Start khatm</button>
        </div>
      </div>
      <p class="settings-msg" role="status" aria-live="polite"></p>`;
  }

  function activeHTML(session) {
    const read = Store.khatmPagesRead(session);
    const total = Store.TOTAL_PAGES;
    const percent = Math.round((read / total) * 1000) / 10;
    const paused = Boolean(session.pausedAt);
    const completed = Boolean(session.completedAt);

    const stateLine = completed
      ? "Complete — mabruk"
      : paused
        ? "Paused — page marks are disabled until you resume"
        : session.targetDays
          ? `Target: ${session.targetDays} days`
          : "No time limit";

    return `
      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-label">Khatm in progress</span>
          <span class="khatm-stat">${percent.toLocaleString("en-US")}%</span>
          <p class="khatm-note">${read.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} pages marked read</p>
          <span class="khatm-state">${stateLine}</span>
        </div>
      </div>
      ${completed ? "" : `
      <div class="setting-row">
        <div class="setting-copy">
          <span class="setting-label">Tracking</span>
          <p class="setting-hint">Your marks are kept in every state.</p>
        </div>
        <div class="khatm-actions">
          <button type="button" class="settings-btn" id="khatm-pause">${paused ? "Resume" : "Pause"}</button>
          <button type="button" class="settings-btn settings-btn-danger" id="khatm-stop">Stop</button>
        </div>
      </div>`}
      <div class="setting-row">
        <div class="setting-copy">
          <a class="section-link" href="statistics.html#khatm">Open Statistics</a>
        </div>
      </div>
      <p class="settings-msg" role="status" aria-live="polite"></p>`;
  }

  function startSession() {
    const input = container.querySelector("#khatm-days");
    let targetDays = null;

    if (input && String(input.value).trim() !== "") {
      const days = Math.floor(Number(input.value));
      if (!Number.isFinite(days) || days < 1 || days > 3650) {
        showMessage("Target days must be between 1 and 3,650 — or leave it empty for no time limit.");
        return;
      }
      targetDays = days;
    }

    Store.startKhatm({ targetDays });
    render();
    showMessage(
      `Khatm started${targetDays ? ` — target: ${targetDays} days` : " — no time limit"}. ` +
      "Press “Mark page as read” in Read mode as you go."
    );
    notify();
  }

  function togglePause() {
    const session = Store.getActiveKhatm();
    if (!session) return;
    if (session.pausedAt) {
      Store.resumeKhatm();
      showMessage("Tracking resumed — page marks count again. All progress was kept while paused.");
    } else {
      Store.pauseKhatm();
      showMessage("Tracking paused. Your progress is kept; marks are disabled until you resume.");
    }
    render();
    notify();
  }

  function stopSession() {
    const session = Store.getActiveKhatm();
    if (!session) return;
    const read = Store.khatmPagesRead(session);
    if (!window.confirm(
      `Stop this khatm? Its ${read} marked page${read === 1 ? "" : "s"} will be kept on record, ` +
      "but you would need to start a new khatm to continue tracking."
    )) return;

    Store.stopKhatm();
    render();
    showMessage("Khatm stopped. Its progress stays on record in Statistics — nothing was deleted.");
    notify();
  }

  function notify() {
    document.dispatchEvent(new CustomEvent("khatm-changed"));
  }

  function bindEvents() {
    if (!container) return;
    container.addEventListener("click", (event) => {
      if (event.target.closest("#khatm-start")) { startSession(); return; }
      if (event.target.closest("#khatm-pause")) { togglePause(); return; }
      if (event.target.closest("#khatm-stop")) { stopSession(); return; }
    });
    container.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target && event.target.id === "khatm-days") {
        event.preventDefault();
        startSession();
      }
    });
    document.addEventListener("khatm-page-marked", () => {
      if (Store.getActiveKhatm()) render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    render();
    if (window.location.hash === "#khatm") {
      const section = document.getElementById("khatm");
      if (section) section.scrollIntoView({ block: "start" });
    }
  });
})();
