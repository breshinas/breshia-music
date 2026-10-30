/* Breshia — страница /stats/: живая статистика с приёмника.
   Ни на что не ссылается и нигде не слинкована; данные — свой бекенд (docs/stats-api.md).
   Живо через EventSource (SSE), при ошибке — фолбэк на fetch /api/stats каждые 10 с.
   Цифры обновляются ТОЧЕЧНО: строки и их порядок не перерисовываются, меняются только значения. */
(function () {
  "use strict";

  var B = window.BRESHIA || {};
  var S = B.stats || {};
  var NEW = Array.isArray(B.new) ? B.new : [];

  var API = S.stats || (S.stream ? String(S.stream).replace(/\/stream\/?$/, "") : "/api/stats");
  var STREAM = S.stream || (API + "/stream");

  var RANGE = "all";
  var STALE_MS = 30000;
  var POLL_MS = 10000;

  var elLive = document.getElementById("stLive");
  var elLiveTxt = document.getElementById("stLiveTxt");
  var elEmpty = document.getElementById("stEmpty");
  var elCards = document.getElementById("stCards");
  var elTable = document.getElementById("stTable");
  var elRows = document.getElementById("stRows");
  var elUpdated = document.getElementById("stUpdated");

  var order = [];        /* порядок строк фиксируется на диапазон: пока он выбран, строки не переставляются */
  var rows = {};         /* slug -> { el, plays, listen, avg, fav, last, bar } */
  var maxPlays = 0;
  var lastAt = 0;
  var live = false;
  var es = null;
  var pollTimer = 0;
  var gotFirst = false;

  var titles = {};
  NEW.forEach(function (t) { if (t && t.slug) titles[t.slug] = t.title || t.slug; });

  function N(n) {
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009");
  }
  function dur(sec) {
    var s = Math.max(0, Math.round(Number(sec) || 0));
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    if (h) return h + " ч " + (m < 10 ? "0" : "") + m + " м";
    if (m) return m + " м " + (r < 10 ? "0" : "") + r + " с";
    return r + " с";
  }
  /* среднее время на посетителя — договорённый формат «мин/с» */
  function avgDur(sec) {
    var s = Math.max(0, Math.round(Number(sec) || 0));
    var m = Math.floor(s / 60), r = s % 60;
    if (!m) return r + " с";
    return m + " мин" + (r ? " " + r + " с" : "");
  }
  function ago(iso) {
    if (!iso) return "—";
    var t = Date.parse(iso);
    if (!isFinite(t)) return "—";
    var d = Math.max(0, Date.now() - t);
    if (d < 60000) return "только что";
    if (d < 3600000) return Math.floor(d / 60000) + " мин назад";
    if (d < 86400000) return Math.floor(d / 3600000) + " ч назад";
    return Math.floor(d / 86400000) + " дн назад";
  }
  /* точечная запись значения: трогаем текст только если он изменился (иначе цифры «дёргаются») */
  function put(el, val) {
    if (!el) return;
    if (el.textContent === val) return;
    el.textContent = val;
    el.classList.remove("st-bump");
    void el.offsetWidth;
    el.classList.add("st-bump");
  }
  function setLive(state, txt) {
    if (!elLive) return;
    elLive.classList.toggle("on", state === true);
    elLive.classList.toggle("warn", state === "warn");
    if (elLiveTxt && txt) elLiveTxt.textContent = txt;
    live = state === true;
  }

  function trackName(slug) { return titles[slug] || slug; }

  function makeRow(slug) {
    var el = document.createElement("div");
    el.className = "st-row";
    el.setAttribute("data-slug", slug);
    el.innerHTML =
      '<span class="st-c st-name"><b class="st-title"></b><i class="st-slug"></i></span>' +
      '<span class="st-c st-plays" data-l="прослушиваний"><b class="v"></b><span class="st-bar" aria-hidden="true"><i></i></span></span>' +
      '<span class="st-c st-listen" data-l="время"><b class="v"></b></span>' +
      '<span class="st-c st-avg" data-l="среднее"><b class="v"></b></span>' +
      '<span class="st-c st-fav" data-l="в любимых"><b class="v"></b></span>' +
      '<span class="st-c st-shares" data-l="поделились"><b class="v"></b></span>' +
      '<span class="st-c st-last" data-l="последний раз"><b class="v"></b></span>';
    el.querySelector(".st-title").textContent = trackName(slug);
    var sl = el.querySelector(".st-slug");
    sl.textContent = titles[slug] ? slug : "";
    return {
      el: el,
      title: el.querySelector(".st-title"),
      plays: el.querySelector(".st-plays .v"),
      listen: el.querySelector(".st-listen .v"),
      avg: el.querySelector(".st-avg .v"),
      fav: el.querySelector(".st-fav .v"),
      shares: el.querySelector(".st-shares .v"),
      last: el.querySelector(".st-last .v"),
      bar: el.querySelector(".st-bar i")
    };
  }

  function render(data) {
    if (!data || data.ok === false) return;
    gotFirst = true;
    lastAt = Date.now();
    elEmpty.hidden = true;
    elCards.hidden = false;
    elTable.hidden = false;

    var tot = data.totals || {};
    put(document.getElementById("sumOnline"), N(data.online || 0));
    put(document.getElementById("sumSessions"), N(tot.sessions || 0));
    put(document.getElementById("sumVisitors"), N(tot.visitors || 0));
    put(document.getElementById("sumPlays"), N(tot.plays || 0));
    put(document.getElementById("sumListen"), dur(tot.listenSec || 0));
    put(document.getElementById("sumFavs"), N(tot.favorites || 0));
    put(document.getElementById("sumOnlineSec"), dur(tot.onlineSec || 0));
    var visitors = tot.visitors || 0;
    put(document.getElementById("sumAvgOn"), (tot.onlineSec != null && visitors) ? avgDur(tot.onlineSec / visitors) : "—");
    if (elUpdated) {
      var ts = data.updated ? new Date(data.updated) : null;
      put(elUpdated, ts && isFinite(ts.getTime())
        ? "обновлено " + ts.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "");
    }

    var list = Array.isArray(data.tracks) ? data.tracks : [];
    /* порядок строк фиксируем один раз (на текущий диапазон) — дальше только значения */
    if (!order.length) {
      list.slice().sort(function (a, b) { return (b.plays || 0) - (a.plays || 0); })
        .forEach(function (t) { order.push(t.slug); });
    }
    /* слаги, которых ещё не было в порядке, дописываем В КОНЕЦ (в середину не вставляем) */
    list.forEach(function (t) { if (order.indexOf(t.slug) < 0) order.push(t.slug); });

    var maxP = 0;
    list.forEach(function (t) { if ((t.plays || 0) > maxP) maxP = t.plays || 0; });
    maxPlays = maxP || 1;

    order.forEach(function (slug) {
      var t = null;
      for (var k = 0; k < list.length; k++) if (list[k].slug === slug) { t = list[k]; break; }
      if (!t) return;
      var r = rows[slug];
      if (!r) {
        r = rows[slug] = makeRow(slug);
        elRows.appendChild(r.el);
      }
      put(r.plays, N(t.plays || 0));
      put(r.listen, dur(t.listenSec || 0));
      put(r.avg, t.plays ? dur((t.listenSec || 0) / t.plays) : "—");
      put(r.fav, N(t.favorites || 0));
      put(r.shares, N(t.shares || 0));
      put(r.last, ago(t.lastPlayed));
      if (r.bar) r.bar.style.width = Math.round(Math.min(1, (t.plays || 0) / maxPlays) * 100) + "%";
      r.el.classList.toggle("is-zero", !(t.plays || 0));
    });
    renderPlaylists(data.playlists);
    setLive(true, "live");
  }

  /* ---------- «Подборки»: N треков · M шерингов, по убыванию шерингов; пусто — блока нет ---------- */
  function plTracks(p) { return (p && (Array.isArray(p.slugs) ? p.slugs.length
    : (Array.isArray(p.tracks) ? p.tracks.length : (p.tracks || p.count || p.n || 0)))) || 0; }
  function renderPlaylists(raw) {
    var box = document.getElementById("stPlaylists"), rowsEl = document.getElementById("stPlsRows");
    if (!box || !rowsEl) return;
    var arr = Array.isArray(raw) ? raw
      : (raw && typeof raw === "object" ? Object.keys(raw).map(function (k) { return raw[k]; }) : []);
    arr = arr.filter(function (p) { return p && plTracks(p) > 0; })
             .sort(function (a, b) { return (b.shares || 0) - (a.shares || 0); });
    if (!arr.length) { box.hidden = true; rowsEl.innerHTML = ""; renderPlaylists._k = ""; return; }
    var key = arr.map(function (p) { return plTracks(p) + ":" + (p.shares || 0); }).join("|");
    if (key === renderPlaylists._k) { box.hidden = false; return; }   /* не пересобираем — цифры не дёргаются */
    renderPlaylists._k = key;
    rowsEl.innerHTML = arr.slice(0, 40).map(function (p) {
      var n = plTracks(p), s = p.shares || 0;
      return '<div class="st-pls-row"><span class="st-pls-n">' + n + " " +
        plural(n, "трек", "трека", "треков") + '</span><span class="st-pls-s">' + N(s) + " " +
        plural(s, "шеринг", "шеринга", "шерингов") + "</span></div>";
    }).join("");
    box.hidden = false;
  }
  function plural(n, a, b, c) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return a;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return b;
    return c;
  }

  function fail() {
    if (gotFirst) return;              /* уже есть данные — старые цифры не гасим, просто метим «нет данных» */
    elEmpty.hidden = false;
    elCards.hidden = true;
    elTable.hidden = true;
    var pl = document.getElementById("stPlaylists"); if (pl) pl.hidden = true;
  }

  /* ---------- транспорт: SSE + фолбэк на fetch ---------- */
  function apiUrl() {
    return API + (API.indexOf("?") >= 0 ? "&" : "?") + "range=" + encodeURIComponent(RANGE) +
      "&_=" + Date.now();
  }
  function fetchOnce() {
    return fetch(apiUrl(), { cache: "no-store", mode: "cors" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      /* опрос — не «live»: честно пишем, что цифры приходят раз в 10 с */
      .then(function (d) { render(d); if (!es) setLive("warn", "опрос · 10 с"); return true; })
      .catch(function () { fail(); return false; });
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; } }
  function startPoll() {
    if (pollTimer) return;
    fetchOnce();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      fetchOnce();
      /* опрос — фолбэк: раз в минуту пробуем вернуться на SSE (поток дешевле и точнее) */
      if (RANGE === "all" && Date.now() - (startPoll.tried || 0) > 60000) {
        startPoll.tried = Date.now();
        connect();
      }
    }, POLL_MS);
  }
  function closeStream() {
    if (es) { try { es.close(); } catch (e) {} es = null; }
  }
  function connect(retry) {
    if (!window.EventSource) { startPoll(); return; }
    closeStream();
    try { es = new EventSource(STREAM + (STREAM.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now()); }
    catch (e) { startPoll(); return; }
    function onMsg(ev) {
      var d = null;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      stopPoll();
      render(d);
    }
    es.addEventListener("stats", onMsg);
    es.onmessage = onMsg;
    es.onerror = function () {
      closeStream();
      setLive("warn", "нет потока — опрос");
      startPoll();
      if (retry === undefined) { /* штатный фолбэк, молчим */ }
    };
    es.onopen = function () { stopPoll(); };
  }

  /* ---------- диапазон ---------- */
  var btns = document.querySelectorAll(".st-range");
  Array.prototype.forEach.call(btns, function (b) {
    b.addEventListener("click", function () {
      var r = b.getAttribute("data-range");
      if (!r || r === RANGE) return;
      RANGE = r;
      Array.prototype.forEach.call(btns, function (x) {
        var on = x === b;
        x.classList.toggle("is-on", on);
        x.setAttribute("aria-pressed", on ? "true" : "false");
      });
      /* новый диапазон = новый набор строк: порядок фиксируем заново */
      order = []; rows = {}; maxPlays = 0; gotFirst = false;
      elRows.innerHTML = "";
      elTable.hidden = true;
      var pls = document.getElementById("stPlaylists"); if (pls) pls.hidden = true;
      renderPlaylists._k = "";
      if (RANGE === "all") { stopPoll(); connect(); }
      else { closeStream(); stopPoll(); startPoll(); }
    });
  });

  /* ---------- сторож «live»: данные не приходят > 30 с — гасим индикатор ---------- */
  setInterval(function () {
    if (!gotFirst) return;
    if (Date.now() - lastAt > STALE_MS) {
      setLive("warn", "нет данных " + Math.round((Date.now() - lastAt) / 1000) + " с");
    } else if (live) {
      setLive(true, "live");
    }
  }, 2000);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    if (RANGE === "all" && !es) connect();
    else fetchOnce();
  });

  connect();
})();
