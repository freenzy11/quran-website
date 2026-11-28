/* Statistics page. Plain JS, no libraries.
   TO CONNECT REAL DATA: set window.QURAN_STATS_DATA before this script
   loads (shape below), or replace demoData() with a localStorage reader.
   Without it the page shows sample data.

   Data shape:
   {
     readByDay:    { "2026-11-27": 42, ... }   // ayahs read per day (local date)
     memorizedByS: { "1": 7, "2": 40, ... }    // memorized ayahs per surah number
     readSurahs:   [1, 2, 3, ...]              // surahs the person finished reading
     juzPct:       { "1": 100, "2": 45, ... }  // % of each juz memorized (0-100)
     dailyGoal:    40                          // ayahs per day
     khatm:        null | { startDate: "2026-11-16", days: 30 | null,
                            pagesRead: 250, todayPages: [251, 270] }
   }
 */
(function () {
  "use strict";

  var AYAHS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
  var TOTAL = 6236, PAGES = 604, CIRC = 2 * Math.PI * 50, DAY = 864e5;
  var DAYS = ["M", "T", "W", "T", "F", "S", "S"];
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- dates ---------- */
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function key(d) { var m = d.getMonth() + 1, x = d.getDate(); return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (x < 10 ? "0" : "") + x; }
  function parse(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }

  /* ---------- 1. data (sample) ---------- */
  function demoData() {
    var today = startOfDay(new Date()), readByDay = {}, d, v;
    for (d = 0; d < 90; d++) {
      v = d < 12 ? 20 + (d * 17) % 40 : (d === 12 || (d * 29) % 9 < 3 ? 0 : 10 + (d * 13) % 35);
      readByDay[key(addDays(today, -d))] = v;
    }
    return {
      readByDay: readByDay,
      memorizedByS: { 1: 7, 36: 83, 67: 30, 103: 3, 108: 3, 112: 4, 113: 5, 114: 6, 2: 100, 18: 60 },
      readSurahs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 36, 55, 56, 67],
      juzPct: { 1: 100, 2: 45, 29: 60, 30: 100 },
      dailyGoal: 40,
      khatm: { startDate: key(addDays(today, -11)), days: 30, pagesRead: 250, todayPages: [251, 270] }
    };
  }

  /* ---------- 2. calculations ---------- */
  function streaks(rbd) {
    var d = startOfDay(new Date()), cur = 0, best = 0, run = 0, prev = null;
    if (!(rbd[key(d)] > 0)) d = addDays(d, -1);
    while (rbd[key(d)] > 0) { cur++; d = addDays(d, -1); }
    Object.keys(rbd).sort().forEach(function (k) {
      if (!(rbd[k] > 0)) { run = 0; prev = null; return; }
      var dt = parse(k);
      run = prev && Math.round((dt - prev) / DAY) === 1 ? run + 1 : 1;
      prev = dt; if (run > best) best = run;
    });
    return { cur: cur, best: Math.max(best, cur) };
  }
  function weekDays(data) {
    var today = startOfDay(new Date()), mon = addDays(today, -((today.getDay() + 6) % 7)), out = [], i, dt;
    for (i = 0; i < 7; i++) {
      dt = addDays(mon, i);
      out.push({ n: data.readByDay[key(dt)] || 0, future: dt > today, today: +dt === +today, label: DAYS[i] });
    }
    return out;
  }
  function isMemorized(data, s) { return (data.memorizedByS[s] || 0) >= AYAHS[s - 1]; }

  /* ---------- 3. render ---------- */
  function renderRing(data) {
    var ayahs = 0, full = 0, s;
    for (s = 1; s <= 114; s++) { ayahs += data.memorizedByS[s] || 0; if (isMemorized(data, s)) full++; }
    var pct = ayahs / TOTAL * 100;
    $("ring-pct").textContent = pct > 0 && pct < 1 ? "<1%" : Math.round(pct) + "%";
    $("mem-surahs").textContent = full;
    $("mem-note").textContent = (114 - full) + " left \u00b7 " + ayahs.toLocaleString("en-US") + " of 6,236 ayahs";
    $("ring").setAttribute("aria-label", full + " of 114 surahs memorized, " + Math.round(pct) + " percent of ayahs");
    requestAnimationFrame(function () { $("ring-arc").style.strokeDasharray = (pct * CIRC / 100) + " " + CIRC; });
  }

  function renderStreak(data) {
    var st = streaks(data.readByDay), wk = weekDays(data);
    $("streak").textContent = st.cur;
    $("best").textContent = plural(st.best, "day");
    $("dots").innerHTML = wk.map(function (d) {
      return '<div class="dot' + (d.n > 0 ? " on" : "") + '"><i>' + (d.n > 0 ? "&#10003;" : "") + "</i>" + d.label + "</div>";
    }).join("");
  }

  function renderRange(data, range) {
    var today = startOfDay(new Date()), days = 0, ayahs = 0, limit = range === "week" ? 7 : 30;
    Object.keys(data.readByDay).forEach(function (k) {
      var n = data.readByDay[k], age = Math.round((today - parse(k)) / DAY);
      if (n > 0 && (range === "all" || age < limit)) { days++; ayahs += n; }
    });
    $("chip-days").textContent = days;
    $("chip-ayahs").textContent = ayahs.toLocaleString("en-US");
    $("chip-ayahs-label").textContent = range === "week" ? "ayahs this week" : range === "month" ? "ayahs this month" : "ayahs in total";
    document.querySelectorAll(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.range === range)); });
  }

  function renderWeek(data) {
    var wk = weekDays(data), goal = data.dailyGoal || 40, max = goal * 1.3, total = 0, hit = 0;
    wk.forEach(function (d) { if (d.n > max) max = d.n; total += d.n; if (d.n >= goal) hit++; });
    $("bars").innerHTML = wk.map(function (d) {
      var h = d.future ? 4 : Math.max(4, Math.round(d.n / max * 100));
      return '<div class="bar' + (d.today ? " today" : d.n > 0 && !d.future ? " on" : "") + '"><span>' + (d.n > 0 ? d.n : "-") + '</span><i style="height:' + h + 'px"></i></div>';
    }).join("") + '<div class="goal-line" style="bottom:' + (Math.round(goal / max * 100) + 24) + 'px"></div>';
    $("bar-days").innerHTML = wk.map(function (d) { return '<span class="' + (d.today ? "today" : "") + '">' + d.label + "</span>"; }).join("");
    $("week-sum").textContent = total.toLocaleString("en-US") + " ayahs \u00b7 " + plural(wk.filter(function (d) { return d.n > 0; }).length, "day");
    $("goal-label").textContent = "Daily goal: " + goal + " ayahs";
    $("goal-hit").textContent = "Goal reached " + plural(hit, "day");
  }

  function renderKhatm(data) {
    var k = data.khatm, body = $("khatm-body"), tag = $("khatm-tag"), card = $("khatm-card");
    if (!k) {
      /* Nothing about khatm is shown until a khatm is active. */
      if (card) card.hidden = true;
      return;
    }
    if (card) card.hidden = false;
    var pct = Math.round(k.pagesRead / PAGES * 100), html, i;
    html = '<div class="pct-row"><span class="pct">' + pct + '%</span><span class="muted">' + k.pagesRead + " of " + PAGES + " pages</span></div>";
    if (k.days) {
      var n = Math.min(k.days, Math.max(1, Math.round((startOfDay(new Date()) - parse(k.startDate)) / DAY) + 1));
      var onTrack = k.pagesRead >= Math.ceil(PAGES * n / k.days);
      tag.hidden = false; tag.textContent = onTrack ? "On track" : "Behind";
      if (k.days <= 60) {
        html += '<div class="ticks" role="img" aria-label="Day ' + n + " of " + k.days + '">';
        for (i = 1; i <= k.days; i++) html += "<i" + (i === n ? ' class="now"' : k.pagesRead >= Math.ceil(PAGES * i / k.days) ? ' class="done"' : "") + "></i>";
        html += '</div><div class="tick-labels"><span>Day 1</span><span>Today: day ' + n + "</span><span>Day " + k.days + "</span></div>";
      } else html += '<div class="track"><i style="width:' + pct + '%"></i></div>';
    } else {
      tag.hidden = true;
      html += '<div class="track"><i style="width:' + pct + '%"></i></div>';
    }
    var tp = k.todayPages;
    html += '<a class="btn" href="quran.html?page=' + tp[0] + '">Open today\u2019s pages: ' + tp[0] + " to " + tp[1] + "</a>";
    body.innerHTML = html;
  }

  function renderJuz(data) {
    var html = "", full = 0, j, p;
    for (j = 1; j <= 30; j++) {
      p = data.juzPct[j] || 0; if (p >= 100) full++;
      html += '<div class="j' + (p >= 100 ? " full" : "") + '" aria-label="Juz ' + j + ", " + p + ' percent memorized"><b>' + j + "</b>" + (p > 0 ? '<i style="width:' + p + '%"></i>' : "") + "</div>";
    }
    $("juz-grid").innerHTML = html;
    $("juz-count").textContent = full + " of 30 complete";
  }

  /* Surah map: ordered strip treemap. Cells keep order 1..114
     (left to right, top to bottom). Area grows with ayah count (power 0.68
     so the smallest surahs stay big enough to show their number). */
  function layout(S, e) {
    var w = AYAHS.map(function (a) { return Math.pow(a, e); }), sum = 0, i;
    w.forEach(function (x) { sum += x; });
    var k = S * S / sum, out = [], cur = [], y = 0;
    function worst(strip) {
      var t = 0, h; strip.forEach(function (c) { t += c.a; }); h = t / S;
      return Math.max.apply(null, strip.map(function (c) { return Math.max(c.a / h / h, h * h / c.a); }));
    }
    function flush() {
      var t = 0, x = 0, h; cur.forEach(function (c) { t += c.a; }); h = t / S;
      cur.forEach(function (c) { var wd = c.a / h; out.push({ i: c.i, x: x, y: y, w: wd, h: h }); x += wd; });
      y += h; cur = [];
    }
    for (i = 1; i <= 114; i++) {
      var item = { i: i, a: w[i - 1] * k };
      if (cur.length && worst(cur.concat(item)) > worst(cur)) flush();
      cur.push(item);
    }
    flush();
    return out;
  }

  function renderMap(data) {
    var S = window.matchMedia("(min-width:1024px)").matches ? 640 : 600, map = $("map"), read = {}, mem = 0, rd = 0, s;
    (data.readSurahs || []).forEach(function (n) { read[n] = true; });
    for (s = 1; s <= 114; s++) { if (isMemorized(data, s)) { mem++; read[s] = true; } }
    for (s in read) rd++;
    map.style.width = map.style.height = S + "px";
    map.innerHTML = layout(S, 0.68).map(function (c) {
      var st = isMemorized(data, c.i) ? "is-mem" : read[c.i] ? "is-read" : "", name = "Surah " + c.i + ", " + plural(AYAHS[c.i - 1], "ayah");
      return '<a class="cell ' + st + '" href="quran.html?surah=' + c.i + '" title="' + name + '" aria-label="' + name + (st === "is-mem" ? ", memorized" : st ? ", read" : "") +
        '" style="left:' + (c.x + .5).toFixed(1) + "px;top:" + (c.y + .5).toFixed(1) + "px;width:" + (c.w - 1).toFixed(1) + "px;height:" + (c.h - 1).toFixed(1) + "px;font-size:" + (Math.min(c.w, c.h) >= 24 ? 11 : 10) + 'px">' + c.i + "</a>";
    }).join("");
    $("map-count").textContent = rd + " of 114 surahs read \u00b7 " + mem + " memorized";
    $("map-read").textContent = rd; $("map-mem").textContent = mem; $("map-left").textContent = 114 - mem;
  }

  /* ---------- init ---------- */
  var data = window.QURAN_STATS_DATA || demoData(), range = "month";
  renderRing(data); renderStreak(data); renderWeek(data); renderKhatm(data); renderJuz(data); renderMap(data); renderRange(data, range);
  document.querySelector(".seg").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-range]"); if (b) { range = b.dataset.range; renderRange(data, range); }
  });
  window.matchMedia("(min-width:1024px)").addEventListener("change", function () { renderMap(data); });
})();
