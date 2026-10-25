/* Breshia — site interactions. No libraries, no fetch. Works over file://. */
(function () {
  "use strict";

  var B = window.BRESHIA || {};
  var NEW = Array.isArray(B.new) ? B.new : [];
  var ARCHIVE = Array.isArray(B.archive) ? B.archive : [];
  var LINKS = Array.isArray(B.links) ? B.links : [];
  var ARTIST = B.artist || "Breshia";
  var SITE = B.site || "breshia-music.ru";
  var LIME = "#C8F13A", BAR_IDLE = "#3A3A40", BAR_IDLE_SM = "#2E2E33";

  var LS_TRACK = "breshia.track", LS_VOL = "breshia.vol", LS_MUTE = "breshia.muted";

  var MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"];

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
  function pad2(n) { n = Math.floor(n); return (n < 10 ? "0" : "") + n; }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return a; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b; return c; }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  if (!NEW.length) { return; }

  /* ==================== playability / teaser ==================== */
  /* A track is playable only if it carries an audio file AND its release date
     (if any) has already passed. A track with no audio is a teaser/anons. */
  function releaseMs(t) {
    if (!t || !t.releaseAt) return null;
    var m = new Date(t.releaseAt).getTime();
    return isFinite(m) ? m : null;
  }
  function isReleased(t) { var m = releaseMs(t); return m == null || m <= Date.now(); }
  function isPlayable(t) { return !!(t && t.audio) && isReleased(t); }
  function isDatedTeaser(t) { return releaseMs(t) != null && !isPlayable(t); }

  /* Label uses the date as written in the data (Moscow time), so a viewer in
     another timezone still sees the intended release date, not a shifted one. */
  function releaseLabel(t) {
    if (!t || !t.releaseAt) return "";
    var mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(t.releaseAt));
    if (mm) return parseInt(mm[3], 10) + " " + MONTHS[parseInt(mm[2], 10) - 1];
    var m = releaseMs(t); if (m == null) return "";
    var d = new Date(m); return d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function parts(ms) {
    ms = Math.max(0, ms || 0);
    var s = Math.floor(ms / 1000);
    return { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
  }
  function compactCountdown(ms) {
    var p = parts(ms);
    return p.d > 0 ? (p.d + "д " + pad2(p.h) + ":" + pad2(p.m) + ":" + pad2(p.s))
                   : (pad2(p.h) + ":" + pad2(p.m) + ":" + pad2(p.s));
  }

  /* playable queue — only tracks that can actually play */
  var playableIdx = [];
  function recomputePlayable() {
    var n = [];
    NEW.forEach(function (t, i) { if (isPlayable(t)) n.push(i); });
    playableIdx = n;
  }
  recomputePlayable();

  /* ==================== static content ==================== */
  function minYear() { var y = Infinity; NEW.concat(ARCHIVE).forEach(function (t) { if (t && t.year < y) y = t.year; }); return isFinite(y) ? y : ""; }

  var featured = NEW[0];
  $("heroArt").style.backgroundImage = "url('" + featured.cover + "')";
  var hc = $("heroCover");
  hc.src = featured.cover;
  hc.alt = "Обложка «" + featured.title + "» (" + featured.year + ")";
  $("heroCap").textContent = featured.title + " · " + featured.year;
  $("heroLine").textContent = featured.year + " · " + featured.title;
  var heroPrefix = isDatedTeaser(featured) ? ("Премьера " + releaseLabel(featured) + " · ") : "";
  $("heroStats").textContent =
    heroPrefix +
    NEW.length + " " + plural(NEW.length, "новый трек", "новых трека", "новых треков") +
    " · " + ARCHIVE.length + " " + plural(ARCHIVE.length, "ранний релиз", "ранних релиза", "ранних релизов") +
    " · с " + minYear();
  $("footSite").textContent = SITE;
  $("lyricsNote").textContent = B.lyricsNote || "";

  /* links */
  (function () {
    var box = $("linkList");
    LINKS.forEach(function (l) {
      var li = mk("li");
      var a = mk("a");
      a.href = l.url; a.target = "_blank"; a.rel = "noopener";
      a.innerHTML = esc(l.label) + ' <span class="arw" aria-hidden="true">↗</span>';
      li.appendChild(a); box.appendChild(li);
    });
  })();

  /* archive */
  (function () {
    var box = $("archiveList");
    ARCHIVE.forEach(function (r) {
      var card = mk("article", "rel");
      var head = mk("button", "rel-head");
      head.type = "button";
      head.setAttribute("aria-expanded", "false");
      head.innerHTML =
        '<img class="rel-cover" src="' + esc(r.cover) + '" alt="" width="64" height="64" loading="lazy" decoding="async">' +
        '<span class="rel-info">' +
          '<span class="rel-title">' + esc(r.title) + '</span>' +
          '<span class="rel-sub">' + r.year + " · " + esc(r.kind) + " · " + r.tracksCount + " " +
            plural(r.tracksCount, "трек", "трека", "треков") + '</span>' +
        '</span>' +
        '<span class="rel-kind">' + esc(r.kind) + '</span>' +
        '<span class="rel-toggle" aria-hidden="true"></span>';
      var body = mk("div", "rel-body");
      var ol = mk("ol", "list");
      (r.tracks || []).forEach(function (t, i) {
        var li = mk("li", "row");
        li.innerHTML = '<span class="idx">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span>' +
          '<span class="tname">' + esc(t.title) + '</span>' +
          '<span class="tdur">' + esc(t.duration) + '</span>';
        ol.appendChild(li);
      });
      body.appendChild(ol);
      var link = mk("a", "rel-link");
      link.href = r.url; link.target = "_blank"; link.rel = "noopener";
      link.innerHTML = 'Слушать в Apple Music <span class="arw" aria-hidden="true">↗</span>';
      body.appendChild(link);
      card.appendChild(head); card.appendChild(body);
      box.appendChild(card);
      head.addEventListener("click", function () {
        var open = card.classList.toggle("open");
        head.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  })();

  /* ==================== new-track cards ==================== */
  var cards = [];         // {art, btn, canvas, i}
  var activeCanvas = null;

  function playableInner(t) {
    return '<img class="cover" src="' + esc(t.cover) + '" alt="Обложка «' + esc(t.title) + '»" width="96" height="96" loading="lazy" decoding="async">' +
      '<div class="tc-body">' +
        '<h3 class="tc-title">' + esc(t.title) + '</h3>' +
        '<p class="tc-sub">' + t.year + " · " + esc(t.durationText) + '</p>' +
      '</div>' +
      '<canvas class="tc-wave" aria-hidden="true"></canvas>' +
      '<div class="tc-right">' +
        '<span class="tc-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
        '<span class="tc-dur">' + esc(t.durationText) + '</span>' +
        '<span class="tc-play" aria-hidden="true"></span>' +
      '</div>' +
      '<button class="tc-hit" type="button" aria-label="Слушать: ' + esc(t.title) + '" aria-pressed="false"></button>';
  }

  function teaserInner(t) {
    return '<img class="cover" src="' + esc(t.cover) + '" alt="Обложка «' + esc(t.title) + '»" width="96" height="96" loading="lazy" decoding="async">' +
      '<div class="tc-body">' +
        '<h3 class="tc-title">' + esc(t.title) + '</h3>' +
        '<p class="tc-sub">' + t.year + " · премьера " + esc(releaseLabel(t)) + '</p>' +
      '</div>' +
      '<div class="tc-right tc-locked">' +
        '<span class="tc-badge"></span>' +
        '<span class="tc-count" aria-hidden="true"></span>' +
        '<span class="tc-lock" aria-hidden="true">🔒</span>' +
      '</div>' +
      '<button class="tc-hit" type="button" aria-disabled="true" ' +
        'aria-label="Анонс: ' + esc(t.title) + '. Премьера ' + esc(releaseLabel(t)) + '. Воспроизведение пока недоступно"></button>';
  }

  function wireCard(rec) {
    rec.btn = rec.art.querySelector(".tc-hit");
    rec.canvas = rec.art.querySelector(".tc-wave");
    /* delegate on the card so a click anywhere (card or overlay button) plays */
    rec.art.addEventListener("click", function () { onCardClick(rec.i); });
  }

  (function () {
    var box = $("newList");
    NEW.forEach(function (t, i) {
      var art = mk("article", "track-card");
      art.setAttribute("data-i", i);
      if (isDatedTeaser(t)) art.classList.add("is-teaser");
      art.innerHTML = isDatedTeaser(t) ? teaserInner(t) : playableInner(t);
      box.appendChild(art);
      var rec = { art: art, i: i };
      cards.push(rec);
      wireCard(rec);
    });
  })();

  /* ==================== waveform drawing ==================== */
  function drawWave(canvas, peaks, ratio, small) {
    if (!canvas || !peaks || !peaks.length) return;
    var w = canvas.clientWidth || (small ? 220 : 600);
    var h = canvas.clientHeight || 46;
    var dpr = window.devicePixelRatio || 1;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var n = peaks.length, step = w / n;
    var bw = Math.max(1, step * 0.6);
    var mid = h / 2, maxH = h - 6, cut = ratio * n;
    for (var i = 0; i < n; i++) {
      var v = peaks[i]; if (v > 1) v = 1; if (v < 0) v = 0;
      var bh = Math.max(2, v * maxH);
      var x = i * step + (step - bw) / 2;
      ctx.fillStyle = (i < cut) ? LIME : (small ? BAR_IDLE_SM : BAR_IDLE);
      ctx.fillRect(x, mid - bh / 2, bw, bh);
    }
  }

  function idleWave() {
    var c = waveCanvas; if (!c) return;
    var w = c.clientWidth || 600, h = c.clientHeight || 46;
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }

  /* ==================== player ==================== */
  var audio = $("audio");
  var waveWrap = $("seek"), waveCanvas = $("waveCanvas"), seekText = $("seekText");
  var pCover = $("pCover"), pName = $("pName"), pSub = $("pSub");
  var tNow = $("tNow"), tRem = $("tRem");
  var playBtn = $("toggle"), prevBtn = $("prev"), nextBtn = $("next"), heroPlay = $("play");
  var muteBtn = $("mute"), volInput = $("vol"), player = $("player");
  var heroCd = $("heroCountdown");

  /* cur = index of the SELECTED track in NEW, or -1 for the neutral state.
     A teaser (not playable) can never be the active track. */
  var cur = -1;
  (function () {
    var raw = null;
    try { raw = localStorage.getItem(LS_TRACK); } catch (e) {}
    if (raw != null) {
      var si = parseInt(raw, 10);
      if (isFinite(si) && si >= 0 && si < NEW.length && isPlayable(NEW[si])) cur = si;
    }
  })();

  var rafId = 0, dragging = false;

  var vol = parseFloat(localStorage.getItem(LS_VOL));
  if (!isFinite(vol)) vol = 0.9; vol = Math.min(1, Math.max(0, vol));
  var muted = localStorage.getItem(LS_MUTE) === "1";
  audio.volume = vol; audio.muted = muted;
  volInput.value = String(vol);
  muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");

  function curTrack() { return cur >= 0 ? NEW[cur] : null; }

  function currentRatio() {
    var t = curTrack();
    if (!t) return 0;
    var d = audio.duration || t.duration || 0;
    return d ? Math.min(1, Math.max(0, audio.currentTime / d)) : 0;
  }

  function refreshWave() {
    if (cur < 0) { idleWave(); return; }
    var t = NEW[cur];
    var r = currentRatio();
    drawWave(waveCanvas, t.peaks, r, false);
    if (activeCanvas) drawWave(activeCanvas, t.peaks, r, true);
  }

  function updateTimes() {
    var t = curTrack();
    var ct = audio.currentTime || 0;
    var d = audio.duration || (t && t.duration) || 0;
    tNow.textContent = fmt(ct);
    tRem.textContent = "-" + fmt(Math.max(0, d - ct));
    var r = currentRatio();
    waveWrap.setAttribute("aria-valuenow", Math.round(r * 100));
    var txt = fmt(ct) + " из " + fmt(d);
    waveWrap.setAttribute("aria-valuetext", txt);
    seekText.textContent = txt;
  }

  function updateCards() {
    var playing = !audio.paused && !audio.error;
    cards.forEach(function (c) {
      var t = NEW[c.i];
      var active = (c.i === cur) && isPlayable(t);
      c.art.classList.toggle("is-active", active);
      c.art.classList.toggle("is-playing", active && playing);
      c.btn.setAttribute("aria-pressed", (active && playing) ? "true" : "false");
      if (isPlayable(t)) c.btn.setAttribute("aria-label", (active && playing ? "Пауза: " : "Слушать: ") + t.title);
    });
    activeCanvas = (cur >= 0 && cards[cur]) ? cards[cur].canvas : null;
    heroPlay.setAttribute("aria-pressed", (!audio.paused && isPlayable(NEW[0]) && cur === 0) ? "true" : "false");
  }

  function setButtonState(state) {
    // state: playing | paused | loading | error
    var isPlaying = state === "playing";
    playBtn.classList.toggle("playing", isPlaying);
    playBtn.classList.toggle("loading", state === "loading");
    playBtn.setAttribute("aria-label", isPlaying ? "Пауза" : "Воспроизвести");
    playBtn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
    heroPlay.classList.toggle("playing", isPlaying && cur === 0);
    heroPlay.classList.toggle("loading", state === "loading");
    player.classList.toggle("playing", isPlaying);
    player.classList.toggle("error", state === "error");
  }

  function syncMediaSession(t) {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title, artist: ARTIST, album: ARTIST + " · " + t.year,
        artwork: [{ src: t.cover, sizes: "512x512", type: "image/jpeg" }]
      });
    } catch (e) { /* ignore */ }
  }

  function renderMeta() {
    if (cur < 0) {
      pCover.style.backgroundImage = "none";
      pName.textContent = "Выберите трек";
      pSub.textContent = ARTIST;
      tRem.textContent = "-0:00";
      updateCards();
      return;
    }
    var t = NEW[cur];
    pCover.style.backgroundImage = "url('" + t.cover + "')";
    pName.textContent = t.title;
    pSub.textContent = ARTIST + " · " + t.year;
    tRem.textContent = "-" + fmt(t.duration);
    syncMediaSession(t);
    updateCards();
    refreshWave();
  }

  function loadTrack(i, autoplay) {
    if (i < 0 || i >= NEW.length || !isPlayable(NEW[i])) return;   /* teasers are never loaded */
    cur = i;
    var t = NEW[cur];
    audio.src = t.audio;          /* src set only at the moment of choosing */
    audio.load();
    try { localStorage.setItem(LS_TRACK, String(cur)); } catch (e) {}
    renderMeta();
    updateTimes();
    if (autoplay) play(); else setButtonState("paused");
  }

  function play() {
    if (cur < 0) { if (playableIdx.length) loadTrack(playableIdx[0], true); return; }
    if (!audio.src) { loadTrack(cur, false); if (!audio.src) return; }
    setButtonState("loading");
    var p = audio.play();
    if (p && p.catch) p.catch(function () { setButtonState(audio.paused ? "paused" : "playing"); });
  }
  function pause() { audio.pause(); }
  function toggle() { if (audio.paused) play(); else pause(); }

  /* queue walks ONLY playable tracks (teaser excluded) */
  function step(dir) {
    if (!playableIdx.length) return;
    var pos = playableIdx.indexOf(cur);
    if (pos < 0) { loadTrack(dir > 0 ? playableIdx[0] : playableIdx[playableIdx.length - 1], true); return; }
    var np = (pos + dir + playableIdx.length) % playableIdx.length;
    loadTrack(playableIdx[np], true);
  }
  function nextTrack() { step(1); }
  function prevTrack() { step(-1); }

  function nudge(i) {
    var rec = cards[i]; if (!rec) return;
    rec.art.classList.remove("is-nudge");
    void rec.art.offsetWidth;            /* restart animation */
    rec.art.classList.add("is-nudge");
    setTimeout(function () { rec.art.classList.remove("is-nudge"); }, 700);
  }

  function onCardClick(i) {
    var t = NEW[i];
    if (!isPlayable(t)) { nudge(i); return; }   /* teaser: no audio, just a reaction */
    if (i === cur) { if (audio.paused) play(); else pause(); }
    else loadTrack(i, true);
  }

  /* ==================== teaser UI (live countdown) ==================== */
  function cell(id, lab) { return '<span class="cd-cell"><b id="' + id + '">0</b><span class="cd-lab">' + lab + '</span></span>'; }
  function setTxt(id, v) { var e = $(id); if (e) e.textContent = String(v); }

  function buildHeroCells(left) {
    if (!heroCd.dataset.built) {
      heroCd.innerHTML = cell("cdD", "дней") + cell("cdH", "часов") + cell("cdM", "минут") + cell("cdS", "секунд");
      heroCd.dataset.built = "1";
    }
    var p = parts(left);
    setTxt("cdD", p.d); setTxt("cdH", pad2(p.h)); setTxt("cdM", pad2(p.m)); setTxt("cdS", pad2(p.s));
  }

  function renderHeroTeaser() {
    var t = featured, m = releaseMs(t);
    var label = heroPlay.querySelector(".label");
    /* `soon` sets the locked/disabled look WITHOUT touching the countdown block */
    var soon = function (text, aria) {
      heroPlay.disabled = true; heroPlay.classList.add("is-soon");
      heroPlay.setAttribute("aria-disabled", "true");
      heroPlay.setAttribute("aria-label", aria);
      if (label) label.textContent = text;
    };
    var open = function () {
      heroCd.hidden = true;
      heroPlay.disabled = false; heroPlay.classList.remove("is-soon");
      heroPlay.setAttribute("aria-disabled", "false");
      heroPlay.setAttribute("aria-label", "Слушать: " + t.title);
      if (label) label.textContent = "Слушать";
    };
    var d = releaseLabel(t);
    if (m == null || isPlayable(t)) { open(); return; }
    var left = m - Date.now();
    if (left > 0) {
      heroCd.hidden = false;
      buildHeroCells(left);
      soon("Скоро — " + d, "Премьера " + d + ". Воспроизведение пока недоступно");
    } else {
      heroCd.hidden = true;
      soon("Премьера состоялась — обновите страницу",
        "Премьера состоялась. Обновите страницу, чтобы слушать " + t.title);
    }
  }

  function upgradeCard(rec) {
    var t = NEW[rec.i];
    rec.art.classList.remove("is-teaser", "is-past", "is-nudge");
    rec.art.innerHTML = playableInner(t);
    wireCard(rec);
  }

  function renderCardTeasers() {
    cards.forEach(function (rec) {
      var t = NEW[rec.i];
      if (releaseMs(t) == null) return;                          /* no date → normal track */
      var left = releaseMs(t) - Date.now();
      var badge = rec.art.querySelector(".tc-badge");
      var count = rec.art.querySelector(".tc-count");
      if (left > 0) {
        rec.art.classList.add("is-teaser"); rec.art.classList.remove("is-past");
        if (badge) badge.textContent = "скоро";                  /* badge = status */
        if (count) count.textContent = compactCountdown(left);   /* compact live timer */
        rec.btn.setAttribute("aria-disabled", "true");
        rec.btn.setAttribute("aria-label", "Анонс: " + t.title + ". Премьера " + releaseLabel(t) + ". Воспроизведение пока недоступно");
      } else if (isPlayable(t)) {
        if (rec.art.classList.contains("is-teaser")) upgradeCard(rec);
      } else {
        rec.art.classList.add("is-teaser", "is-past");
        if (badge) badge.textContent = "премьера состоялась";
        if (count) count.textContent = "обновите страницу";
        rec.btn.setAttribute("aria-label", t.title + ": премьера состоялась. Обновите страницу, чтобы слушать.");
      }
    });
  }

  function updateTeaserUI() {
    recomputePlayable();
    renderHeroTeaser();
    renderCardTeasers();
    updateCards();
  }

  /* rAF progress */
  function startRaf() { if (!rafId) rafId = requestAnimationFrame(loop); }
  function stopRaf() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
  function loop() { rafId = requestAnimationFrame(loop); updateTimes(); refreshWave(); }

  /* audio events */
  audio.addEventListener("play", function () { setButtonState("playing"); updateCards(); startRaf(); });
  audio.addEventListener("pause", function () { setButtonState("paused"); updateCards(); stopRaf(); updateTimes(); refreshWave(); });
  audio.addEventListener("playing", function () { setButtonState("playing"); updateCards(); });
  audio.addEventListener("waiting", function () { if (!audio.paused) setButtonState("loading"); });
  audio.addEventListener("loadedmetadata", function () { updateTimes(); refreshWave(); });
  audio.addEventListener("ended", function () { nextTrack(); });
  audio.addEventListener("error", function () { stopRaf(); setButtonState("error"); updateTimes(); });
  audio.addEventListener("timeupdate", function () { if (audio.paused) { updateTimes(); refreshWave(); } });

  /* controls */
  playBtn.addEventListener("click", toggle);
  prevBtn.addEventListener("click", prevTrack);
  nextBtn.addEventListener("click", nextTrack);
  heroPlay.addEventListener("click", function () {
    if (!isPlayable(featured)) return;    /* locked teaser: do nothing */
    if (cur !== 0) loadTrack(0, true); else toggle();
  });

  /* seek: click + drag */
  function ratioFromX(clientX) {
    var r = waveWrap.getBoundingClientRect();
    return r.width ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
  }
  function applySeek(ratio) {
    var t = curTrack(); if (!t) return;
    var d = audio.duration || t.duration || 0;
    if (d) audio.currentTime = ratio * d;
    updateTimes(); refreshWave();
  }
  waveWrap.addEventListener("pointerdown", function (e) {
    if (cur < 0) return;
    if (!audio.src) loadTrack(cur, false);
    dragging = true; waveWrap.classList.add("dragging");
    try { waveWrap.setPointerCapture(e.pointerId); } catch (err) {}
    applySeek(ratioFromX(e.clientX));
  });
  waveWrap.addEventListener("pointermove", function (e) { if (dragging) applySeek(ratioFromX(e.clientX)); });
  function endDrag() { if (dragging) { dragging = false; waveWrap.classList.remove("dragging"); } }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* seek keyboard */
  waveWrap.addEventListener("keydown", function (e) {
    var t = curTrack(); if (!t) return;
    var d = audio.duration || t.duration || 0;
    if (e.key === "ArrowRight") { e.preventDefault(); audio.currentTime = Math.min(d, (audio.currentTime || 0) + 5); updateTimes(); refreshWave(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); updateTimes(); refreshWave(); }
  });

  /* global keyboard: Space = toggle, arrows = ±5s */
  document.addEventListener("keydown", function (e) {
    var tg = e.target || {};
    var tag = (tg.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tg.isContentEditable) return;
    if (tag === "BUTTON" || tag === "A") return;   /* let native activation win */
    if (tg === waveWrap && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return; /* seek owns its arrows */
    var t = curTrack();
    if (e.code === "Space" || e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); if (t) { if (!audio.src) loadTrack(cur, false); audio.currentTime = Math.min(audio.duration || t.duration || 0, (audio.currentTime || 0) + 5); updateTimes(); refreshWave(); } }
    else if (e.key === "ArrowLeft") { e.preventDefault(); if (t) { if (!audio.src) loadTrack(cur, false); audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); updateTimes(); refreshWave(); } }
  });

  /* volume + mute */
  volInput.addEventListener("input", function () {
    vol = Math.min(1, Math.max(0, parseFloat(volInput.value) || 0));
    audio.volume = vol;
    if (vol > 0 && muted) { muted = false; audio.muted = false; muteBtn.setAttribute("aria-pressed", "false"); }
    try { localStorage.setItem(LS_VOL, String(vol)); } catch (e) {}
  });
  muteBtn.addEventListener("click", function () {
    muted = !muted; audio.muted = muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    try { localStorage.setItem(LS_MUTE, muted ? "1" : "0"); } catch (e) {}
  });

  /* Media Session */
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", play);
      navigator.mediaSession.setActionHandler("pause", pause);
      navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
      navigator.mediaSession.setActionHandler("previoustrack", prevTrack);
    } catch (e) { /* ignore */ }
  }

  /* redraw on resize / after layout settles */
  function redrawAll() {
    if (cur < 0) { idleWave(); return; }
    refreshWave();
    cards.forEach(function (c) {
      var t = NEW[c.i];
      if (!t.peaks) return;
      if (c.canvas !== activeCanvas) drawWave(c.canvas, t.peaks, 0, true);
    });
    if (activeCanvas) drawWave(activeCanvas, NEW[cur].peaks, currentRatio(), true);
  }
  window.addEventListener("resize", redrawAll);
  if (document.readyState === "complete") setTimeout(redrawAll, 0);
  window.addEventListener("load", function () { setTimeout(redrawAll, 0); });

  /* init: restore selected track (src only, no autoplay); teaser → neutral */
  updateTeaserUI();
  setInterval(updateTeaserUI, 1000);
  if (cur >= 0) loadTrack(cur, false);
  else { renderMeta(); idleWave(); }
  updateTimes();
})();
