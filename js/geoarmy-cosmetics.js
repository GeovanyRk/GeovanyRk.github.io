/* =====================================================================
   GEO ARMY · COSMÉTICOS · marco VIP violeta y plata   (js/geoarmy-cosmetics.js, v1)
   SOLO PRESENTACIÓN. No habla con Supabase, Twitch ni ningún servidor. No toca puntos, G-Coins, XP,
   rangos, recompensas ni compras. No decide QUIÉN tiene un cosmético: eso lo decide un PROVEEDOR
   (ver "PUNTO DE INTEGRACIÓN"), que más adelante será el backend. Este archivo solo PINTA lo que el
   proveedor autoriza, en tres espacios: barra superior, filas del ranking y tarjeta de Mi Geo Army.

   INTERRUPTORES (js/geoarmy-config.js, ambos false por defecto):
     GEOARMY_COSMETICS_ENABLED    false → este archivo queda INERTE (API vacía: no carga CSS, no escucha nada, no pinta nada).
     GEOARMY_COSMETICS_SIMULATION true (solo en equipo local) → carga js/geoarmy-cosmetics-sim.js (usuarios simulados).

   PUNTO DE INTEGRACIÓN (único): js/geoarmy-cosmetics-adapter.js (carga este módulo cuando está activado).
     El adaptador conoce la FORMA de las respuestas del servidor (contrato) y el TRANSPORTE; este archivo solo valida y pinta:
       transport.session({client, uid})  → respuesta cruda → adapter.parseSession(raw)  → código | null | undefined(inválida)
       transport.ranking({client, plain}) → respuesta cruda → adapter.parseRanking(raw) → [{row, code}] | undefined(inválida)
     El ranking llega en UNA sola respuesta con la apariencia de cada fila ya decidida por el servidor: aquí NUNCA se empareja
     por posición ni por nombre; el código queda ligado al propio objeto fila (WeakMap) y solo ese objeto lo pinta.
     Un código desconocido (no está en COSMETICS) se ignora: la lista blanca vive solo aquí.
     Sin transporte, respuesta inválida, vista vacía, error o tope de tiempo → apariencia normal (falla cerrada). El transporte real (RPC de sesión + vista de ranking) vive en el adaptador.
     useTransport(t) permite inyectar un transporte (la simulación local y las pruebas lo usan).

   Identidad: la cuenta vigente se fija con setIdentity(uid) (la llama js/geoarmy-account.js) y se vigila con
   onAuthStateChange. Al cambiar de cuenta o cerrar sesión se retiran de inmediato el marco de la barra y de la
   tarjeta, y cualquier respuesta tardía de la cuenta anterior se descarta. Nada se guarda en localStorage/sessionStorage.
   ===================================================================== */
(function () {
  'use strict';
  if (window.GeoArmyCosmetics) return;

  var NOOP = function () {};
  var INERT = {
    version: 1, isEnabled: function () { return false; },
    useTransport: NOOP, setIdentity: NOOP, resolveSession: function () { return Promise.resolve(null); },
    sessionCode: function () { return null; }, decorateBar: NOOP, showIdentityFor: NOOP, clearIdentity: NOOP,
    fetchRanking: function () { return Promise.resolve(null); }, rowMarkup: function () { return { cls: '', frame: '', sr: '' }; },
    avatarFallback: NOOP, refresh: NOOP
  };
  if (window.GEOARMY_COSMETICS_ENABLED !== true) { window.GeoArmyCosmetics = INERT; return; }

  // ---------- Catálogo (lista blanca). Un solo cosmético en esta fase. ----------
  var COSMETICS = { vip_violet_silver: { label: 'VIP' } };
  function known(code) { return typeof code === 'string' && Object.prototype.hasOwnProperty.call(COSMETICS, code); }

  var SESSION_TIMEOUT = 1500;   // ms: la barra no espera más que esto al proveedor (después se pinta si llega a tiempo)
  var RANKING_TIMEOUT = 5000;   // ms: tope de la consulta enriquecida del ranking; pasado el tope se usa la consulta normal
  var SESSION_TTL = 300000;     // 5 min de caché en memoria por cuenta
  var SESSION_FAIL_TTL = 20000; // 20 s: tras un fallo/tope del proveedor se puede volver a preguntar (no queda bloqueado)
  var SESSION_HARD = SESSION_TIMEOUT * 4;   // tope duro de una consulta al proveedor (la barra espera solo SESSION_TIMEOUT)

  // ---------- Rutas relativas al propio script (sirven igual en "/" que en una subcarpeta o en local) ----------
  var cs = document.currentScript;
  var SRC = cs && cs.src ? cs.src : '';
  var BASE = SRC ? SRC.replace(/js\/geoarmy-cosmetics\.js[^\/]*$/, '') : '';

  var state = {
    uid: undefined,          // identidad vigente: undefined = aún no se sabe · null = sin sesión · string = uid
    session: null,           // { uid, code, ts }
    inflight: null,          // { uid, promise }
    cardWanted: null,        // { uid, alive } cuando mi-geoarmy.html pidió pintar la tarjeta
    transport: null,         // transporte inyectado con useTransport (tiene prioridad sobre GeoArmyCosmeticsAdapter.transport)
    rows: new WeakMap()      // fila del ranking (objeto) → código
  };

  // ---------- Estilos (se enlazan solo si hace falta, y se espera a que carguen antes de pintar) ----------
  var cssState = 'none';     // none | loading | ready
  var cssWaiters = [];
  function cssLink() { return document.querySelector('link[data-gcos-css], link[href*="geoarmy-cosmetics.css"]'); }
  function whenCss(cb) {
    var l = cssLink();
    if (l && (l.sheet || cssState === 'ready')) { cssState = 'ready'; cb(); return; }
    cssWaiters.push(cb);
    if (cssState === 'loading') return;
    cssState = 'loading';
    function done() { cssState = 'ready'; var w = cssWaiters.splice(0); w.forEach(function (f) { try { f(); } catch (e) {} }); }
    if (!l) {
      l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = BASE + 'css/geoarmy-cosmetics.css?v=1'; l.setAttribute('data-gcos-css', '1');
      document.head.appendChild(l);
    }
    l.addEventListener('load', done); l.addEventListener('error', function () { cssState = 'none'; cssWaiters.length = 0; });
    if (l.sheet) done();
  }

  // ---------- Simulación local (solo si el interruptor lo pide Y la página corre en un equipo local) ----------
  function isLocalHost() {
    var h = String(location.hostname || '');
    return location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /\.local$/.test(h);
  }
  function loadScript(src) {
    return new Promise(function (res) {
      var sc = document.createElement('script');
      sc.src = src;
      sc.onload = function () { res(true); };
      sc.onerror = function () { console.warn('[cosmetics] no se pudo cargar ' + src.replace(/\?.*$/, '')); res(false); };
      document.head.appendChild(sc);
    });
  }
  // 1) adaptador del contrato (siempre que el módulo esté activado y no esté ya presente)  2) simulación local (solo si procede)
  var readyPromise = Promise.resolve();
  if (!window.GeoArmyCosmeticsAdapter && SRC) readyPromise = loadScript(BASE + 'js/geoarmy-cosmetics-adapter.js?v=1');
  if (window.GEOARMY_COSMETICS_SIMULATION === true && isLocalHost() && SRC) {
    readyPromise = readyPromise.then(function () { return loadScript(BASE + 'js/geoarmy-cosmetics-sim.js?v=1'); });
  } else if (window.GEOARMY_COSMETICS_SIMULATION === true) {
    console.warn('[cosmetics] GEOARMY_COSMETICS_SIMULATION=true ignorado: esta página no corre en un equipo local.');
  }
  function adapterObj() {
    var a = window.GeoArmyCosmeticsAdapter;
    return a && typeof a.parseSession === 'function' && typeof a.parseRanking === 'function' ? a : null;
  }
  function getTransport() { return state.transport || (window.GeoArmyCosmeticsAdapter && window.GeoArmyCosmeticsAdapter.transport) || null; }
  function accountClient() { var A = window.GeoArmyAccount; return A && A.client ? A.client : null; }

  function withTimeout(p, ms) {
    return new Promise(function (resolve) {
      var t = setTimeout(function () { resolve(undefined); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function () { clearTimeout(t); resolve(undefined); });
    });
  }
  // Llama al proveedor sin que una excepción SÍNCRONA (o un valor no-promesa) escape: siempre devuelve una promesa.
  function safeCall(fn) {
    try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function byId(id) { return document.getElementById(id); }

  // ---------- Piezas de marcado ----------
  function frameEl() {
    var f = document.createElement('span');
    f.className = 'gcos-frame'; f.setAttribute('aria-hidden', 'true');
    f.innerHTML = '<i class="gcos-badge"><b>VIP</b></i>';
    return f;
  }
  var FRAME_HTML = '<span class="gcos-frame" aria-hidden="true"><i class="gcos-badge"><b>VIP</b></i></span>';
  var SR_HTML = '<span class="gcos-sr"> (VIP)</span>';
  function srEl() { var s = document.createElement('span'); s.className = 'gcos-sr'; s.textContent = ' (VIP)'; return s; }

  // Si la foto no carga: se sustituye por la inicial (solo en elementos con cosmético; los demás quedan como siempre).
  function avatarFallback(img) {
    try {
      if (!img || !img.parentNode) return;
      var root = img.closest('.rk-top-card, .rk-row, .ga-account-btn');
      var nameEl = root && root.querySelector('.rk-top-name, .rk-row-name, .ga-name');
      var t = String((nameEl && nameEl.textContent) || '?').replace('(VIP)', '').trim();
      var base = String(img.className || '').split(' ')[0] || 'rk-avatar';
      var sp = document.createElement('span');
      sp.className = base + ' ' + base + '-fallback';
      sp.textContent = t.charAt(0) || '?';
      img.parentNode.replaceChild(sp, img);
    } catch (e) {}
  }
  function guardImg(img, onFail) {
    if (!img || img.getAttribute('data-gcos-guard')) return;
    img.setAttribute('data-gcos-guard', '1');
    img.addEventListener('error', onFail);
    if (img.complete && !img.naturalWidth && (img.getAttribute('src') || '') !== '' && img.style.display !== 'none') onFail();
  }

  // ---------- BARRA SUPERIOR ----------
  function undecorateBar(btn) {
    if (!btn) btn = byId('gaToggleMenu');
    if (!btn || !btn.classList.contains('gcos-vip')) return;
    btn.classList.remove('gcos-vip'); btn.removeAttribute('data-gcos');
    var wrap = btn.querySelector('.gcos-avatar-wrap');
    if (wrap) {
      var av = wrap.querySelector('.ga-avatar');
      if (av) btn.insertBefore(av, wrap);
      wrap.remove();
    }
    var sr = btn.querySelector('.gcos-sr'); if (sr) sr.remove();
  }
  function decorateBar(uid) {
    try {
      var btn = byId('gaToggleMenu');
      if (!btn) return;
      var code = sessionCode(uid);
      if (!uid || uid !== state.uid || !known(code)) { undecorateBar(btn); return; }
      whenCss(function () {
        // el botón pudo redibujarse mientras cargaba el CSS: se vuelve a comprobar identidad y botón
        var b = byId('gaToggleMenu');
        if (!b || state.uid !== uid || !known(sessionCode(uid))) return;
        if (b.classList.contains('gcos-vip') && b.querySelector('.gcos-avatar-wrap')) return;   // ya pintado (idempotente)
        var av = b.querySelector('.ga-avatar');
        if (!av) return;
        var wrap = document.createElement('span');
        wrap.className = 'gcos-avatar-wrap';
        b.insertBefore(wrap, av); wrap.appendChild(av); wrap.appendChild(frameEl());
        b.classList.add('gcos-vip'); b.setAttribute('data-gcos', code);
        var nm = b.querySelector('.ga-name'); if (nm && !b.querySelector('.gcos-sr')) nm.parentNode.insertBefore(srEl(), nm.nextSibling);
        if (av.tagName === 'IMG') guardImg(av, function () { avatarFallback(av); });
      });
    } catch (e) { /* la presentación nunca debe romper la cuenta */ }
  }

  // ---------- TARJETA DE MI GEO ARMY ----------
  function clearIdentityCard() {
    var card = byId('mgtIdentity');
    if (!card) return;
    card.classList.remove('gcos-vip'); card.removeAttribute('data-gcos');
    var f = card.querySelector('.mgt-id-avatar > .gcos-frame'); if (f) f.remove();
    var s = card.querySelector('.gcos-sr'); if (s) s.remove();
  }
  function applyIdentityCard(uid) {
    try {
      var card = byId('mgtIdentity');
      if (!card) return;
      var code = sessionCode(uid);
      if (!uid || uid !== state.uid || !known(code)) { clearIdentityCard(); return; }
      whenCss(function () {
        var c = byId('mgtIdentity');
        if (!c || state.uid !== uid || !known(sessionCode(uid))) return;
        if (state.cardWanted && state.cardWanted.alive && !state.cardWanted.alive()) return;   // carga antigua de la página
        c.classList.add('gcos-vip'); c.setAttribute('data-gcos', code);
        var av = c.querySelector('.mgt-id-avatar');
        if (av && !av.querySelector(':scope > .gcos-frame')) {
          var ring = av.querySelector('.mgt-id-ring');
          var fr = frameEl(); fr.classList.add('gcos-frame--anim');   // única instancia visible: aquí sí va el brillo suave
          av.insertBefore(fr, ring ? ring.nextSibling : av.firstChild);
        }
        var nm = byId('mgNameText');
        if (nm && !c.querySelector('.gcos-sr')) nm.parentNode.insertBefore(srEl(), nm.nextSibling);
        var img = byId('mgAvatar');
        if (img) guardImg(img, function () { img.style.display = 'none'; });
      });
    } catch (e) {}
  }

  // ---------- Identidad y caché por cuenta ----------
  function sessionCode(uid) {
    return sessionFresh(uid) ? state.session.code : null;
  }
  function sessionFresh(uid) { return !!(state.session && uid && state.session.uid === uid && (Date.now() - state.session.ts) < state.session.ttl); }
  function setIdentity(uid) {
    uid = uid || null;
    if (uid === state.uid) return;
    state.uid = uid;
    state.session = null; state.inflight = null; state.cardWanted = null;
    undecorateBar(); clearIdentityCard();   // retirada inmediata: nunca se ve el marco de A con la sesión de B
  }
  function refresh() { try { decorateBar(state.uid); if (state.cardWanted) applyIdentityCard(state.uid); } catch (e) {} }

  function resolveSession(uid) {
    uid = uid || null;
    if (!uid) return Promise.resolve(null);
    if (state.uid !== uid) setIdentity(uid);
    if (sessionFresh(uid)) return Promise.resolve(state.session.code);
    if (state.inflight && state.inflight.uid === uid) return capped(state.inflight.promise);   // misma consulta en curso; este llamador también espera como máximo SESSION_TIMEOUT
    var entry = { uid: uid, promise: null };
    entry.promise = readyPromise.then(function () {
      // Si mientras esperaba (p. ej. a que cargara el adaptador / la simulación) esta consulta ya fue sustituida por otra
      // (useTransport, cambio de cuenta), NO llama al proveedor: evita consultas duplicadas.
      if (state.inflight !== entry || state.uid !== uid) return undefined;
      var ad = adapterObj(), tr = getTransport();
      if (!ad || !tr || typeof tr.session !== 'function') return null;     // sin transporte: sin llamadas de red, apariencia normal
      // safeCall: un throw síncrono del transporte cuenta como fallo (no deja la consulta "en curso" para siempre)
      return withTimeout(safeCall(function () { return tr.session({ client: accountClient(), uid: uid }); }), SESSION_HARD).then(function (raw) {
        if (raw === undefined) return undefined;                           // error / tope
        try { return ad.parseSession(raw); } catch (e) { return undefined; }   // respuesta inválida → undefined (fallo)
      });
    }).then(null, function () { return undefined; })   // cualquier excepción = fallo (undefined), nunca una promesa rechazada colgada
      .then(function (code) {
        if (state.uid !== uid || state.inflight !== entry) return null;           // cambió la cuenta / cerró sesión mientras tanto: respuesta descartada
        state.inflight = null;                                                      // la consulta terminó (bien o mal): se libera siempre
        var ok = known(code) ? code : null;
        // éxito (con o sin cosmético) → 5 min en memoria; fallo/tope → solo 20 s, para volver a preguntar pronto
        state.session = { uid: uid, code: ok, ts: Date.now(), ttl: code === undefined ? SESSION_FAIL_TTL : SESSION_TTL };
        refresh();                                                                   // por si llegó después de pintar la barra/tarjeta
        return ok;
      });
    state.inflight = entry;
    // Quien llama (la barra) espera como máximo SESSION_TIMEOUT; si llega después, refresh() lo pinta igual.
    return capped(entry.promise);
  }
  function capped(pr) { return withTimeout(pr, SESSION_TIMEOUT).then(function (v) { return v === undefined ? null : v; }); }

  // La tarjeta de Mi Geo Army la pide mi-geoarmy.html cuando ya conoce la cuenta; `alive` dice si esa carga sigue vigente.
  function showIdentityFor(uid, alive) {
    if (!uid) { clearIdentityCard(); state.cardWanted = null; return; }
    if (state.uid !== uid) setIdentity(uid);
    state.cardWanted = { uid: uid, alive: alive };
    applyIdentityCard(uid);                          // si ya está en caché se pinta ya
    resolveSession(uid).then(function () { if (state.uid === uid && state.cardWanted) applyIdentityCard(uid); });
  }

  // ---------- RANKING ----------
  // Consulta enriquecida del ranking: UNA respuesta del servidor con las filas y la apariencia de cada una.
  // Devuelve { data: rows, error: null } (misma forma que la consulta normal) o null → el llamador usa su consulta normal.
  // Las filas devueltas son COPIAS sin el campo de apariencia; el código queda ligado a cada objeto fila (WeakMap).
  // Una respuesta inválida (aunque sea en una sola fila), un error, un tope de tiempo o la falta de transporte → null (sin cosméticos).
  // Si la respuesta llega después del tope, se descarta: nunca modifica nada.
  function fetchRanking(ctx) {
    ctx = ctx || {};
    return readyPromise.then(function () {
      var ad = adapterObj(), tr = getTransport();
      if (!ad || !tr || typeof tr.ranking !== 'function') return null;
      return withTimeout(safeCall(function () { return tr.ranking({ client: ctx.client || accountClient(), plain: ctx.plain }); }), RANKING_TIMEOUT).then(function (raw) {
        if (raw === undefined) return null;
        var parsed;
        try { parsed = ad.parseRanking(raw); } catch (e) { parsed = undefined; }
        if (!parsed || !parsed.length) return null;
        var rows = [];
        parsed.forEach(function (it) {
          rows.push(it.row);
          if (known(it.code)) state.rows.set(it.row, it.code);
        });
        return { data: rows, error: null };
      });
    }).then(null, function () { return null; });
  }
  // Marcado para una fila: { cls, frame, sr }. Sin código autorizado → cadenas vacías (la fila queda exactamente como siempre).
  function rowMarkup(row) {
    var code = row && typeof row === 'object' ? state.rows.get(row) : null;
    if (!known(code)) return { cls: '', frame: '', sr: '' };
    whenCss(function () {});                          // asegura el CSS aunque la página no lo enlace
    return { cls: ' gcos-vip', frame: FRAME_HTML, sr: SR_HTML };
  }

  // ---------- Vigilancia de sesión (cambio de cuenta / cierre de sesión sin recargar) ----------
  var authHooked = false;
  function hookAuth() {
    if (authHooked) return;
    var A = window.GeoArmyAccount, c = A && A.client;
    if (!c || !c.auth || typeof c.auth.onAuthStateChange !== 'function') return;
    authHooked = true;
    c.auth.onAuthStateChange(function (event, session) {
      try {
        var uid = session && session.user ? session.user.id : null;
        if (event === 'SIGNED_OUT' || uid !== state.uid) setIdentity(uid);
      } catch (e) {}
    });
  }
  hookAuth();
  if (!authHooked) document.addEventListener('DOMContentLoaded', hookAuth);

  // CARGA TARDÍA: en páginas que no incluyen este archivo con <script>, js/geoarmy-account.js lo carga de forma asíncrona y la
  // sesión/barra pueden estar ya resueltas. Aquí se lee la identidad vigente (GeoArmyAccount.identity(): undefined = aún no
  // confirmada · null = sin sesión · uid) y se adopta: se consulta al proveedor y, al llegar, refresh() decora la barra sin
  // esperar a otro evento de autenticación. Es idempotente (misma identidad = no hace nada nuevo) y no emite eventos.
  function adoptCurrentIdentity() {
    try {
      var A = window.GeoArmyAccount;
      if (!A || typeof A.identity !== 'function') return;
      var id = A.identity();
      if (id === undefined) return;          // el render inicial aún no confirmó identidad: lo harán los enganches normales
      setIdentity(id || null);
      if (id) resolveSession(id);
    } catch (e) {}
  }
  adoptCurrentIdentity();

  window.GeoArmyCosmetics = {
    version: 1,
    isEnabled: function () { return true; },
    useTransport: function (t) {
      state.transport = t && typeof t === 'object' ? t : null; state.session = null; state.inflight = null;
      refresh();                                                   // retira lo pintado con el transporte anterior
      if (state.uid) resolveSession(state.uid);                    // y vuelve a preguntar con el nuevo (pinta si autoriza)
    },
    setIdentity: setIdentity,
    resolveSession: resolveSession,
    sessionCode: sessionCode,
    decorateBar: decorateBar,
    showIdentityFor: showIdentityFor,
    clearIdentity: function () { state.cardWanted = null; clearIdentityCard(); },
    fetchRanking: fetchRanking,
    rowMarkup: rowMarkup,
    avatarFallback: avatarFallback,
    refresh: refresh,
    _adopt: adoptCurrentIdentity,
    _ready: function () { return readyPromise; },
    _known: function () { return Object.keys(COSMETICS); }
  };
})();
