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

  /* --- Init ---------------------------------------------------- */

  document.addEventListener("DOMContentLoaded", () => {
    renderOpening();
    renderContinueReading();
    renderBookmarks();
    renderMemorization();
    renderSurahCounts();
    renderKhatm();
    renderDailyGoal();
  });
})();
