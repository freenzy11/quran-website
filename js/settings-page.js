/* ============================================================
   settings-page.js — khatm / goals and saved data on the
   Settings page. Listening and Reading choices now live in the
   Quran page’s More panel. Every storage action uses Store.
   ============================================================ */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  function message(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function bindGoal() {
    const goalSave = $("setting-goal-save");
    if (!goalSave) return;
    goalSave.addEventListener("click", () => {
      const input = $("setting-daily-goal");
      const value = Math.floor(Number(input && input.value));
      if (!Number.isFinite(value) || value < 1 || value > Store.TOTAL_AYAHS) {
        message("goal-message", `Choose a goal between 1 and ${Store.TOTAL_AYAHS} ayahs.`);
        return;
      }
      Store.setPreferences({ dailyGoalAyahs: value });
      message("goal-message", `Daily goal saved: ${value} ayahs.`);
    });
  }

  function bindData() {
    const exportBtn = $("data-export");
    if (exportBtn) exportBtn.addEventListener("click", () => {
      try {
        const backup = Store.exportData();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `quran-backup-${Store.todayKey()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        message("data-message", "Backup downloaded.");
      } catch (err) {
        message("data-message", "Could not create the backup file.");
      }
    });

    const importBtn = $("data-import");
    const fileInput = $("data-import-file");
    if (importBtn && fileInput) {
      importBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Store.importData(JSON.parse(String(reader.result)));
            message("data-message", "Backup imported — reloading…");
            setTimeout(() => window.location.reload(), 350);
          } catch (err) {
            message("data-message", err && err.message
              ? err.message : "Could not import that file.");
          }
        };
        reader.onerror = () => message("data-message", "Could not read that file.");
        reader.readAsText(file);
        fileInput.value = "";
      });
    }

    const resetBtn = $("data-reset");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      if (!window.confirm(
        "Reset all saved data? This clears bookmarks, memorization, khatm records, reading history and preferences. Export a backup first if you want to keep them."
      )) return;
      Store.resetAll();
      message("data-message", "All data cleared — reloading…");
      setTimeout(() => window.location.reload(), 350);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const goal = $("setting-daily-goal");
    if (goal) goal.value = Number(Store.getPreferences().dailyGoalAyahs) >= 1
      ? Math.floor(Number(Store.getPreferences().dailyGoalAyahs))
      : 40;
    bindGoal();
    bindData();
  });
})();
