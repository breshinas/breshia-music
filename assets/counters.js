/* Breshia — счётчики статистики на странице. Один модуль на главную и на страницы песен.
   Выбранные владельцем варианты (variants/stats-counters): 1A + 2A + 3A + 4A + 4B.
     1A — тихая «▶ 1,2 тыс» в правом кластере карточки (на ≤900 уезжает в строку под названием);
     2A — строка под кнопками на странице песни (/t/<slug>/);
     3A — «▶ 8,2 тыс» в строке названия в панели плеера;
     4A — строка в подвале «Сейчас на сайте N · всего M прослушиваний»;
     4B — бейдж «● N онлайн» в шапке у надписи Breshia (при нуле скрыт).
   Данные — свой приёмник (docs/stats-api.md), конфиг — из данных:
   на главной window.BRESHIA.stats (data.js), на странице песни window.BRESHIA_COUNTERS
   (его кладёт tools/trackbase.py gen из база/tracks.json).
   Нет конфига / enabled=false / приёмник недоступен — ни одного запроса и ни одной цифры:
   все счётчики просто остаются скрытыми (никаких нулей «на всякий случай»). */
(function () {
  "use strict";

  var B = window.BRESHIA || {};
  var CFG = (B.stats && (B.stats.stats || B.stats.stream))
    ? { api: B.stats.stats || String(B.stats.stream).replace(/\/stream\/?$/, ""), enabled: B.stats.enabled }
    : (window.BRESHIA_COUNTERS || {});
  var API = CFG.api || "";
  var ON = !!(CFG.enabled !== false && API);
  var REFRESH_MS = 30000;

  var STATE = null;          /* последний ответ /api/stats */
  var WIRE = {};             /* чтобы не пересобирать элементы на каждом обновлении */

  /* ---------- формат ---------- */
  function nf(n) {
    var v = Math.round(Number(n) || 0);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  }
  function short(n) {
    n = Math.round(Number(n) || 0);
    if (n < 1000) return String(n);
    var v = Math.round(n / 100) / 10;
    return String(v).replace(".", ",") + " тыс";
  }
  function dur(sec) {
    var s = Math.max(0, Math.round(Number(sec) || 0));
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    if (h) return h + " ч " + (m < 10 ? "0" : "") + m + " м";
    if (m) return m + " мин";
    return s + " с";
  }

  function trackOf(slug) {
    if (!STATE || !STATE.tracks) return null;
    for (var i = 0; i < STATE.tracks.length; i++) if (STATE.tracks[i].slug === slug) return STATE.tracks[i];
    return null;
  }

  /* ---------- 1A: цифра в карточке ---------- */
  function cards() { return document.querySelectorAll("#newList .track-card"); }
  function cardSlug(card) {
    var fb = card.querySelector(".fav-btn[data-fav]");
    return fb ? fb.getAttribute("data-fav") : null;      /* у анонса ♥ нет — и цифры нет */
  }
  function placeNumbers() {
    var wide = !window.matchMedia("(max-width:900px)").matches;
    var list = cards();
    for (var k = 0; k < list.length; k++) {
      var card = list[k], slug = cardSlug(card);
      if (!slug) continue;
      var t = trackOf(slug), plays = t ? (t.plays || 0) : 0;
      var num = card.querySelector(".tc-num");
      if (plays <= 0) {
        if (num && num.parentNode) num.parentNode.removeChild(num);
        continue;
      }
      if (!num) {
        num = document.createElement("span");
        num.className = "tc-num";
        num.setAttribute("data-num", slug);
      }
      num.textContent = short(plays);
      var right = card.querySelector(".tc-right"), sub = card.querySelector(".tc-sub");
      if (!right) continue;
      if (wide) {
        if (num.parentNode !== right) right.insertBefore(num, right.firstChild);
      } else if (sub) {
        if (num.parentNode !== sub) sub.appendChild(num);
      }
    }
  }

  /* ---------- 3A: цифра в панели плеера ---------- */
  function currentSlug() {
    var raw = null;
    try { raw = localStorage.getItem("breshia.track"); } catch (e) { return null; }
    var i = parseInt(raw, 10);
    if (!isFinite(i) || i < 0 || !B.new || !B.new[i]) return null;
    return B.new[i].slug || null;
  }
  function paintPanel() {
    var el = document.getElementById("pCnt");
    if (!el) return;
    var slug = currentSlug(), t = slug ? trackOf(slug) : null, plays = t ? (t.plays || 0) : 0;
    if (plays <= 0) { el.hidden = true; el.textContent = ""; return; }
    el.textContent = short(plays);
    el.hidden = false;
  }

  /* ---------- 2A: строка на странице песни ---------- */
  function paintTrackLine() {
    var el = document.getElementById("tStats");
    if (!el) return;
    var slug = CFG.slug || null;
    var t = slug ? trackOf(slug) : null;
    if (!t || !(t.plays > 0)) { el.hidden = true; return; }
    el.innerHTML = "<span><b>" + nf(t.plays) + "</b> " + plural(t.plays, "прослушивание", "прослушивания", "прослушиваний") + "</span>" +
      '<span class="sep">·</span><span>' + dur(t.listenSec) + " прослушано</span>" +
      (t.favorites > 0 ? '<span class="sep">·</span><span class="hp">♥</span><span>в ' + t.favorites + " " +
        plural(t.favorites, "подборке", "подборках", "подборках") + "</span>" : "");
    el.hidden = false;
  }
  function plural(n, a, b, c) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
    return c;
  }

  /* ---------- 4A: подвал, 4B: бейдж онлайн ---------- */
  function paintTotals() {
    if (!STATE || !STATE.totals) return;
    var line = document.getElementById("liveStats");
    if (line) {
      line.innerHTML = "Сейчас на сайте <b>" + nf(STATE.online || 0) + "</b> · всего <b>" +
        nf(STATE.totals.plays || 0) + "</b> " + plural(STATE.totals.plays || 0, "прослушивание", "прослушивания", "прослушиваний");
      line.hidden = false;
    }
    var badge = document.getElementById("onlineBadge");
    if (badge) {
      var on = Number(STATE.online) || 0;
      if (on > 0) { badge.hidden = false; badge.innerHTML = "<i></i><b>" + nf(on) + "</b> онлайн"; }
      else { badge.hidden = true; }
    }
  }

  function paintAll() { placeNumbers(); paintPanel(); paintTrackLine(); paintTotals(); }

  /* ---------- загрузка данных ---------- */
  function load() {
    if (!ON || !window.fetch) return;
    var url = API + (API.indexOf("?") >= 0 ? "&" : "?") + "range=all&_=" + Date.now();
    fetch(url, { cache: "no-store", mode: "cors", credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { if (!d || d.ok === false) return; STATE = d; paintAll(); })
      .catch(function () { /* приёмник недоступен — счётчики остаются скрытыми, страница цела */ });
  }

  if (ON) {
    load();
    setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });
  }

  /* 1A: переезд цифры на узком экране + пересборка, если карточки перерисовали */
  var mq = window.matchMedia("(max-width:900px)");
  var relocT = 0;
  function relocLater() {
    if (relocT) return;
    relocT = setTimeout(function () { relocT = 0; placeNumbers(); }, 120);
  }
  if (mq.addEventListener) mq.addEventListener("change", relocLater);
  else if (mq.addListener) mq.addListener(relocLater);
  window.addEventListener("resize", relocLater);
  var list = document.getElementById("newList");
  if (list && window.MutationObserver) {
    new MutationObserver(relocLater).observe(list, { childList: true, subtree: true });
  }
  /* 3A: смена трека в панели — цифру меняем точечно, без перерисовки панели */
  var pName = document.getElementById("pName");
  if (pName && window.MutationObserver) {
    new MutationObserver(paintPanel).observe(pName, { childList: true, characterData: true, subtree: true });
  }
  paintAll();
})();
