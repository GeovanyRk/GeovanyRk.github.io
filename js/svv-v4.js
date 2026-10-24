/* =========================================================================
   STREAMER VS VIEWER V2 — "LA ARENA" · js/svv-v4.js
   Solo LECTURA. Usa el cliente compartido window.GeoArmyAccount.client
   (js/geoarmy-account.js) y las RPC de lectura:
     svv_get_public_state · svv_get_rules · svv_get_history · svv_get_my_state
   - No escribe nada: no hay aceptación, inscripción, compras ni economía.
   - Todo texto que viene del servidor se inserta con textContent (nunca innerHTML).
   - Si las RPC todavía no están instaladas, la página lo dice (no inventa cifras).
   ========================================================================= */
(function () {
  'use strict';

  var RPC_TIMEOUT_MS = 12000;
  var POLL_LIVE_MS = 10000;
  var POLL_IDLE_MS = 30000;
  var HISTORY_PAGE = 10;
  var DURATION_S = 10800; // 3 h (formato V2, solo para el reloj en reposo)

  var S = {
    pub: null,          // última respuesta de svv_get_public_state
    mode: 'loading',    // loading | unavailable | error | empty | ok
    offsetMs: 0,        // servidor - cliente
    pollTimer: null,
    histShown: 0,
    histTotal: 0,
    eventKey: null,
    rulesKey: undefined, // clave con la que se cargó el reglamento
    // 4B: protección contra respuestas de sesiones/solicitudes anteriores
    userId: undefined,   // id de la sesión actual (undefined = aún no sabemos; null = sin sesión)
    epoch: 0,            // sube cada vez que cambia la identidad (login, logout, otra cuenta)
    myReq: 0, pubReq: 0, rulesReq: 0, histReq: 0  // número de la última solicitud de cada tipo
  };

  /* ------------------------------ utilidades ------------------------------ */
  function $(id) { return document.getElementById(id); }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function setText(id, v) { var n = $(id); if (n) n.textContent = v; }
  function show(n, on) { if (n) n.hidden = !on; }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function fmtInt(v) { try { return new Intl.NumberFormat('es').format(v); } catch (e) { return String(v); } }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    try { return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(d); }
    catch (e) { return d.toLocaleString(); }
  }
  function fmtDay(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try { return new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(d); } catch (e) { return d.toLocaleDateString(); }
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    return (d > 0 ? d + 'd ' : '') + (d > 0 ? pad(h) : h) + ':' + pad(m) + ':' + pad(s);
  }
  function nowServer() { return Date.now() + S.offsetMs; }
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function animateNumber(node, to) {
    if (!node) return;
    var from = parseInt(node.getAttribute('data-n'), 10);
    node.setAttribute('data-n', String(to));
    if (reduceMotion || isNaN(from) || from === to) { node.textContent = fmtInt(to); return; }
    var t0 = performance.now(), dur = 700;
    function step(t) {
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      node.textContent = fmtInt(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* --------------------------- cliente / RPC --------------------------- */
  function getClient() {
    if (window.GeoArmyAccount && window.GeoArmyAccount.client) return window.GeoArmyAccount.client;
    return null;
  }

  // Devuelve {ok, data} o {ok:false, kind:'missing'|'auth'|'network'|'other', error}
  function rpc(name, args) {
    var client = getClient();
    if (!client) return Promise.resolve({ ok: false, kind: 'network', error: 'sin cliente' });
    var call;
    try { call = args ? client.rpc(name, args) : client.rpc(name); }
    catch (e) { return Promise.resolve({ ok: false, kind: 'other', error: e }); }
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve({ __timeout: true }); }, RPC_TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve(call), timeout]).then(function (res) {
      if (!res || res.__timeout) return { ok: false, kind: 'network', error: 'tiempo de espera' };
      if (res.error) return { ok: false, kind: classify(res.error, res.status), error: res.error };
      return { ok: true, data: res.data };
    }, function (e) { return { ok: false, kind: 'network', error: e }; });
  }
  function classify(err, status) {
    var code = String(err.code || ''), msg = String(err.message || '');
    if (code === 'PGRST202' || code === '42883' || status === 404 || /could not find the function|does not exist/i.test(msg)) return 'missing';
    if (code === 'SV004' || /SV004|autenticado/i.test(msg) || status === 401) return 'auth';
    if (/failed to fetch|network|timeout/i.test(msg)) return 'network';
    if (code === '42501' || status === 403) return 'missing'; // sin permiso => aún no instalada/concedida
    return 'other';
  }

  /* ------------------------- markdown mínimo y seguro ------------------------- */
  function inline(parent, text) {
    var re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      if (tok.indexOf('**') === 0) parent.appendChild(el('strong', null, tok.slice(2, -2)));
      else parent.appendChild(el('em', null, tok.slice(1, -1)));
      last = m.index + tok.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderMarkdown(container, md) {
    clear(container);
    var lines = String(md || '').slice(0, 30000).replace(/\r\n?/g, '\n').split('\n');
    var list = null, listType = null, para = [];
    function flushPara() { if (para.length) { var p = el('p'); inline(p, para.join(' ')); container.appendChild(p); para = []; } }
    function flushList() { list = null; listType = null; }
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, ''), m;
      if (!line.trim()) { flushPara(); flushList(); return; }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        flushPara(); flushList();
        var h = el('h' + Math.min(6, Math.max(4, m[1].length + 3)));
        inline(h, m[2]); container.appendChild(h); return;
      }
      if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
        flushPara();
        if (listType !== 'ul') { list = el('ul'); listType = 'ul'; container.appendChild(list); }
        var li = el('li'); inline(li, m[1]); list.appendChild(li); return;
      }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
        flushPara();
        if (listType !== 'ol') { list = el('ol'); listType = 'ol'; container.appendChild(list); }
        var li2 = el('li'); inline(li2, m[1]); list.appendChild(li2); return;
      }
      flushList(); para.push(line.trim());
    });
    flushPara();
  }

  /* ------------------------------ estado global ------------------------------ */
  var STATUS_TEXT = {
    loading: 'Conectando con la Arena…',
    unavailable: 'Datos en vivo próximamente',
    error: 'Sin conexión con la Arena',
    empty: 'Evento aún no programado'
  };

  function setStatus(kind, text) {
    var st = $('svv-status');
    if (st) st.setAttribute('data-state', kind);
    setText('svv-status-text', text);
  }

  function setBanner(kind, msg, withRetry) {
    var b = $('svv-score-banner');
    if (!b) return;
    clear(b);
    if (!msg) { b.hidden = true; return; }
    b.hidden = false;
    b.setAttribute('data-kind', kind || 'info');
    b.appendChild(el('span', null, msg));
    if (withRetry) {
      var btn = el('button', null, 'Reintentar');
      btn.type = 'button';
      btn.addEventListener('click', function () { loadPublic(true); loadRules(true); loadHistory(true); loadMy(); });
      b.appendChild(btn);
    }
  }

  function resetScoreView(note) {
    ['svv-geo-points', 'svv-viewer-points', 'svv-geo-kills', 'svv-viewer-kills'].forEach(function (id) {
      var n = $(id); if (n) { n.textContent = '—'; n.removeAttribute('data-n'); }
    });
    var g = $('svv-bar-geo'), mk = $('svv-bar-marker');
    if (g) g.style.width = '50%';
    if (mk) mk.style.left = '50%';
    var bar = $('svv-bar'); if (bar) bar.setAttribute('aria-label', note || 'Marcador sin resultados');
    setText('svv-score-note', note || 'Marcador sin resultados');
    show($('svv-match'), false);
    show($('svv-counts'), false);
  }

  function applyMode(mode) {
    S.mode = mode;
    var sec = $('svv-score'); if (sec) sec.setAttribute('data-state', mode);
  }

  /* ------------------------------ render público ------------------------------ */
  function renderPublic(pub) {
    var ev = pub && pub.event;
    if (!ev) { renderEmpty(); return; }
    applyMode('ok');
    S.eventKey = ev.key;

    var label = ev.edition_label || (ev.edition_number ? 'Edición #' + ev.edition_number : 'Edición especial');
    setText('svv-edition', label);

    var statusMap = {
      scheduled: ['scheduled', 'Programado'],
      live: ['live', 'En vivo'],
      finished: ['finished', pub.result ? 'Finalizado' : 'Finalizado · resultado en revisión'],
      settled: ['finished', 'Finalizado']
    };
    var sm = statusMap[ev.status] || ['empty', 'Edición'];
    setStatus(sm[0], sm[1]);
    if (ev.status === 'scheduled') setText('svv-start-info', fmtDate(ev.scheduled_start_at));
    else if (ev.status === 'live') setText('svv-start-info', 'Comenzó ' + fmtDate(ev.live_started_at));
    else setText('svv-start-info', fmtDate(ev.live_started_at || ev.scheduled_start_at));

    renderScore(pub);
    renderMatch(pub);
    renderCounts(pub);
    renderQueue(pub);
    tickClock();
  }

  function renderEmpty() {
    applyMode('empty');
    S.eventKey = null;
    setStatus('empty', STATUS_TEXT.empty);
    setText('svv-edition', '—');
    setText('svv-start-info', 'Por anunciar');
    setBanner('info', 'Evento aún no programado. Cuando haya una edición, el marcador aparecerá aquí.', false);
    resetScoreView('Marcador sin resultados');
    renderQueue(null);
    tickClock();
  }

  function renderUnavailable() {
    applyMode('unavailable');
    S.pub = null; S.eventKey = null;
    setStatus('unavailable', STATUS_TEXT.unavailable);
    setText('svv-edition', '—');
    setText('svv-start-info', '—');
    setBanner('info', 'Función próximamente disponible: los datos en vivo todavía no están conectados.', false);
    resetScoreView('Marcador sin resultados');
    renderQueue(null);
    tickClock();
  }

  function renderError() {
    applyMode('error');
    setStatus('error', STATUS_TEXT.error);
    setBanner('error', 'No pudimos conectar con la Arena. Revisa tu conexión e inténtalo otra vez.', true);
    if (!S.pub) resetScoreView('Marcador no disponible');
    tickClock();
  }

  function renderScore(pub) {
    var ev = pub.event, sc = pub.score;
    if (!sc) {
      resetScoreView(ev.status === 'scheduled' ? 'El marcador se activa cuando comience la edición' : 'Marcador sin resultados');
      setBanner(null, ev.status === 'scheduled' ? '' : '', false);
      if (ev.status === 'scheduled') setBanner('info', 'Evento programado. El marcador arranca en cero cuando comience la edición.', false);
      return;
    }
    setBanner(null, '', false);
    var gp = num(sc.geo_points), vp = num(sc.viewer_points), gk = num(sc.geo_kills), vk = num(sc.viewer_kills);
    if (gp == null || vp == null) { resetScoreView('Marcador sin resultados'); return; }
    animateNumber($('svv-geo-points'), gp);
    animateNumber($('svv-viewer-points'), vp);
    setText('svv-geo-kills', gk == null ? '—' : fmtInt(gk));
    setText('svv-viewer-kills', vk == null ? '—' : fmtInt(vk));

    var total = gp + vp, share = total > 0 ? gp / total : 0.5;
    var g = $('svv-bar-geo'), mk = $('svv-bar-marker');
    if (g) g.style.width = (share * 100).toFixed(2) + '%';
    if (mk) mk.style.left = (share * 100).toFixed(2) + '%';

    var note;
    if (total === 0) note = ev.status === 'live' ? 'Aún sin puntos' : 'Marcador sin resultados';
    else if (gp === vp) note = 'Empate';
    else if (gp > vp) note = 'Geo lidera por ' + fmtInt(gp - vp);
    else note = 'La comunidad lidera por ' + fmtInt(vp - gp);
    if (pub.result && pub.result.outcome) {
      note = pub.result.outcome === 'geo_win' ? 'Resultado final: ganó Geo'
           : pub.result.outcome === 'community_win' ? 'Resultado final: ganó la comunidad' : 'Resultado final: empate';
    }
    setText('svv-score-note', note);
    var bar = $('svv-bar');
    if (bar) bar.setAttribute('aria-label', 'Geo ' + gp + ' puntos, comunidad ' + vp + ' puntos. ' + note);
  }

  function renderMatch(pub) {
    var box = $('svv-match'), list = $('svv-match-players'), cm = pub.current_match;
    if (!cm || !list) { show(box, false); return; }
    clear(list);
    var modes = { duo: 'Dúos', trio: 'Tríos', squad: 'Squad' };
    setText('svv-match-mode', '#' + cm.match_seq + ' · ' + (modes[cm.mode] || ''));
    (cm.players || []).forEach(function (p) {
      var li = el('li'); li.setAttribute('data-side', p.side === 'geo' ? 'geo' : 'viewer');
      li.appendChild(el('span', null, String(p.name || '')));
      li.appendChild(el('em', null, fmtInt(num(p.kills) || 0) + ' kills'));
      list.appendChild(li);
    });
    show(box, true);
  }

  function renderCounts(pub) {
    var c = pub.counts, n = $('svv-counts');
    if (!c || !n) { show(n, false); return; }
    n.textContent = 'Partidas jugadas: ' + fmtInt(c.matches_total || 0) + ' · Turnos activos: ' + fmtInt(c.active_turns || 0) +
      ' · En espera: ' + fmtInt(c.waiting || 0) + ' · Participantes oficiales: ' + fmtInt(c.official_participants || 0);
    show(n, true);
  }

  function renderQueue(pub) {
    var seats = $('svv-seats'), wl = $('svv-waiting-list');
    clear(seats); clear(wl);
    var active = (pub && pub.active_players) || [];
    var queue = (pub && pub.queue) || [];
    var i;
    for (i = 0; i < 3; i++) {
      var p = active[i];
      var li = el('li', 'svv-seat'); li.setAttribute('data-filled', p ? 'true' : 'false');
      li.appendChild(el('span', 'svv-seat__n', 'SLOT ' + (i + 1)));
      li.appendChild(el('span', 'svv-seat__name', p ? String(p.name) : 'Libre'));
      if (p) {
        var pips = el('span', 'svv-seat__pips'); pips.setAttribute('aria-label', 'Partidas usadas ' + p.matches_used + ' de ' + p.matches_max);
        for (var k = 0; k < (p.matches_max || 0); k++) { var b = el('i'); if (k < (p.matches_used || 0)) b.className = 'on'; pips.appendChild(b); }
        li.appendChild(pips);
      }
      seats.appendChild(li);
    }
    var sn = $('svv-seats-note');
    if (!pub || !pub.event) sn.textContent = 'No hay participantes registrados.';
    else if (!active.length) sn.textContent = pub.event.status === 'live' ? 'Nadie en la arena ahora mismo.' : 'No hay participantes registrados.';
    else if (active.length > 3) sn.textContent = '+' + (active.length - 3) + ' jugadores activos más.';
    else sn.textContent = '';

    var waiting = pub && pub.counts ? (pub.counts.waiting || 0) : 0;
    setText('svv-waiting-count', String(waiting));
    queue.forEach(function (q) {
      var li = el('li');
      li.appendChild(el('span', 'svv-ladder__pos', q.position ? '#' + q.position : '·'));
      li.appendChild(el('span', 'svv-ladder__name', String(q.name || '')));
      if (q.status === 'called') li.appendChild(el('span', 'svv-ladder__tag', 'Llamado'));
      else if (q.status === 'confirmed') li.appendChild(el('span', 'svv-ladder__tag', 'Confirmado'));
      wl.appendChild(li);
    });
    var wn = $('svv-waiting-note');
    if (!queue.length) wn.textContent = 'No hay participantes registrados.';
    else if (waiting > queue.filter(function (q) { return q.status === 'waiting'; }).length) wn.textContent = 'Se muestran los primeros de la fila.';
    else wn.textContent = '';

    var jn = $('svv-join-note');
    if (pub && pub.event && pub.event.queue_open) jn.textContent = 'La fila está abierta, pero la inscripción desde la web todavía no está disponible.';
    else jn.textContent = 'La inscripción todavía no está disponible.';
  }

  /* ------------------------------ reloj de 3 horas ------------------------------ */
  function tickClock() {
    var box = $('svv-clock'), ring = $('svv-clock-ring');
    if (!box) return;
    var ev = S.pub && S.pub.event, phase = 'none', label = 'Duración de la edición', text = fmtClock(DURATION_S), pct = 0;
    if (S.mode === 'ok' && ev) {
      var now = nowServer();
      if (ev.status === 'scheduled' && ev.scheduled_start_at) {
        phase = 'scheduled'; label = 'Comienza en';
        text = fmtClock((Date.parse(ev.scheduled_start_at) - now) / 1000);
      } else if (ev.status === 'live' && ev.live_started_at && ev.live_ends_at) {
        var st = Date.parse(ev.live_started_at), en = Date.parse(ev.live_ends_at), total = Math.max(1, en - st);
        var left = en - now;
        phase = 'live'; pct = Math.min(100, Math.max(0, ((now - st) / total) * 100));
        if (left > 0) { label = 'Tiempo restante'; text = fmtClock(left / 1000); }
        else { label = 'Tiempo cumplido'; text = fmtClock(0); }
      } else if (ev.status === 'finished' || ev.status === 'settled') {
        phase = 'done'; label = 'Edición finalizada'; text = fmtClock(0); pct = 100;
      }
    }
    box.setAttribute('data-phase', phase);
    setText('svv-clock-label', label);
    setText('svv-clock-text', text);
    if (ring) ring.style.strokeDashoffset = String(100 - pct);
  }

  /* ------------------------------ carga: público ------------------------------ */
  function loadPublic(manual) {
    var seq = ++S.pubReq;
    if (manual) { setStatus('loading', STATUS_TEXT.loading); }
    return rpc('svv_get_public_state').then(function (r) {
      if (seq !== S.pubReq) return; // llegó una respuesta más nueva: esta ya no vale
      if (r.ok) {
        var d = r.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
        if (!d || typeof d !== 'object') { renderError(); return; }
        var t = Date.parse(d.server_time);
        if (!isNaN(t)) S.offsetMs = t - Date.now();
        S.pub = d;
        if (!d.event) renderEmpty(); else renderPublic(d);
        // si cambió la edición visible, recarga reglamento y ficha
        if (S.eventKey !== S.rulesKey) { loadRules(); loadMy(); }
      } else if (r.kind === 'missing') {
        renderUnavailable();
        if (S.rulesKey === undefined) loadRules();
      } else {
        renderError();
      }
      schedulePoll();
    });
  }

  function schedulePoll() {
    if (S.pollTimer) clearTimeout(S.pollTimer);
    var live = S.pub && S.pub.event && S.pub.event.status === 'live';
    S.pollTimer = setTimeout(function () {
      if (document.hidden) { schedulePoll(); return; }
      loadPublic();
      if (S.eventKey) loadMy();
    }, live ? POLL_LIVE_MS : POLL_IDLE_MS);
  }

  /* ------------------------------ reglamento ------------------------------ */
  function loadRules(force) {
    var key = S.eventKey || null;
    if (!force && S.rulesKey === key && S.rulesKey !== undefined) return Promise.resolve();
    S.rulesKey = key;
    var seq = ++S.rulesReq;
    var body = $('svv-rules-body'), box = $('svv-rules');
    return rpc('svv_get_rules', key ? { p_event_key: key } : undefined).then(function (r) {
      if (seq !== S.rulesReq) return;
      if (!r.ok) {
        box.setAttribute('data-state', r.kind === 'missing' ? 'unavailable' : 'error');
        clear(body);
        body.appendChild(el('p', 'svv-muted', r.kind === 'missing'
          ? 'Función próximamente disponible: el reglamento se mostrará aquí.'
          : 'No pudimos cargar el reglamento. Inténtalo de nuevo en unos segundos.'));
        show($('svv-rules-version'), false); show($('svv-rules-hash'), false);
        return;
      }
      var d = r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      var rules = d && d.rules;
      if (!rules) {
        box.setAttribute('data-state', 'empty');
        clear(body);
        body.appendChild(el('p', 'svv-muted', 'El reglamento se publicará antes de la primera edición.'));
        show($('svv-rules-version'), false); show($('svv-rules-hash'), false);
        return;
      }
      box.setAttribute('data-state', 'ok');
      setText('svv-rules-title', rules.title || 'Reglamento');
      var v = $('svv-rules-version'); v.textContent = 'v' + rules.version_number; show(v, true);
      renderMarkdown(body, rules.body_md);
      var h = $('svv-rules-hash');
      if (rules.body_sha256) { h.textContent = 'SHA-256 ' + rules.body_sha256; show(h, true); } else show(h, false);
    });
  }

  /* ------------------------------ historial ------------------------------ */
  var OUTCOME = { geo_win: 'Ganó Geo', community_win: 'Ganó la comunidad', tie: 'Empate' };

  function loadHistory(reset) {
    var list = $('svv-history-list'), note = $('svv-history-note'), more = $('svv-history-more');
    if (reset) { S.histShown = 0; clear(list); }
    show(more, false);
    var seq = ++S.histReq;
    return rpc('svv_get_history', { p_limit: HISTORY_PAGE, p_offset: S.histShown }).then(function (r) {
      if (seq !== S.histReq) return;
      if (!r.ok) {
        note.textContent = r.kind === 'missing' ? 'Función próximamente disponible.' : 'No pudimos cargar el historial.';
        if (r.kind !== 'missing') { more.textContent = 'Reintentar'; more.setAttribute('data-mode', 'retry'); show(more, true); }
        return;
      }
      var d = r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
      var eds = (d && d.editions) || [];
      S.histTotal = (d && d.total) || 0;
      eds.forEach(function (e) { list.appendChild(renderEdition(e)); });
      S.histShown += eds.length;
      if (!S.histShown) note.textContent = 'Aún no hay ediciones finalizadas.';
      else note.textContent = S.histShown < S.histTotal ? 'Mostrando ' + S.histShown + ' de ' + S.histTotal + ' ediciones.' : '';
      if (S.histShown < S.histTotal) { more.textContent = 'Ver más ediciones'; more.setAttribute('data-mode', 'more'); show(more, true); }
    });
  }

  function renderEdition(e) {
    var li = el('li', 'svv-ed');
    var head = el('div', 'svv-ed__head');
    head.appendChild(el('h3', 'svv-ed__title', e.edition_label || (e.edition_number ? 'Edición #' + e.edition_number : 'Edición')));
    head.appendChild(el('span', 'svv-ed__date', fmtDay(e.finished_at)));
    li.appendChild(head);
    var res = el('div', 'svv-ed__result');
    var g = el('div', 'svv-ed__pts'); g.setAttribute('data-side', 'geo'); g.appendChild(document.createTextNode(fmtInt(num(e.geo_points) || 0))); g.appendChild(el('small', null, 'GEO'));
    var v = el('div', 'svv-ed__pts'); v.setAttribute('data-side', 'viewer'); v.appendChild(document.createTextNode(fmtInt(num(e.viewer_points) || 0))); v.appendChild(el('small', null, 'VIEWERS'));
    var out = el('span', 'svv-ed__out', OUTCOME[e.outcome] || ''); out.setAttribute('data-kind', e.outcome || '');
    res.appendChild(g); res.appendChild(out); res.appendChild(v);
    li.appendChild(res);
    li.appendChild(el('p', 'svv-ed__meta', 'Participantes oficiales: ' + fmtInt(e.official_participants || 0) + ' · Kills: Geo ' + fmtInt(e.geo_kills || 0) + ' / Viewers ' + fmtInt(e.viewer_kills || 0)));
    var top = e.top_participants || [];
    if (top.length) {
      var ul = el('ul', 'svv-ed__top');
      top.forEach(function (p) {
        var t = el('li'); t.appendChild(el('b', null, String(p.name || ''))); t.appendChild(document.createTextNode(' · ' + fmtInt(p.points || 0) + ' pts'));
        ul.appendChild(t);
      });
      li.appendChild(ul);
    }
    return li;
  }

  /* ------------------------------ ficha personal ------------------------------ */
  var BADGE = {
    official: ['official', 'Participante oficial'],
    pending: ['pending', 'En revisión'],
    not_official: ['not_official', 'No oficial'],
    not_played: ['none', 'Aún sin partidas']
  };

  function showFighter(kind, msg, withLogin, withRetry) {
    var sec = $('svv-ficha'); sec.setAttribute('data-state', kind);
    show($('svv-fighter-locked'), kind !== 'ok');
    show($('svv-fighter-sheet'), kind === 'ok');
    if (kind !== 'ok') {
      setText('svv-fighter-locked-msg', msg);
      show($('svv-fighter-login'), !!withLogin);
      retryButton().hidden = !withRetry;
    } else {
      var rb = $('svv-fighter-retry'); if (rb) rb.hidden = true;
    }
  }

  // Botón "Reintentar" de la ficha: se crea aquí para no tocar el HTML aprobado.
  function retryButton() {
    var b = $('svv-fighter-retry');
    if (b) return b;
    b = el('button', 'svv-btn svv-btn--ghost', 'Reintentar');
    b.type = 'button'; b.id = 'svv-fighter-retry'; b.hidden = true;
    b.addEventListener('click', function () { loadMy(); });
    $('svv-fighter-locked').appendChild(b);
    return b;
  }

  // 4B: borra de inmediato TODO dato personal de la ficha (el DOM no conserva nada del usuario anterior)
  function clearFighter() {
    setText('svv-id-name', '—'); setText('svv-id-initial', 'V');
    var badge = $('svv-id-badge'); if (badge) { badge.textContent = '—'; badge.setAttribute('data-kind', 'none'); }
    setText('svv-id-rules', '');
    ['svv-st-matches', 'svv-st-kills', 'svv-st-points', 'svv-st-pos'].forEach(function (id) { setText(id, '—'); });
    clear($('svv-past-list')); show($('svv-past'), false);
  }

  // 4B: la identidad cambió (login, logout u otra cuenta). Invalida TODO lo pendiente de la sesión anterior.
  function identityChanged(newId) {
    S.epoch++;          // las respuestas que salieron con la identidad anterior ya no se aplican
    S.myReq++;          // y cualquier solicitud de ficha en vuelo queda obsoleta
    S.userId = newId;
    clearFighter();
  }

  function loadMy() {
    var client = getClient();
    if (!client || !client.auth) { showFighter('locked', 'Ficha: función próximamente disponible.', false); return Promise.resolve(); }
    var seq = ++S.myReq;
    return client.auth.getSession().then(function (res) {
      if (seq !== S.myReq) return; // otra solicitud más nueva (o un cambio de identidad) la reemplazó
      var session = res && res.data && res.data.session;
      var id = (session && session.user && session.user.id) || null;
      if (id !== S.userId) { identityChanged(id); seq = S.myReq; }
      if (!id) { showFighter('locked', 'Inicia sesión con Twitch para ver tus partidas, kills y posición.', true); return; }
      var epoch = S.epoch;
      return rpc('svv_get_my_state', S.eventKey ? { p_event_key: S.eventKey } : undefined).then(function (r) {
        // descarta la respuesta si cambió la identidad o llegó una solicitud más nueva
        if (seq !== S.myReq || epoch !== S.epoch) return;
        if (!r.ok) {
          if (r.kind === 'missing') showFighter('unavailable', 'Ficha: función próximamente disponible.', false);
          else if (r.kind === 'auth') showFighter('locked', 'Tu sesión no es válida para ver la ficha. Vuelve a iniciar sesión.', true);
          else showFighter('error', 'No pudimos cargar tu ficha. Revisa tu conexión e inténtalo de nuevo.', false, true);
          return;
        }
        var d = r.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
        if (!d) { showFighter('error', 'No pudimos cargar tu ficha.', false, true); return; }
        renderFighter(d);
      });
    }, function () {
      if (seq !== S.myReq) return;
      showFighter('locked', 'Inicia sesión con Twitch para ver tus partidas, kills y posición.', true);
    });
  }

  function renderFighter(d) {
    showFighter('ok');
    var name = (d.profile && d.profile.display_name) || 'Combatiente';
    setText('svv-id-name', name);
    setText('svv-id-initial', String(name).charAt(0).toUpperCase() || 'V');
    var badge = $('svv-id-badge'), rules = $('svv-id-rules');
    if (!d.event) {
      badge.textContent = 'Sin edición activa'; badge.setAttribute('data-kind', 'none');
      rules.textContent = '';
      ['svv-st-matches', 'svv-st-kills', 'svv-st-points', 'svv-st-pos'].forEach(function (id) { setText(id, '—'); });
    } else {
      var b = BADGE[d.official_status] || BADGE.not_played;
      badge.textContent = b[1]; badge.setAttribute('data-kind', b[0]);
      var dec = d.rules && d.rules.decision;
      rules.textContent = dec === 'accepted' ? (d.rules.accepted_current ? 'Reglamento aceptado' : 'Aceptaste otra versión del reglamento')
                        : dec === 'rejected' ? 'Reglamento rechazado' : 'Reglamento pendiente de aceptación';
      var st = d.stats || {};
      setText('svv-st-matches', fmtInt(num(st.matches_played) || 0));
      setText('svv-st-kills', fmtInt(num(st.kills) || 0));
      setText('svv-st-points', fmtInt(num(st.points) || 0));
      var pos = '—';
      if (d.queue) pos = d.queue.status === 'waiting' && d.queue.position ? '#' + d.queue.position
                       : d.queue.status === 'in_turn' ? 'En turno' : d.queue.status === 'called' ? 'Llamado' : d.queue.status === 'confirmed' ? 'Confirmado' : '—';
      setText('svv-st-pos', pos);
    }
    var past = d.past_editions || [], box = $('svv-past'), ul = $('svv-past-list');
    clear(ul);
    past.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('b', null, p.edition_label || (p.edition_number ? 'Edición #' + p.edition_number : 'Edición')));
      li.appendChild(el('span', null, fmtInt(p.matches_played || 0) + ' partidas'));
      li.appendChild(el('span', null, fmtInt(p.kills || 0) + ' kills'));
      li.appendChild(el('span', null, fmtInt(p.points || 0) + ' pts'));
      li.appendChild(el('span', null, p.is_official ? 'Oficial' : 'No oficial'));
      ul.appendChild(li);
    });
    show(box, past.length > 0);
  }

  /* ------------------------------ arranque ------------------------------ */
  function init() {
    // reveal al hacer scroll (sin JS la página se ve completa)
    var secs = document.querySelectorAll('.svv-score, .svv-protocol, .svv-queue, .svv-fighter, .svv-arsenal, .svv-history');
    if ('IntersectionObserver' in window && !reduceMotion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
      }, { threshold: 0.08 });
      secs.forEach(function (s) { s.classList.add('svv-reveal'); io.observe(s); });
    }

    var login = $('svv-fighter-login');
    if (login) login.addEventListener('click', function () {
      if (window.GeoArmyAccount && window.GeoArmyAccount.openLogin) window.GeoArmyAccount.openLogin();
    });
    var more = $('svv-history-more');
    if (more) more.addEventListener('click', function () { loadHistory(more.getAttribute('data-mode') === 'retry' && S.histShown === 0); });

    var client = getClient();
    if (client && client.auth && client.auth.onAuthStateChange) {
      // Se conserva la autenticación de GeoArmyAccount: solo escuchamos sus eventos.
      client.auth.onAuthStateChange(function (event, session) {
        var id = (session && session.user && session.user.id) || null;
        if (id === S.userId && event !== 'SIGNED_OUT') return; // renovación de token / evento repetido: nada cambió
        // Cierre de sesión u otra cuenta: limpiar YA y descartar lo pendiente de la sesión anterior
        identityChanged(id);
        if (!id) showFighter('locked', 'Inicia sesión con Twitch para ver tus partidas, kills y posición.', true);
        else showFighter('loading', 'Cargando tu ficha…', false);
        if (id) setTimeout(loadMy, 0); // no se llama a Supabase dentro del callback de auth
      });
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { loadPublic(); if (S.eventKey) loadMy(); } });

    tickClock();
    setInterval(tickClock, 1000);
    setStatus('loading', STATUS_TEXT.loading);
    loadPublic().then(function () {
      if (S.rulesKey === undefined) loadRules();
      loadHistory(true);
      if (S.myReq === 0) loadMy(); // si loadPublic ya la pidió, no se duplica
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
