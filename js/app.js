/* ============================================================
   app.js — Home page controller.

   Renders the welcome section, the Continue Reading block,
   and the progress overview. Every number shown here comes
   from the storage layer (Store). When there is no stored
   data, the UI shows honest empty states — never fabricated
   reading or memorization data.
   ============================================================ */

(function () {
  "use strict";

  /* --- Opening: greeting and dates --------------------------- */

  function greetingFor(hour) {
    if (hour < 5)  return "Good night";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Good night";
  }

  function formatGregorian(date) {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric"
      }).format(date);
    } catch (err) {
      return "";
    }
  }

  function formatHijri(date) {
    try {
      return new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        day: "numeric", month: "long", year: "numeric"
      }).format(date);
    } catch (err) {
      return "";
    }
  }

  function renderOpening() {
    const now = new Date();

    const greeting = document.getElementById("greeting");
    if (greeting) greeting.textContent = greetingFor(now.getHours());

    const gregorian = document.getElementById("date-gregorian");
    if (gregorian) gregorian.textContent = formatGregorian(now);

    const hijri = document.getElementById("date-hijri");
    if (hijri) {
      const text = formatHijri(now);
      hijri.textContent = text;
      /* Hide the separator when Hijri is unavailable */
      const separator = document.querySelector(".date-sep");
      if (!text) {
        hijri.hidden = true;
        if (separator) separator.hidden = true;
      }
    }
  }

  /* --- Continue reading -------------------------------------- */

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value);
    return div.innerHTML;
  }

  function renderContinueReading() {
    const body = document.getElementById("continue-body");
    if (!body) return;

    const emptyState = `
      <div class="continue-empty">
        <p class="continue-empty-text">You haven&rsquo;t started reading yet. The Qur&rsquo;an opens with Al-Fatihah, &ldquo;The Opening&rdquo; &mdash; a short surah of seven ayahs.</p>
        <a class="btn btn-primary" href="pages/quran.html?mode=read&page=1">Begin with Al-Fatihah</a>
      </div>`;

    const position = Store.getPosition();
    const surah = position ? getSurah(position.surah) : null;

    if (!position || !surah) {
      body.innerHTML = emptyState;
      return;
    }

    const meta = [];
    if (position.page) meta.push(`Page ${Number(position.page)}`);
    if (position.ayah) meta.push(`Ayah ${Number(position.ayah)}`);
    if (position.juz) meta.push(`Juz ${Number(position.juz)}`);
    if (meta.length === 0) meta.push(`Surah ${surah.n}`);

    /* Reading happens in Read mode: a page link when we have one,
       otherwise the surah/ayah position resolved to its page. */
    const resumeHref =
      `pages/quran.html?mode=read&page=${Number(position.page) || 1}` +
      (!position.page && position.ayah ? `&surah=${surah.n}&ayah=${Number(position.ayah)}` : "");

    body.innerHTML = `
      <div class="continue-current">
        <div>
          <div class="continue-surah">
            <span class="continue-name">${escapeHTML(surah.name)}</span>
            <span class="continue-arabic" lang="ar" dir="rtl">${escapeHTML(surah.arabic)}</span>
          </div>
          <p class="continue-meta">${escapeHTML(meta.join(" · "))}</p>
        </div>
        <a class="btn btn-primary" href="${resumeHref}">Resume reading</a>
      </div>`;
  }

  /* --- Bookmarks ---------------------------------------------- */

  function renderBookmarks() {
    const list = document.getElementById("bookmarks-body");
    const section = document.getElementById("bookmarks-section");
    if (!list || !section) return;
    const entries = Object.entries(Store.getBookmarks())
      .sort((x, y) => String(y[1]).localeCompare(String(x[1])))
      .slice(0, 5);
    const items = entries.map(([key]) => {
      const [s, n] = key.split(":").map(Number);
      const surah = getSurah(s);
      if (!surah) return "";
      return `<li><a href="pages/quran.html?surah=${s}&ayah=${n}"><span>${escapeHTML(surah.name)}</span><span class="bm-ayah">Ayah ${n}</span></a></li>`;
    }).join("");
    list.innerHTML = items;
    section.hidden = !items;
  }

  function renderSurahCounts() {
    const done = Object.keys(Store.getMemorizedSurahMap()).length;
    const el = document.getElementById("hint-memorized");
    if (el) el.textContent = `of ${TOTAL_AYAHS.toLocaleString("en-US")} ayahs. Surahs: ${done} done, ${114 - done} left.`;
  }

  /* --- Progress overview -------------------------------------- */

  function setStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHint(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setBar(id, percent) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }

  function renderMemorization() {
    const memorized = Store.countMemorizedAyahs();
    const percent = TOTAL_AYAHS ? (memorized / TOTAL_AYAHS) * 100 : 0;

    setStat("stat-memorized", memorized.toLocaleString("en-US"));
    setBar("bar-memorized", percent);
    setHint(
      "hint-memorized",
      `${percent < 0.1 && memorized > 0 ? "<0.1" : Math.round(percent * 10) / 10}% of ${TOTAL_AYAHS.toLocaleString("en-US")} ayahs`
    );
  }

  function renderKhatm() {
    const khatm = Store.getActiveKhatm();

    const block = document.getElementById("khatm-block");
    if (!khatm) {
      if (block) block.hidden = true;
      return;
    }
    if (block) block.hidden = false;

    const read = Store.khatmPagesRead(khatm);
    const total = Store.TOTAL_PAGES;
    const percent = (read / total) * 100;
    const remaining = Math.max(0, total - read);
    const paused = Boolean(khatm.pausedAt);

    setStat("stat-khatm", `${Math.round(percent * 10) / 10}%`);
    setBar("bar-khatm", percent);
    setHint("hint-khatm", paused
      ? `Paused — ${read} of ${total} pages marked read`
      : `${read} of ${total} pages marked read · ${remaining} to go`);
  }

  function renderDailyGoal() {
    const goal = Number(Store.getPreferences().dailyGoalAyahs) || 40;
    const today = Store.ayahsViewedOn(Store.todayKey());

    setStat("stat-today", `${today.toLocaleString("en-US")} / ${goal.toLocaleString("en-US")}`);
    setBar("bar-today", (today / goal) * 100);
    setHint(
      "hint-today",
      today >= goal
        ? "Daily goal reached — well done"
        : `Ayahs viewed today in the Reader — adjust the goal in Settings`
    );
  }

  /* --- Daily ayah ---------------------------------------------- */

  function renderDailyAyah() {
    const body = document.getElementById("daily-ayah-body");
    if (!body) return;
    if (typeof DailyAyah === "undefined" || !DailyAyah.getDailyAyah) return;

    const ayah = DailyAyah.getDailyAyah();

    body.innerHTML = `
      <figure class="ayah-figure">
        <blockquote class="ayah-quote">
          <p class="ayah-arabic" lang="ar" dir="rtl" translate="no">${escapeHTML(ayah.arabic)}</p>
          <p class="ayah-translation">${escapeHTML(ayah.translation)}</p>
        </blockquote>
        <figcaption class="ayah-ref">Qur’an · ${escapeHTML(ayah.surah)} ${escapeHTML(ayah.reference)}</figcaption>
      </figure>`;
  }

  /* --- Goals (memorization, khatm, reading) --------------------
     Each row shows the honest progress from the storage layer:
       memorization — ayahs marked memorized,
       khatm         — pages marked read in the active session,
       reading       — pages reached via ayahs read in Read mode.
     A goal is either limited (deadline in N days) or open-ended
     (no deadline, a chosen daily pace). Editing happens inline;
     every action re-renders the whole section from the Store. */

  const GOAL_TYPES = [
    {
      key: "memorization",
      label: "Memorization",
      unit: "ayahs",
      done: () => Store.countMemorizedAyahs(),
      action: "pages/statistics.html",
      actionLabel: "Track ayahs"
    },
    {
      key: "khatm",
      label: "Khatm",
      unit: "pages",
      done: () => {
        const session = Store.getActiveKhatm();
        return session ? Store.khatmPagesRead(session) : 0;
      },
      action: "pages/quran.html?mode=read",
      actionLabel: "Mark pages"
    },
    {
      key: "reading",
      label: "Reading",
      unit: "pages",
      done: () => Store.countReadPages(),
      action: "pages/quran.html?mode=read",
      actionLabel: "Read now"
    }
  ];

  const DAY_PRESETS = [7, 30, 60, 90, 180, 365];

  /* Editor state: which type is open, and the mode picked in it. */
  const goalEditor = { type: null, mode: "deadline" };

  function daysSince(dateKey) {
    const then = Date.parse(`${dateKey}T00:00:00`);
    if (Number.isNaN(then)) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today - then) / 86400000));
  }

  /* Khatm goal view: an active session doubles as the goal,
     with targetDays as the optional deadline. */
  function khatmGoalView() {
    const session = Store.getActiveKhatm();
    if (!session) return null;
    return {
      mode: session.targetDays ? "deadline" : "open",
      target: Store.TOTAL_PAGES,
      days: session.targetDays ? Number(session.targetDays) : null,
      daily: null,
      startDay: (session.startedAt || "").slice(0, 10),
      session
    };
  }

  function goalProgress(type) {
    const def = GOAL_TYPES.find((g) => g.key === type);
    const done = def ? def.done() : 0;
    const goal =
      type === "khatm"
        ? khatmGoalView()
        : Store.getGoal(type);
    if (!goal) return { def, done, goal: null };

    const total = Number(goal.target) || Store.TOTAL_AYAHS;
    const percent = total ? Math.min(100, (done / total) * 100) : 0;
    let deadline = null;

    if (goal.mode === "deadline" && goal.days) {
      const elapsed = daysSince(goal.startDay);
      const left = Math.max(0, goal.days - elapsed);
      const remaining = Math.max(0, total - done);
      deadline = {
        left,
        needed: left > 0 ? Math.ceil(remaining / left) : remaining === 0 ? 0 : null
      };
    }

    return { def, done, goal, total, percent, deadline };
  }

  function goalDeadlineText(goal, deadline, unit) {
    if (goal.mode === "open") return "Open-ended — no deadline";
    if (!deadline) return "Deadline set";
    if (deadline.left === 0) return "Final day — deadline is today";
    return `${deadline.left} day${deadline.left === 1 ? "" : "s"} left${
      deadline.needed === null ? "" : ` · ${deadline.needed} ${unit}/day needed`
    }`;
  }

  function renderGoals() {
    const body = document.getElementById("goals-body");
    if (!body) return;

    body.innerHTML = GOAL_TYPES.map((def) => {
      const { done, goal, total, percent, deadline } = goalProgress(def.key);
      const editing = goalEditor.type === def.key;

      const metaBits = [];
      if (goal) {
        metaBits.push(`${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${def.unit}`);
        metaBits.push(goalDeadlineText(goal, deadline, def.unit));
      } else {
        metaBits.push(`No goal yet · ${done.toLocaleString("en-US")} ${def.unit} on record`);
      }

      return `
        <div class="goal-block" data-goal="${def.key}">
          <div class="goal-row">
            <div class="goal-name-wrap">
              <span class="goal-name">${def.label}</span>
              ${goal ? `<span class="goal-mode">${goal.mode === "deadline" ? "Deadline" : "Open-ended"}</span>` : ""}
            </div>
            <div class="goal-progress">
              <div class="progress-bar"><span class="progress-fill" style="width:${goal ? percent : 0}%"></span></div>
              <p class="goal-meta">${metaBits.join(" · ")}</p>
            </div>
            <div class="goal-actions">
              <a class="goal-link" href="${def.action}">${def.actionLabel}→</a>
              ${goal
                ? `<button type="button" class="goal-edit" data-goal-edit="${def.key}">${editing ? "Close" : "Adjust"}</button>`
                : `<button type="button" class="goal-edit" data-goal-edit="${def.key}">${editing ? "Close" : "Set goal"}</button>`}
              ${goal ? `<button type="button" class="goal-remove" data-goal-remove="${def.key}">Remove</button>` : ""}
            </div>
          </div>
          ${editing ? renderGoalForm(def, goal) : ""}
        </div>`;
    }).join("");
  }

  function renderGoalForm(def, goal) {
    const mode = goalEditor.mode;
    const isKhatm = def.key === "khatm";
    const khatmActive = isKhatm && Store.getActiveKhatm();

    const targetValue = goal ? goal.target : (def.key === "memorization" ? 100 : 604);
    const daysValue = goal && goal.days ? goal.days : 30;
    const dailyValue = goal && goal.daily ? goal.daily : 1;

    const targetField = isKhatm
      ? `<p class="goal-form-hint">A full khatm covers all ${Store.TOTAL_PAGES} pages of the mushaf.</p>`
      : `
          <label class="goal-field-label" for="goal-target-${def.key}">Total ${def.unit} to complete</label>
          <input class="goal-input" id="goal-target-${def.key}" type="number" min="1" step="1" value="${targetValue}" inputmode="numeric">`;

    const modeField = `
      <div class="goal-modes" role="radiogroup" aria-label="Deadline or open-ended">
        <button type="button" class="goal-mode-btn${mode === "deadline" ? " is-active" : ""}" data-goal-mode="deadline" aria-pressed="${mode === "deadline"}" role="radio">Limited days · deadline</button>
        <button type="button" class="goal-mode-btn${mode === "open" ? " is-active" : ""}" data-goal-mode="open" aria-pressed="${mode === "open"}" role="radio">No deadline · open-ended</button>
      </div>`;

    const paceHint =
      mode === "deadline"
        ? `<p class="goal-form-hint">A ${daysValue}-day deadline asks for about ${Math.max(1, Math.ceil(Number(targetValue) / Math.max(1, Number(daysValue) || 1)))} ${def.unit} per day.</p>`
        : `<p class="goal-form-hint">Open-ended: keep a steady pace — roughly ${Math.ceil(Number(targetValue) / Math.max(1, Number(dailyValue) || 1))} days at ${dailyValue} ${def.unit} per day.</p>`;

    const paceFields = mode === "deadline"
      ? `
          <label class="goal-field-label" for="goal-days-${def.key}">Days</label>
          <input class="goal-input" id="goal-days-${def.key}" type="number" min="1" max="3650" step="1" value="${daysValue}" inputmode="numeric">
          <span class="goal-presets">${DAY_PRESETS.map((d) => `<button type="button" data-goal-days="${d}">${d}d</button>`).join("")}</span>`
      : `
          <label class="goal-field-label" for="goal-daily-${def.key}">${def.unit} per day</label>
          <input class="goal-input" id="goal-daily-${def.key}" type="number" min="1" step="1" value="${dailyValue}" inputmode="numeric">`;

    return `
      <form class="goal-form" data-goal-form="${def.key}">
        ${targetField}
        ${modeField}
        ${paceFields}
        ${paceHint}
        ${isKhatm && khatmActive ? `<p class="goal-form-hint">An active khatm already has progress — its deadline is updated, marks are kept.</p>` : ""}
        <div class="goal-form-actions">
          <button type="submit" class="btn-quiet goal-save">Save goal</button>
          <button type="button" class="btn-quiet btn-danger goal-cancel">Cancel</button>
        </div>
      </form>`;
  }

  function handleGoalClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const body = target.closest("#goals-body");
    if (!body) return;

    const editBtn = target.closest("[data-goal-edit]");
    if (editBtn) {
      const type = editBtn.getAttribute("data-goal-edit");
      goalEditor.type = goalEditor.type === type ? null : type;
      const current = type === "khatm" ? khatmGoalView() : Store.getGoal(type);
      goalEditor.mode = current && current.mode ? current.mode : "deadline";
      renderGoals();
      return;
    }

    const removeBtn = target.closest("[data-goal-remove]");
    if (removeBtn) {
      const type = removeBtn.getAttribute("data-goal-remove");
      if (type === "khatm") {
        const session = Store.getActiveKhatm();
        if (session) Store.stopKhatm();
      } else {
        Store.removeGoal(type);
      }
      goalEditor.type = null;
      renderGoals();
      return;
    }

    const modeBtn = target.closest("[data-goal-mode]");
    if (modeBtn) {
      goalEditor.mode = modeBtn.getAttribute("data-goal-mode");
      renderGoals();
      return;
    }

    const presetBtn = target.closest("[data-goal-days]");
    if (presetBtn) {
      const days = presetBtn.getAttribute("data-goal-days");
      const form = target.closest(".goal-form");
      const input = form ? form.querySelector('input[type="number"][min="1"][max="3650"]') : null;
      if (input) input.value = days;
      presetBtn.parentElement.querySelectorAll(".goal-presets button").forEach((b) => {
        b.classList.toggle("is-active", b === presetBtn);
      });
      return;
    }

    const cancelBtn = target.closest(".goal-cancel");
    if (cancelBtn) {
      goalEditor.type = null;
      renderGoals();
    }
  }

  function handleGoalSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(".goal-form")) return;
    event.preventDefault();

    const type = form.getAttribute("data-goal-form");
    const mode = goalEditor.mode;
    const def = GOAL_TYPES.find((g) => g.key === type);
    if (!def) return;

    const targetInput = form.querySelector(`#goal-target-${type}`);
    const daysInput = form.querySelector(`#goal-days-${type}`);
    const dailyInput = form.querySelector(`#goal-daily-${type}`);

    const target = type === "khatm"
      ? Store.TOTAL_PAGES
      : Math.floor(Number(targetInput && targetInput.value));
    const days = Math.floor(Number(daysInput && daysInput.value));
    const daily = Math.floor(Number(dailyInput && dailyInput.value));

    if (type === "khatm") {
      const session = Store.getActiveKhatm();
      if (session) {
        Store.updateKhatmSession(session.id, {
          targetDays: mode === "deadline" && days >= 1 ? days : null
        });
      } else {
        Store.startKhatm({
          targetDays: mode === "deadline" && days >= 1 ? days : null
        });
      }
    } else if (mode === "deadline" && days >= 1 && target >= 1) {
      Store.setGoal(type, { mode: "deadline", target, days, daily: 1 });
    } else if (mode === "open" && target >= 1 && daily >= 1) {
      Store.setGoal(type, { mode: "open", target, daily });
    }

    goalEditor.type = null;
    renderGoals();
    renderMemorization();
    renderKhatm();
  }

  /* --- Init ---------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", () => {
    renderOpening();
    renderContinueReading();
    renderDailyAyah();
    renderBookmarks();
    renderGoals();
    renderMemorization();
    renderSurahCounts();
    renderKhatm();
    renderDailyGoal();

    const goalsBody = document.getElementById("goals-body");
    if (goalsBody) {
      goalsBody.addEventListener("click", handleGoalClick);
      goalsBody.addEventListener("submit", handleGoalSubmit);
    }
  });
})();
