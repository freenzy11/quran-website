/* ============================================================
   word-audio.js — one shared player for tapped Arabic words.

   Used by both Read mode (mushaf.js) and Memorize mode
   (reader.js). Each tap streams a separate word-only clip; it
   never slices the verse recitation.

   Word clips: Quran Foundation audio CDN (wbw/SSS_AAA_WWW.mp3,
   1-based). Audio is streamed only — nothing is copied locally.
   ============================================================ */

(function () {
  "use strict";

  const audio = new Audio();
  audio.preload = "auto";

  let token = 0;
  let active = null;

  const pad = (n) => String(n).padStart(3, "0");

  function clipURL(surah, ayah, word) {
    return `https://verses.quran.foundation/wbw/${pad(surah)}_${pad(ayah)}_${pad(word)}.mp3`;
  }

  function clearActive() {
    if (active) active.classList.remove("is-word-playing");
    active = null;
  }

  /* Cancel any word currently playing. Also called when verse
     playback starts, a page turns or a different mode opens. */
  function stop() {
    token += 1;
    audio.onerror = null;
    audio.onended = null;
    audio.pause();
    audio.removeAttribute("src");
    try { audio.load(); } catch (err) { /* no-op */ }
    clearActive();
  }

  function fail(mine, hooks) {
    if (mine !== token) return;
    token += 1;
    audio.onerror = null;
    audio.onended = null;
    clearActive();
    if (hooks && typeof hooks.onError === "function") hooks.onError();
  }

  /* Play the word that was tapped. `surah` is supplied by the
     active mode controller; ayah and 1-based word come from the
     span written by timings.wordsHTML(). */
  function play(word, surah, hooks) {
    if (!word || !Number.isInteger(Number(surah))) return;
    const root = word.closest(".m-ayah, .ayah");
    const ayah = Number(root && root.dataset.n);
    const wordIndex = Number(word.dataset.w) + 1;
    if (!Number.isInteger(ayah) || !Number.isInteger(wordIndex) || wordIndex < 1) return;

    stop();
    const mine = token;
    active = word;
    word.classList.add("is-word-playing");

    if (hooks && typeof hooks.rate === "function") {
      try {
        const rate = Number(hooks.rate());
        if (rate > 0) audio.playbackRate = rate;
      } catch (err) { /* keep the previous rate */ }
    }

    audio.src = clipURL(Number(surah), ayah, wordIndex);
    audio.onerror = () => fail(mine, hooks);
    audio.onended = () => {
      if (mine !== token) return;
      audio.onerror = null;
      clearActive();
      if (hooks && typeof hooks.onEnd === "function") hooks.onEnd();
    };

    let started;
    try {
      started = audio.play();
    } catch (err) {
      fail(mine, hooks);
      return;
    }
    if (started && typeof started.then === "function") {
      started.then(() => {
        if (mine !== token) return;
        if (hooks && typeof hooks.onStart === "function") hooks.onStart(word);
      }).catch(() => fail(mine, hooks));
    }
  }

  window.QuranWordAudio = { play, stop };
})();
