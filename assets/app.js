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
  var LS_FAV = "breshia:fav";   /* личная подборка: JSON-массив слагов в порядке добавления */

  /* honour the OS "reduce motion" setting: swap instantly instead of fading */
  var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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

  /* ==================== входной тизер-хук (привязан к анонсу премьеры) ====================
     Короткий фрагмент припева (≈20 с) играет ТОЛЬКО по нажатию человека — ни автоплея, ни
     пилюли при входе. Хук привязан к первой видимой песне — анонсу «Девочка с лопатой»: пока
     трек-источник не вышел, кнопка play в hero и клик по карточке анонса запускают #hookAudio.
     Элемент отдельный — основной плеер (#audio), его очередь, избранное и медиасессию не трогаем.
     Анонс НЕ входит в очередь (prev/next его не берут, ♥ на нём нет, в подборку не попадает).
     Нет хука в данных (трек вышел) — всё работает как обычно: анонс просто стал полным треком. */
  var HOOK = B.hook || null;
  var hookEl = $("hookAudio");
  var hookIdx = -1;             /* индекс анонса-хука в NEW; -1 — хука на сайте нет */
  var hookPlaying = false;      /* прямо сейчас звучит */
  var hookSel = false;          /* выбран/на паузе после запуска — для подсветки карточки */
  var hookRaf = 0;

  if (hookEl && HOOK && HOOK.audio) {
    hookEl.src = HOOK.audio;
    hookEl.preload = "auto";
    for (var hookScan = 0; hookScan < NEW.length; hookScan++) {
      if (NEW[hookScan].slug === HOOK.track && isDatedTeaser(NEW[hookScan])) { hookIdx = hookScan; break; }
    }
  }
  function hasHook() { return hookIdx >= 0 && !!(HOOK && HOOK.audio) && !!hookEl; }
  function isHookTrack(t) { return !!t && hookIdx >= 0 && NEW[hookIdx] === t; }
  function hookPeaks() { return (HOOK && HOOK.peaks) || (hookIdx >= 0 ? NEW[hookIdx].peaks : null); }
  function hookDuration() {
    var d = hookEl && hookEl.duration;
    if (d && isFinite(d) && d > 0) return d;
    return (HOOK && HOOK.duration) || 0;
  }
  function hookRatio() {
    var d = hookDuration();
    return d ? Math.min(1, Math.max(0, ((hookEl && hookEl.currentTime) || 0) / d)) : 0;
  }

  function paintHookBar() {
    var bar = $("heroHookBar"), fill = $("heroHookFill");
    if (!bar || !fill) return;
    bar.hidden = !(hasHook() && (hookSel || hookPlaying));
    fill.style.width = Math.round(hookRatio() * 100) + "%";
  }

  /* состояние карточки анонса и кнопки hero — считаем от реального состояния элемента */
  function paintHook() {
    if (!hasHook()) return;
    var t = NEW[hookIdx], rec = cards[hookIdx];
    var live = hookPlaying && hookEl && !hookEl.paused;
    if (rec && rec.art) {
      rec.art.classList.toggle("is-active", hookSel || live);
      rec.art.classList.toggle("is-playing", live);
      if (rec.btn) {
        rec.btn.setAttribute("aria-pressed", live ? "true" : "false");
        rec.btn.setAttribute("aria-label", (live ? "Пауза: тизер " : "Послушать тизер: ") + t.title);
      }
    }
    if (isHookTrack(featured) && heroPlay) {
      heroPlay.classList.toggle("hookon", live);
      heroPlay.setAttribute("aria-pressed", live ? "true" : "false");
      var lab = heroPlay.querySelector(".label");
      if (lab) lab.textContent = live ? "Пауза · тизер" : ("Тизер · припев — " + ((HOOK.durationText) || "0:20"));
    }
    paintHookBar();
  }

  function paintHookProgress() {
    if (!hasHook()) return;
    var rec = cards[hookIdx];
    if (rec && rec.canvas) drawWave(rec.canvas, hookPeaks(), hookRatio(), true);
    paintHookBar();
  }

  function hookDrawLoop() { hookRaf = requestAnimationFrame(hookDrawLoop); paintHookProgress(); }
  function hookRafStart() { if (!hookRaf) hookRaf = requestAnimationFrame(hookDrawLoop); }
  function hookRafStop() { if (hookRaf) { cancelAnimationFrame(hookRaf); hookRaf = 0; } }

  function hookStop() {          /* глушим хук совсем — человек запустил обычный трек */
    if (!hookEl) return;
    try { hookEl.pause(); } catch (e) {}
    try { if (hookEl.currentTime) hookEl.currentTime = 0; } catch (e) {}
    hookPlaying = false; hookSel = false; hookRafStop();
    paintHook();
  }
  function hookToggle() {
    if (!hasHook() || !hookEl) return;
    if (!hookEl.paused) { try { hookEl.pause(); } catch (e) {} return; }
    if (!audio.paused) { try { audio.pause(); } catch (e) {} }   /* не звучим поверх трека */
    if (hookDuration() && (hookEl.ended || hookEl.currentTime >= hookDuration() - 0.05)) {
      try { hookEl.currentTime = 0; } catch (e) {}              /* после конца — с начала, но только по нажатию */
    }
    hookSel = true;
    var p;
    try { p = hookEl.play(); } catch (e) { p = null; }
    if (p && p.catch) p.catch(function () { hookPlaying = false; hookSel = false; paintHook(); });
  }

  if (hookEl) {
    hookEl.addEventListener("play", function () { hookPlaying = true; hookSel = true; paintHook(); hookRafStart(); });
    hookEl.addEventListener("pause", function () { hookPlaying = false; hookRafStop(); paintHook(); });
    hookEl.addEventListener("ended", function () { hookPlaying = false; hookSel = false; hookRafStop(); paintHook(); });   /* доиграл — тишина, без перезапуска */
    hookEl.addEventListener("timeupdate", function () { if (hookEl.paused) paintHookProgress(); });
    hookEl.addEventListener("error", function () { hookPlaying = false; hookSel = false; paintHook(); });
  }

  /* ==================== избранное — состояние (localStorage) ==================== */
  var fav = [];   /* слаги в порядке добавления */
  (function loadFav() {
    try {
      var raw = localStorage.getItem(LS_FAV);
      if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) fav = a.filter(function (s) { return typeof s === "string"; }); }
    } catch (e) { /* нет localStorage / битые данные — стартуем с пустой подборки */ }
  })();
  function favSave() { try { localStorage.setItem(LS_FAV, JSON.stringify(fav)); } catch (e) {} }
  function trackIndex(slug) { for (var i = 0; i < NEW.length; i++) if (NEW[i].slug === slug) return i; return -1; }
  function favIdx(slug) { return fav.indexOf(slug); }
  function isFav(slug) { return favIdx(slug) >= 0; }
  function favIndices() { return fav.map(trackIndex).filter(function (i) { return i >= 0; }); }
  function favTracks() { return favIndices().map(function (i) { return NEW[i]; }); }
  function durSec(t) {
    var m = /^(\d+):(\d{2})$/.exec(String((t && t.durationText) || ""));
    return m ? (+m[1]) * 60 + (+m[2]) : ((t && t.duration) || 0);
  }
  function favStats() {
    var ts = favTracks(), sec = 0;
    ts.forEach(function (t) { sec += durSec(t); });
    return { n: ts.length, min: ts.length ? Math.max(1, Math.round(sec / 60)) : 0 };
  }

  /* ♥ — кнопка в правом верхнем углу карточки (цель 44×44), отдельная от .tc-hit */
  function favBtnHTML(t) {
    var on = isFav(t.slug);
    return '<button class="fav-btn' + (on ? " on" : "") + '" type="button" data-fav="' + esc(t.slug) + '"' +
      ' aria-pressed="' + (on ? "true" : "false") + '"' +
      ' aria-label="' + (on ? "Убрать из подборки: " : "Добавить в подборку: ") + esc(t.title) + '"' +
      ' title="' + (on ? "Убрать из подборки" : "Добавить в подборку") + '">' +
      '<svg viewBox="2 3 20 18.35" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
    '</button>';
  }

  /* ==================== static content ==================== */
  function minYear() { var y = Infinity; NEW.concat(ARCHIVE).forEach(function (t) { if (t && t.year < y) y = t.year; }); return isFinite(y) ? y : ""; }

  var featured = NEW[0];
  $("heroArt").style.backgroundImage = "url('" + featured.cover + "')";
  var hc = $("heroCover");
  hc.src = featured.cover;
  var heroFeat = featured.feat ? " feat. " + featured.feat : "";
  hc.alt = "Обложка «" + featured.title + "» (" + featured.year + ")" + heroFeat;
  $("heroCap").textContent = featured.title + heroFeat + " · " + featured.year;
  $("heroLine").textContent = featured.year + " · " + featured.title + heroFeat;
  var heroPrefix = isDatedTeaser(featured) ? ("Премьера " + releaseLabel(featured) + " · ") : "";
  $("heroStats").textContent =
    heroPrefix +
    NEW.length + " " + plural(NEW.length, "трек", "трека", "треков") +
    " · " + ARCHIVE.length + " " + plural(ARCHIVE.length, "ранний релиз", "ранних релиза", "ранних релизов") +
    " · с " + minYear();
  $("footSite").textContent = SITE;

  /* ==================== lyrics block (flag-driven) ==================== */
  /* window.BRESHIA.lyrics.enabled === false  →  remove the #lyrics section and
     renumber the remaining section counters. Flip the flag back to true and the
     block plus its numbering return with no code change. */
  var LYR = B.lyrics || {};
  var lyricsOn = (LYR.enabled === true) || (B.lyricsEnabled === true);
  if (!lyricsOn) {
    var lsec = $("lyrics");
    if (lsec && lsec.parentNode) lsec.parentNode.removeChild(lsec);
  }
  var lyricsNoteEl = $("lyricsNote");
  if (lyricsNoteEl) lyricsNoteEl.textContent = B.lyricsNote || LYR.note || "";
  /* relabel "NN / Label" sequentially over the sections that remain in the DOM */
  (function renumberSections() {
    var nEls = document.querySelectorAll("main > section .sec-head .n");
    for (var k = 0; k < nEls.length; k++) {
      var raw = nEls[k].textContent || "";
      var m = /^\s*\d+\s*\/\s*([\s\S]*)$/.exec(raw);
      var lbl = m ? m[1] : raw.replace(/^\s+|\s+$/g, "");
      var num = k + 1;
      nEls[k].textContent = (num < 10 ? "0" : "") + num + " / " + lbl;
    }
  })();

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

  /* подпись под названием: год · альбом · длительность (что есть, то и показываем) */
  function subLine(t) {
    return [t.year || null, t.album || null, t.durationText || null].filter(Boolean).join(" · ");
  }

  /* фит — ОТДЕЛЬНОЙ строкой под названием, приглушённый; акцент остаётся на названии.
     Строка своя (а не «в хвосте» названия), потому что заголовок обрезается многоточием:
     в хвосте фит пропадал бы целиком на узких карточках. */
  function featLine(t) {
    return (t && t.feat) ? '<p class="tc-feat">feat. ' + esc(t.feat) + "</p>" : "";
  }

  function playableInner(t) {
    return '<img class="cover" src="' + esc(t.cover) + '" alt="Обложка «' + esc(t.title) + '»" width="96" height="96" loading="lazy" decoding="async">' +
      '<div class="tc-body">' +
        '<h3 class="tc-title">' + esc(t.title) + '</h3>' +
        featLine(t) +
        '<p class="tc-sub">' + esc(subLine(t)) + '</p>' +
      '</div>' +
      '<canvas class="tc-wave" aria-hidden="true"></canvas>' +
      '<div class="tc-right">' +
        '<span class="tc-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
        '<span class="tc-dur">' + esc(t.durationText) + '</span>' +
        '<span class="tc-play" aria-hidden="true"></span>' +
      '</div>' +
      favBtnHTML(t) +
      '<button class="tc-hit" type="button" aria-label="Слушать: ' + esc(t.title) + '" aria-pressed="false"></button>';
  }

  function teaserInner(t) {
    return '<img class="cover" src="' + esc(t.cover) + '" alt="Обложка «' + esc(t.title) + '»" width="96" height="96" loading="lazy" decoding="async">' +
      '<div class="tc-body">' +
        '<h3 class="tc-title">' + esc(t.title) + '</h3>' +
        featLine(t) +
        '<p class="tc-sub">' + esc(subLine(t)) + " · премьера " + esc(releaseLabel(t)) + '</p>' +
      '</div>' +
      '<div class="tc-right tc-locked">' +
        '<span class="tc-badge"></span>' +
        '<span class="tc-count" aria-hidden="true"></span>' +
        '<span class="tc-lock" aria-hidden="true">🔒</span>' +
      '</div>' +
      favBtnHTML(t) +
      '<button class="tc-hit" type="button" aria-disabled="true" ' +
        'aria-label="Анонс: ' + esc(t.title) + '. Премьера ' + esc(releaseLabel(t)) + '. Воспроизведение пока недоступно"></button>';
  }

  /* анонс премьеры, у которого есть хук: карточка выглядит и ведёт себя как обычная
     (курсор, подъём, волна, эквалайзер, прогресс), но подпись честно помечает её тизером,
     а не релизом; ♥ нет — в подборку анонс не добавляется */
  function hookCardInner(t) {
    var dur = (HOOK && HOOK.durationText) || "0:20";
    var sub = (t.year ? t.year + " · " : "") + "тизер · припев · " + dur +
              " · премьера " + releaseLabel(t);
    return '<img class="cover" src="' + esc(t.cover) + '" alt="Обложка «' + esc(t.title) + '»" width="96" height="96" loading="lazy" decoding="async">' +
      '<div class="tc-body">' +
        '<h3 class="tc-title">' + esc(t.title) + '</h3>' +
        featLine(t) +
        '<p class="tc-sub">' + sub + '</p>' +
      '</div>' +
      '<canvas class="tc-wave" aria-hidden="true"></canvas>' +
      '<div class="tc-right">' +
        '<span class="tc-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
        '<span class="tc-dur">' + esc(dur) + '</span>' +
        '<span class="tc-play" aria-hidden="true"></span>' +
      '</div>' +
      '<button class="tc-hit" type="button" aria-label="Послушать тизер: ' + esc(t.title) + ' — 20 секунд припева"></button>';
  }

  function wireCard(rec) {
    rec.btn = rec.art.querySelector(".tc-hit");
    rec.canvas = rec.art.querySelector(".tc-wave");
    /* ♥ гасит всплытие: клик по нему меняет подборку и НЕ запускает трек
       (иначе всплыл бы до делегированного обработчика карточки) */
    var fb = rec.art.querySelector(".fav-btn");
    if (fb) fb.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleFav(this.getAttribute("data-fav"));
    });
    /* delegate on the card so a click anywhere (card or overlay button) plays */
    rec.art.addEventListener("click", function () { onCardClick(rec.i); });
  }

  (function () {
    var box = $("newList");
    NEW.forEach(function (t, i) {
      var art = mk("article", "track-card");
      art.setAttribute("data-i", i);
      if (isHookTrack(t) && hasHook()) {
        art.classList.add("is-hook");
        art.innerHTML = hookCardInner(t);
      } else if (isDatedTeaser(t)) {
        art.classList.add("is-teaser");
        art.innerHTML = teaserInner(t);
      } else {
        art.innerHTML = playableInner(t);
      }
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

  /* --- player cover crossfade: two stacked layers, never an instant swap --- */
  var coverLayers = pCover ? Array.prototype.slice.call(pCover.querySelectorAll(".np-cover")) : [];
  var coverCur = 0;
  if (coverLayers.length) {
    coverLayers[0].classList.add("is-on");
    coverLayers.forEach(function (el) {
      el.addEventListener("transitionend", function (e) {
        if (e.propertyName !== "opacity") return;
        if (!el.classList.contains("is-on")) el.style.backgroundImage = "none"; /* drop the faded-out art */
      });
    });
  }
  function setCover(url) {
    if (!coverLayers.length) {                       /* fallback: single layer */
      if (pCover) pCover.style.backgroundImage = url ? "url('" + url + "')" : "none";
      return;
    }
    var active = coverLayers[coverCur];
    var next = coverLayers[1 - coverCur];
    if (!url) {                                      /* neutral state */
      active.classList.remove("is-on");
      next.classList.remove("is-on");
      return;
    }
    next.style.backgroundImage = "url('" + url + "')";
    void next.offsetWidth;                           /* flush style so it fades from 0 */
    next.classList.add("is-on");
    active.classList.remove("is-on");
    coverCur = 1 - coverCur;                         /* the two layers trade places */
  }

  /* --- waveform: soften the redraw on a track switch by fading the canvas --- */
  var waveTimer = 0;
  function waveFlash() {
    if (!waveCanvas) return;
    if (REDUCE_MOTION) { waveCanvas.style.opacity = ""; return; }
    waveCanvas.style.opacity = "0";
    if (waveTimer) clearTimeout(waveTimer);
    waveTimer = setTimeout(function () { waveTimer = 0; waveCanvas.style.opacity = ""; }, 130);
  }
  var playBtn = $("toggle"), prevBtn = $("prev"), nextBtn = $("next"), heroPlay = $("play");
  var muteBtn = $("mute"), volInput = $("vol"), player = $("player");
  var heroCd = $("heroCountdown");

  /* cur = index of the SELECTED track in NEW, or -1 for the neutral state.
     A teaser (not playable) can never be the active track. */
  var cur = -1;
  /* очередь плеера: по умолчанию — все играющие треки каталога; подборка/чужая
     подборка подставляют свой список, чтобы prev/next и «дальше» шли по нему */
  var altQueue = null;
  var queueMode = null;   /* "fav" — очередь подборки: ПЕРЕСОБИРАЕТСЯ перед каждым шагом, иначе
                             треки, добавленные в подборку во время прослушивания, в next/prev не попадают */
  function favQueue() { return favIndices().filter(function (k) { return isPlayable(NEW[k]); }); }
  function activeQueue() {
    if (queueMode === "fav") altQueue = favQueue();
    return (altQueue && altQueue.length) ? altQueue : playableIdx;
  }
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
      if (isHookTrack(t)) return;               /* анонс-хук живёт своим состоянием (paintHook) */
      var active = (c.i === cur) && isPlayable(t);
      c.art.classList.toggle("is-active", active);
      c.art.classList.toggle("is-playing", active && playing);
      c.btn.setAttribute("aria-pressed", (active && playing) ? "true" : "false");
      if (isPlayable(t)) c.btn.setAttribute("aria-label", (active && playing ? "Пауза: " : "Слушать: ") + t.title);
    });
    activeCanvas = (cur >= 0 && cards[cur]) ? cards[cur].canvas : null;
    paintFavCur();
    heroPlay.setAttribute("aria-pressed", (hookPlaying || (!audio.paused && isPlayable(NEW[0]) && cur === 0)) ? "true" : "false");
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
        title: t.title, artist: t.feat ? (ARTIST + " feat. " + t.feat) : ARTIST, album: ARTIST + " · " + t.year,
        artwork: [{ src: t.cover, sizes: "512x512", type: "image/jpeg" }]
      });
    } catch (e) { /* ignore */ }
  }

  function renderMeta() {
    if (cur < 0) {
      setCover(null);
      pName.textContent = "Выберите трек";
      pSub.textContent = ARTIST;
      tRem.textContent = "-0:00";
      updateCards();
      return;
    }
    var t = NEW[cur];
    setCover(t.cover);
    pName.textContent = t.title;
    pSub.textContent = ARTIST + " · " + t.year;
    tRem.textContent = "-" + fmt(t.duration);
    syncMediaSession(t);
    updateCards();
    refreshWave();
    refreshShare();
  }

  function loadTrack(i, autoplay) {
    if (i < 0 || i >= NEW.length || !isPlayable(NEW[i])) return;   /* teasers are never loaded */
    if (i !== cur) { try { mMaybeSkip(cur); } catch (e) {} }       /* метрика: ушли раньше 15 секунд */
    cur = i;
    var t = NEW[cur];
    waveFlash();                 /* dim the wave so new peaks don't pop in */
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
    var q = activeQueue();
    if (!q.length) return;
    var pos = q.indexOf(cur);
    if (pos < 0) { loadTrack(dir > 0 ? q[0] : q[q.length - 1], true); return; }
    var np = (pos + dir + q.length) % q.length;
    loadTrack(q[np], true);
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
    if (isHookTrack(t) && hasHook()) { hookToggle(); return; }   /* анонс: играем/пауза хука */
    if (!isPlayable(t)) { nudge(i); return; }   /* teaser без хука: no audio, just a reaction */
    altQueue = null;                            /* клик по каталогу — обычная очередь */
    queueMode = null;
    if (i === cur) { if (audio.paused) play(); else pause(); }
    else loadTrack(i, true);
  }

  /* ==================== избранное — секция «Моя подборка» ==================== */
  var favList = $("favList"), favEmpty = $("favEmpty"), favN = $("favN"), favL = $("favL"), favListenBtn = $("favListen");

  function updateFavBtn(btn) {
    var slug = btn.getAttribute("data-fav");
    var on = isFav(slug), i = trackIndex(slug), t = i >= 0 ? NEW[i] : null;
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", (on ? "Убрать из подборки: " : "Добавить в подборку: ") + (t ? t.title : ""));
    btn.title = on ? "Убрать из подборки" : "Добавить в подборку";
  }
  function paintHearts() {
    var btns = document.querySelectorAll("#newList .fav-btn");
    for (var k = 0; k < btns.length; k++) updateFavBtn(btns[k]);
  }

  function rowSub(t) {
    return [t.year || null, t.album || null, (t.feat ? "при уч. " + t.feat : null), t.durationText || null]
      .filter(Boolean).join(" · ");
  }

  function renderFav() {
    if (!favList) return;
    var items = favTracks(), st = favStats();
    if (favN) favN.textContent = String(st.n);
    if (favL) favL.textContent = st.n + " " + plural(st.n, "трек", "трека", "треков") + " · " + st.min + " мин";
    if (favListenBtn) favListenBtn.disabled = st.n === 0;
    favList.innerHTML = items.map(function (t) {
      var i = trackIndex(t.slug), playable = i >= 0 && isPlayable(NEW[i]);
      return '<li class="fav-row' + (i === cur ? " is-cur" : "") + '" data-slug="' + esc(t.slug) + '"' +
        (playable ? ' tabindex="0" aria-label="Слушать: ' + esc(t.title) + '"' : "") + '>' +
        '<span class="fr-cover" style="background-image:url(\'' + t.cover + '\')"></span>' +
        '<span class="fr-body"><span class="fr-title">' + esc(t.title) + '</span>' +
          '<span class="fr-sub">' + esc(rowSub(t)) + '</span></span>' +
        (playable
          ? '<button class="fr-play" type="button" data-play="' + esc(t.slug) + '" aria-label="Слушать: ' + esc(t.title) + '">' +
            '<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="M3 2l9 5-9 5z"/></svg></button>'
          : '') +
        '<button class="fr-x" type="button" data-remove="' + esc(t.slug) + '" aria-label="Убрать из подборки: ' + esc(t.title) + '" title="Убрать">✕</button>' +
      '</li>';
    }).join("");
    favEmpty.hidden = st.n !== 0;
    favList.hidden = st.n === 0;
  }

  /* подсветка строки, которая сейчас играет — без перерисовки всего списка */
  function paintFavCur() {
    if (!favList) return;
    var rows = favList.querySelectorAll(".fav-row");
    for (var k = 0; k < rows.length; k++) {
      rows[k].classList.toggle("is-cur", trackIndex(rows[k].getAttribute("data-slug")) === cur);
    }
  }

  function toggleFav(slug) {
    var i = favIdx(slug);
    if (i >= 0) fav.splice(i, 1); else fav.push(slug);
    favSave();
    paintHearts();
    renderFav();
    renderSharePl();
  }

  function playFavSlug(slug) {
    var i = trackIndex(slug);
    if (i < 0 || !isPlayable(NEW[i])) return;
    queueMode = "fav";
    altQueue = favQueue();
    loadTrack(i, true);
  }

  /* клик по ЛЮБОМУ месту строки = переключение на этот трек: на телефоне (≤430 px)
     кнопка .fr-play скрыта, и до этого в подборке нельзя было выбрать трек вообще */
  if (favList) favList.addEventListener("click", function (e) {
    var rm = e.target.closest(".fr-x");
    if (rm) { e.preventDefault(); toggleFav(rm.getAttribute("data-remove")); return; }
    var row = e.target.closest(".fav-row");
    if (!row) return;
    var slug = row.getAttribute("data-slug");
    var i = trackIndex(slug);
    if (i < 0 || !isPlayable(NEW[i])) return;
    e.preventDefault();
    if (i === cur) { if (audio.paused) play(); else pause(); return; }   /* повторный клик по играющему — пауза */
    playFavSlug(slug);
  });
  if (favList) favList.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    var row = e.target.closest(".fav-row");
    if (!row || !row.hasAttribute("tabindex")) return;   /* реагируем только на строку в фокусе */
    if (e.target.closest(".fr-x")) return;
    e.preventDefault();
    row.click();
  });
  if (favListenBtn) favListenBtn.addEventListener("click", function () {
    var q = favQueue();                                                         /* порядок добавления */
    if (!q.length) return;
    queueMode = "fav";
    altQueue = q;
    loadTrack(q[0], true);
  });

  /* ==================== шеринг из плеера ==================== */
  var shareBtn = $("shareBtn"), shareSheet = $("shareSheet"), psheet = $("psheet"), shareScrim = $("shareScrim");
  var shareTabs = shareSheet ? shareSheet.querySelectorAll(".sh-tabs button[data-tab]") : [];
  var sharePanes = shareSheet ? shareSheet.querySelectorAll(".pane[data-pane]") : [];
  var shareCover = $("shareCover"), shareTitle = $("shareTitle"), shareSub = $("shareSub");
  var shareSongLink = $("shareSongLink"), shareSongCopy = $("shareSongCopy"), shareSongNote = $("shareSongNote");
  var shareStack = $("shareStack"), sharePlSub = $("sharePlSub"), sharePlFull = $("sharePlFull");
  var sharePlEmpty = $("sharePlEmpty"), sharePlLink = $("sharePlLink"), sharePlList = $("sharePlList");

  function siteOrigin() { return "https://" + SITE; }
  function songUrl(t) { return (t && t.slug) ? siteOrigin() + "/t/" + t.slug + "/" : ""; }
  function playlistSlugs() { return fav.filter(function (s) { return trackIndex(s) >= 0; }); }
  function playlistUrl() {
    var s = playlistSlugs();
    return s.length ? siteOrigin() + "/#p=" + s.join(",") : "";
  }

  /* копирование: Clipboard API, при отказе (file://, старый браузер) — выделение + execCommand.
     Никогда не бросает ошибку в консоль. */
  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      if (!btn.getAttribute("data-orig")) btn.setAttribute("data-orig", btn.textContent.trim());
      btn.classList.add("done");
      btn.textContent = "Скопировано";
      clearTimeout(btn._t);
      btn._t = setTimeout(function () {
        btn.classList.remove("done");
        btn.textContent = btn.getAttribute("data-orig");
      }, 1900);
    }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", "");
        ta.style.position = "fixed"; ta.style.top = "-1000px"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select(); try { ta.setSelectionRange(0, ta.value.length); } catch (e1) {}
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e2) { /* молча: копирование не критично */ }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); done(); });
      } else { fallback(); done(); }
    } catch (e3) { fallback(); done(); }
  }

  function renderShareSong() {
    var t = curTrack();
    if (!t) {
      if (shareCover) shareCover.setAttribute("src", "");
      if (shareTitle) shareTitle.textContent = "Трек не выбран";
      if (shareSub) shareSub.textContent = "Сначала включи любую песню";
      if (shareSongLink) shareSongLink.value = "";
      if (shareSongCopy) shareSongCopy.disabled = true;
      if (shareSongNote) { shareSongNote.hidden = false; shareSongNote.textContent = "Пока ничего не выбрано — включи трек в каталоге, и здесь появится его ссылка."; }
      return;
    }
    var sub = [ARTIST, t.year || null, t.album || null, t.durationText || null].filter(Boolean).join(" · ");
    if (shareCover) shareCover.setAttribute("src", t.cover || "");
    if (shareTitle) shareTitle.textContent = t.title + (t.feat ? " (feat. " + t.feat + ")" : "");
    if (shareSub) shareSub.textContent = sub;
    if (shareSongLink) shareSongLink.value = songUrl(t);
    if (shareSongCopy) shareSongCopy.disabled = false;
    if (shareSongNote) shareSongNote.hidden = true;
  }

  function renderSharePl() {
    if (!sharePlSub) return;
    var items = favTracks(), st = favStats();
    if (shareStack) shareStack.innerHTML = items.slice(0, 4).map(function (t) { return '<img src="' + esc(t.cover) + '" alt="">'; }).join("");
    sharePlSub.textContent = st.n + " " + plural(st.n, "трек", "трека", "треков") + " · " + st.min + " мин · хранится в браузере";
    var full = st.n > 0 && playlistSlugs().length > 0;
    if (sharePlFull) sharePlFull.hidden = !full;
    if (sharePlEmpty) sharePlEmpty.hidden = full;
    if (full && sharePlLink) {
      sharePlLink.value = playlistUrl();
      if (sharePlList) sharePlList.innerHTML = items.map(function (t) {
        return '<li><img src="' + esc(t.cover) + '" alt=""><span class="n">' + esc(t.title) + '</span>' +
          '<span class="d">' + esc(t.durationText || "") + '</span></li>';
      }).join("");
    }
  }
  function refreshShare() { renderShareSong(); renderSharePl(); }

  function openSheetEl(el) {
    if (!el) return;
    el.hidden = false;
    void el.offsetWidth;                 /* flush, чтобы анимация выезда сыграла */
    el.classList.add("on");
    if (shareScrim) shareScrim.classList.add("on");
  }
  function closeSheetEl(el) {
    if (!el) return;
    el.classList.remove("on");
    if (shareScrim) shareScrim.classList.remove("on");
    setTimeout(function () { el.hidden = true; }, 300);
  }
  function setShareTab(name) {
    for (var k = 0; k < shareTabs.length; k++) shareTabs[k].classList.toggle("on", shareTabs[k].getAttribute("data-tab") === name);
    for (var j = 0; j < sharePanes.length; j++) sharePanes[j].hidden = sharePanes[j].getAttribute("data-pane") !== name;
  }
  function openShare() {
    if (psheet && psheet.classList.contains("on")) closeSheetEl(psheet);
    setShareTab("song");
    renderShareSong(); renderSharePl();
    openSheetEl(shareSheet);
    if (shareBtn) { shareBtn.classList.add("on"); shareBtn.setAttribute("aria-expanded", "true"); }
  }
  function closeShare() {
    closeSheetEl(shareSheet);
    if (shareBtn) { shareBtn.classList.remove("on"); shareBtn.setAttribute("aria-expanded", "false"); }
  }
  function closeForeign() { closeSheetEl(psheet); }

  if (shareBtn) shareBtn.addEventListener("click", function () {
    if (shareSheet && shareSheet.classList.contains("on")) closeShare(); else openShare();
  });
  for (var tk = 0; tk < shareTabs.length; tk++) {
    shareTabs[tk].addEventListener("click", function () { setShareTab(this.getAttribute("data-tab")); });
  }
  if (shareScrim) shareScrim.addEventListener("click", function () {
    closeShare();
    if (psheet && psheet.classList.contains("on")) closeForeign();
  });
  if (shareSheet) shareSheet.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]")) { closeShare(); return; }
    var c = e.target.closest("[data-copy]");
    if (c) {
      var val = c.getAttribute("data-copy") === "pl" ? (sharePlLink ? sharePlLink.value : "") : (shareSongLink ? shareSongLink.value : "");
      if (val) copyText(val, c);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (shareSheet && shareSheet.classList.contains("on")) closeShare();
    if (psheet && psheet.classList.contains("on")) closeForeign();
  });

  /* обычные share-URL платформ (Telegram / ВКонтакте) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-shareto]");
    if (!b) return;
    e.preventDefault();
    var slot = b.getAttribute("data-slot");
    var url = slot === "pl" ? (sharePlLink ? sharePlLink.value : "") : (shareSongLink ? shareSongLink.value : "");
    if (!url) return;
    var t = curTrack();
    var text = slot === "pl" ? ("Моя подборка — " + ARTIST)
                             : ((t ? t.title : "Breshia") + " — " + ARTIST);
    var enc = encodeURIComponent(url), tx = encodeURIComponent(text);
    var map = { tg: "https://t.me/share/url?url=" + enc + "&text=" + tx, vk: "https://vk.com/share.php?url=" + enc };
    try { window.open(map[b.getAttribute("data-shareto")] || url, "_blank", "noopener"); } catch (e2) {}
  });

  /* на телефоне — системный лист «Поделиться», если браузер его умеет */
  var canNativeShare = !!(navigator.share);
  (function () {
    var ns = document.querySelectorAll(".native[data-native]");
    for (var k = 0; k < ns.length; k++) ns[k].hidden = !canNativeShare;
  })();
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-native]");
    if (!b) return;
    e.preventDefault();
    var slot = b.getAttribute("data-native");
    var url = slot === "pl" ? (sharePlLink ? sharePlLink.value : "") : (shareSongLink ? shareSongLink.value : "");
    if (!url) return;
    var t = curTrack();
    var payload = slot === "pl"
      ? { title: "Подборка — " + ARTIST, text: "Моя подборка — " + ARTIST, url: url }
      : { title: (t ? t.title : ARTIST) + " — " + ARTIST, text: t ? t.title : "", url: url };
    try { var p = navigator.share(payload); if (p && p.catch) p.catch(function () {}); } catch (e2) {}
  });

  /* ==================== шторка «чужая подборка» (#p=) ==================== */
  var psBody = $("psBody");
  var foreignSlugs = [];

  function foreignTracks() { return foreignSlugs.map(function (s) { return NEW[trackIndex(s)]; }); }

  function renderForeign() {
    if (!psBody) return;
    var ts = foreignTracks(), sec = 0;
    ts.forEach(function (t) { sec += durSec(t); });
    var min = Math.max(1, Math.round(sec / 60));
    var have = ts.filter(function (t) { return isFav(t.slug); }).length;
    var stack = ts.slice(0, 4).map(function (t) { return '<img src="' + esc(t.cover) + '" alt="">'; }).join("");
    var rows = ts.map(function (t) {
      return '<li><img src="' + esc(t.cover) + '" alt="">' +
        '<span class="n">' + esc(t.title) + '</span>' +
        (isFav(t.slug) ? '<span class="have">уже у тебя</span>' : "") +
        '<span class="d">' + esc(t.durationText || "") + '</span></li>';
    }).join("");
    var allHave = have === ts.length;
    psBody.innerHTML =
      '<div class="item"><span class="stack">' + stack + '</span>' +
        '<span class="tt"><b>Подборка из ' + ts.length + ' ' + plural(ts.length, "трека", "треков", "треков") + '</b>' +
        '<span>' + min + ' мин · прислал друг · ♥ ' + have + ' из ' + ts.length + ' уже у тебя</span></span></div>' +
      '<ul class="pl-list full">' + rows + '</ul>' +
      '<div class="acts">' +
        '<button class="pill solid" id="psPlayAll" type="button">' +
          '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg> Слушать всё</button>' +
        '<button class="pill" id="psAddAll" type="button"' + (allHave ? " disabled" : "") + '>' +
          (allHave ? "Все уже в избранном" : "Добавить себе") + '</button>' +
      '</div>' +
      '<p class="note" id="psNote">В избранное уедет ' + (ts.length - have) + ' из ' + ts.length +
        ' — уже добавленные не задвоятся, дубликатов не будет.</p>';
  }

  function openForeign(csv) {
    var slugs = String(csv || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var seen = {}, list = [];
    slugs.forEach(function (s) { if (trackIndex(s) >= 0 && !seen[s]) { seen[s] = 1; list.push(s); } });
    if (!list.length) return;                 /* несуществующие слаги игнорируем */
    foreignSlugs = list;
    renderForeign();
    openSheetEl(psheet);
  }

  if (psBody) psBody.addEventListener("click", function (e) {
    if (e.target.closest("#psPlayAll")) {
      var q = foreignSlugs.map(trackIndex).filter(function (i) { return i >= 0 && isPlayable(NEW[i]); });
      if (q.length) { queueMode = "foreign"; altQueue = q; loadTrack(q[0], true); closeForeign(); }
      return;
    }
    if (e.target.closest("#psAddAll")) {
      var added = 0;
      foreignSlugs.forEach(function (s) { if (!isFav(s) && trackIndex(s) >= 0) { fav.push(s); added++; } });
      if (added) { favSave(); paintHearts(); renderFav(); refreshShare(); }
      renderForeign();
      var note = $("psNote");
      if (note) note.textContent = added
        ? ("+" + added + " " + plural(added, "трек", "трека", "треков") + " в избранном — совпавшие не задвоились.")
        : "Все треки уже были в избранном — ничего не изменилось.";
    }
  });

  /* ==================== ссылки ?t=<slug> и #p=<slugs> ==================== */
  function markTarget(i) {
    var rec = cards[i];
    if (!rec) return;
    for (var k = 0; k < cards.length; k++) cards[k].art.classList.remove("is-target");
    rec.art.classList.add("is-target");
    try { rec.art.scrollIntoView({ block: "center" }); }
    catch (e) { try { rec.art.scrollIntoView(); } catch (e2) {} }
  }

  function applyDeepLinks() {
    var qs = String(location.search || "").replace(/^\?/, "");
    var mt = /(?:^|&)t=([^&]+)/.exec(qs);
    if (mt) {
      var slug = decodeURIComponent(mt[1]);
      var i = trackIndex(slug);
      if (i >= 0) {
        if (isPlayable(NEW[i])) { altQueue = null; queueMode = null; loadTrack(i, false); }   /* ставим в плеер, БЕЗ автозапуска */
        markTarget(i);
      }
    }
    var hp = /(?:^|#|&)p=([^&]*)/.exec(String(location.hash || ""));
    if (hp) openForeign(decodeURIComponent(hp[1]));
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
    /* анонс премьеры с хуком: кнопку НЕ блокируем — по нажатию играет 20-секундный тизер */
    if (isHookTrack(t) && hasHook()) {
      var leftH = (m == null) ? null : (m - Date.now());
      heroCd.hidden = !(leftH != null && leftH > 0);
      if (leftH != null && leftH > 0) buildHeroCells(leftH);
      heroPlay.disabled = false; heroPlay.classList.remove("is-soon");
      heroPlay.setAttribute("aria-disabled", "false");
      heroPlay.setAttribute("aria-label", "Послушать тизер: " + t.title + " — 20 секунд припева");
      if (!hookPlaying && label) label.textContent = "Тизер · припев — " + ((HOOK.durationText) || "0:20");
      paintHookBar();
      return;
    }
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
      if (isHookTrack(t)) return;                                /* анонс-хук: интерфейс ведёт hook-модуль */
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
  audio.addEventListener("play", function () { hookStop(); setButtonState("playing"); updateCards(); startRaf(); });
  audio.addEventListener("pause", function () { setButtonState("paused"); updateCards(); stopRaf(); updateTimes(); refreshWave(); });
  audio.addEventListener("playing", function () { setButtonState("playing"); updateCards(); });
  audio.addEventListener("waiting", function () { if (!audio.paused) setButtonState("loading"); });
  audio.addEventListener("loadedmetadata", function () { updateTimes(); refreshWave(); });
  audio.addEventListener("ended", function () { nextTrack(); });
  audio.addEventListener("error", function () { stopRaf(); setButtonState("error"); updateTimes(); });
  audio.addEventListener("timeupdate", function () { if (audio.paused) { updateTimes(); refreshWave(); } });

  /* ==================== метрики: счётчик Метрики + события плеера ====================
     Включается данными: window.BRESHIA.metrics.yandexCounter (номер счётчика). Пока его нет —
     ни строчки наружу не уходит, страница работает как раньше. События уходят целями в Метрику
     (play / play_30 / play_50 / finish / skip) и, если задан endpoint, ещё и на свой сборщик
     через sendBeacon — так ничего не тормозит плеер и не ломается при недоступном приёмнике. */
  var M = B.metrics || {};
  var YM_ID = M.yandexCounter || null;
  var M_ENDPOINT = M.endpoint || null;
  if (YM_ID) {
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    (function () {
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://mc.yandex.ru/metrika/tag.js";
      document.head.appendChild(s);
    })();
    ym(YM_ID, "init", { clickmap: false, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }
  var mFired = {};
  function mTrack() { return (cur >= 0 && NEW[cur]) ? NEW[cur] : null; }
  function mEvent(name, t) {
    var data = { goal: name, slug: t ? t.slug : null, title: t ? t.title : null,
                 pos: Math.round(audio.currentTime || 0),
                 dur: Math.round(audio.duration || (t && t.duration) || 0) };
    if (YM_ID && window.ym) ym(YM_ID, "reachGoal", name, data);
    if (M_ENDPOINT && navigator.sendBeacon) {
      try { navigator.sendBeacon(M_ENDPOINT, JSON.stringify(data)); } catch (e) {}
    }
  }
  function mOnce(key, name, t) { if (!mFired[key]) { mFired[key] = true; mEvent(name, t); } }
  audio.addEventListener("play", function () {
    var t = mTrack(); if (!t) return;
    mFired = {};                       /* пороги считаем заново для нового трека */
    mOnce(t.slug + ":play", "play", t);
  });
  audio.addEventListener("timeupdate", function () {
    var t = mTrack(), d = audio.duration || 0;
    if (!t || audio.paused || !d) return;
    if (audio.currentTime >= 30) mOnce(t.slug + ":p30", "play_30", t);
    if (audio.currentTime / d >= 0.5) mOnce(t.slug + ":p50", "play_50", t);
  });
  audio.addEventListener("ended", function () { var t = mTrack(); if (t) mEvent("finish", t); });
  /* пропуск: переключились раньше 15 секунд — считаем отдельно */
  function mMaybeSkip(prevIdx) {
    if (prevIdx >= 0 && audio.currentTime > 0 && audio.currentTime < 15 && NEW[prevIdx]) {
      mEvent("skip", NEW[prevIdx]);
    }
  }

  /* ==================== счётчики на странице ====================
     Числа кладёт tools/metrics.py (по крону) в assets/stats.js из API Метрики: из браузера
     Метрику не прочитать. Нет данных — блока просто не видно. */
  (function showStats() {
    var box = $("statsLine"), st = window.BRESHIA_STATS;
    if (!box || !st) return;
    function n(v) { return (v == null) ? null : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
    var bits = [];
    if (st.users30 != null) bits.push(n(st.users30) + " " + plural(st.users30, "слушатель", "слушателя", "слушателей") + " за 30 дней");
    if (st.finished30) bits.push(n(st.finished30) + " " + plural(st.finished30, "трек", "трека", "треков") + " дослушано до конца");
    else if (st.plays30 != null) bits.push(n(st.plays30) + " " + plural(st.plays30, "включение", "включения", "включений"));
    if (st.visits7 != null) bits.push(n(st.visits7) + " " + plural(st.visits7, "визит", "визита", "визитов") + " за неделю");
    if (!bits.length) return;
    box.textContent = bits.join(" · ") + (st.updated ? " · обновлено " + st.updated : "");
    box.hidden = false;
  })();

  /* controls */
  playBtn.addEventListener("click", toggle);
  prevBtn.addEventListener("click", prevTrack);
  nextBtn.addEventListener("click", nextTrack);
  heroPlay.addEventListener("click", function () {
    if (isHookTrack(featured) && hasHook()) { hookToggle(); return; }   /* анонс: тизер по нажатию */
    if (!isPlayable(featured)) return;    /* locked teaser без хука: do nothing */
    altQueue = null;      /* герой — обычная очередь */
    queueMode = null;
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
    if (hasHook()) paintHookProgress();          /* волна анонса — из настоящих пиков хука */
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
  if (hasHook()) { paintHook(); paintHookProgress(); }   /* анонс-хук: состояние и волна из пиков */
  setInterval(updateTeaserUI, 1000);
  if (cur >= 0) loadTrack(cur, false);
  else { renderMeta(); idleWave(); }
  updateTimes();
  paintHearts();        /* ♥ на карточках — из сохранённой подборки */
  renderFav();          /* секция «Моя подборка» */
  renderShareSong();
  renderSharePl();
  applyDeepLinks();     /* ?t=<slug> и #p=<slugs> */
})();
