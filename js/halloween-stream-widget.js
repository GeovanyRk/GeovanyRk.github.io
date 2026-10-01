// =========================================================================
// HALLOWEEN 2026 — Widget de stream (OBS Browser Source)
// =========================================================================
// Archivo NUEVO y AISLADO. Se carga ÚNICAMENTE desde
// halloween/stream-widget.html. NO depende del DOM de batalla.html ni de
// ninguna otra página -- tiene sus propios ids (hsw*) y su propia copia
// de la lógica de cola/dedupe de movimientos (MOVE_SEEN_IDS/MOVE_QUEUE/
// isMovementEntry), reutilizada CONCEPTUALMENTE de js/halloween-2026.js
// pero reimplementada aquí sin tocar ni requerir ese archivo.
//
// Reglas de seguridad que este archivo respeta siempre:
//  - Solo lectura. NUNCA escribe nada en Supabase.
//  - NUNCA usa service_role -- reutiliza el mismo cliente anon compartido
//    (window.GeoArmyAccount.client, creado por js/geoarmy-account.js),
//    exactamente como ya hace js/halloween-2026.js. Nunca crea un cliente
//    nuevo.
//  - NUNCA consulta tablas halloween_2026_* directamente (nada de
//    .from('halloween_2026_...')). Solo 2 RPC públicas:
//    halloween_2026_get_public_state() y
//    halloween_2026_get_public_feed({ p_limit: 30 }).
//  - NUNCA calcula daño/HP/resultado en el navegador. Las barras SOLO
//    representan boss_hp/boss_max_hp/geoarmy_hp/geoarmy_max_hp tal como
//    llegan. El resultado final (outcome) se lee tal cual, nunca se
//    infiere.
//  - Cataclismo es SOLO presentación: el countdown lee pending_resolves_at
//    y nunca resuelve el ataque ni cambia HP -- al llegar a 00:00 sigue
//    esperando el próximo public_state.
//  - No requiere user_id ni sesión/auth -- las 2 RPC son públicas.
//  - SOLO RPC real: no existe ningún query parameter público capaz de
//    simular HP, fase, victoria o Cataclismo (ver PASADA FINAL TEST ->
//    PRODUCCIÓN más abajo).
//
// REDISEÑO VISUAL (2026-09-26): jerarquía tipo "boss bar" de videojuego
// (retrato + nombre/título + HP numérico, barra de Morvanna gruesa, Geo
// Army secundaria, capa dedicada de Cataclismo).
//
// PASADA FINAL TEST -> PRODUCCIÓN (2026-09-26): se retiró por completo el
// modo demo que existía en este archivo (DEMO_BASE, DEMO_SCENARIOS,
// getDemoParam(), initDemo(), el tag "MODO DEMO" y la rama `?demo=` de
// init()). El widget ahora SIEMPRE arranca contra la RPC real. Además:
// loadState() normaliza array/objeto (ver sección 1) y doPoll() ahora usa
// un guard pollInFlight para que dos rondas de polling nunca se
// superpongan (ver sección 6). NO se tocó: loadFeed/callRpc/
// waitForClient/MOVE_SEEN_IDS/MOVE_QUEUE/isMovementEntry/
// processBattleFeed/dedupe, isCataclysmActive/el cálculo del countdown en
// sí, applyPhase()/updatePortrait()/updateSubtitle() (detección de
// transición 1->2, badge, triggerPhaseFlash, imagen por fase).
// =========================================================================
(function () {
  'use strict';

  if (window.__hswInit) return; // evita doble inicialización
  window.__hswInit = true;

  // -----------------------------------------------------------------
  // Utilidades (copias aisladas, mismo comportamiento que el resto del
  // proyecto para consistencia visual: coma como separador de miles,
  // signo −/+ explícito, etc.)
  // -----------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtNum(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtDelta(n) {
    n = Math.round(Number(n) || 0);
    var sign = n > 0 ? '+' : (n < 0 ? '−' : '');
    return sign + fmtNum(Math.abs(n));
  }
  function pad2(n) { n = Math.max(0, Math.floor(n)); return n < 10 ? '0' + n : '' + n; }
  function clampNum(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // -----------------------------------------------------------------
  // Etiquetas narrativas -- copia aislada de las claves canon reales
  // (halloween_2026_action_defs), NUNCA inventadas. Mismos valores que
  // ACTION_KEY_LABEL/BOSS_ATTACK_LABEL/HEAL_ACTION_LABEL de
  // js/halloween-2026.js, pero esta es una copia propia e independiente.
  // -----------------------------------------------------------------
  var ACTION_KEY_LABEL = {
    golpe_abismo: 'Golpe del Abismo',
    aranazo_maldito: 'Arañazo Maldito',
    ritual_sangre: 'Ritual de Sangre',
  };
  var BOSS_ATTACK_LABEL = {
    fuego_infernal: 'Fuego Infernal',
    cataclismo: 'Cataclismo',
    zarpazo_sombrio: 'Zarpazo Sombrío',
    maldicion_carmesi: 'Maldición Carmesí',
    drenaje_alma: 'Drenaje de Alma',
    marca_bruja: 'Marca de la Bruja',
    garras_abismo: 'Garras del Abismo',
    drenaje_demoniaco: 'Drenaje Demoníaco',
    herida_profana: 'Herida Profana',
  };
  var HEAL_ACTION_LABEL = {
    curacion_menor: 'Curación Menor',
    pulso_vital: 'Pulso Vital',
    bendicion_guardia: 'Bendición de la Guardia',
  };
  // effect_applied: el contrato REAL de halloween_2026_get_public_feed NO
  // devuelve effect_key -- se identifica EXCLUSIVAMENTE por action_key.
  // Labels pedidos explícitamente para este widget (mayúsculas, distintos
  // de BUFF_ACTION_LABEL de halloween-2026.js, que agrega "ACTIVADO").
  var EFFECT_ACTION_LABEL = {
    escudo_arcano: 'ESCUDO ARCANO',
    pocion_furia: 'POCIÓN DE FURIA',
    hechizo_vulnerabilidad: 'HECHIZO DE VULNERABILIDAD',
    ruptura_arcana: 'RUPTURA ARCANA',
  };

  // -----------------------------------------------------------------
  // 1) Cliente Supabase real -- reutiliza window.GeoArmyAccount.client
  //    (creado por js/geoarmy-account.js). Nunca se crea un cliente nuevo.
  // -----------------------------------------------------------------
  var sbClient = null;

  function waitForClient(cb, triesLeft) {
    triesLeft = triesLeft == null ? 100 : triesLeft;
    if (window.GeoArmyAccount && window.GeoArmyAccount.client) { cb(window.GeoArmyAccount.client); return; }
    if (triesLeft <= 0) {
      console.error('[halloween-stream-widget] No se encontró window.GeoArmyAccount.client. ¿Se cargaron premium.js/geoarmy-config.js/geoarmy-ranks.js/geoarmy-account.js antes que este script?');
      setReconnect(true, 'state');
      setReconnect(true, 'feed');
      return;
    }
    setTimeout(function () { waitForClient(cb, triesLeft - 1); }, 100);
  }

  function callRpc(name, args) {
    var p = args ? sbClient.rpc(name, args) : sbClient.rpc(name);
    return Promise.resolve(p);
  }
  function loadState() {
    return callRpc('halloween_2026_get_public_state').then(function (res) {
      if (res.error) throw res.error;
      // FIX TÉCNICO (pasada final test -> producción): acepta objeto o
      // array de una fila -- mismo patrón ya probado en loadState() de
      // js/halloween-2026.js.
      var row = Array.isArray(res.data) ? res.data[0] : res.data;
      if (!row) throw new Error('sin datos');
      return row;
    });
  }
  function loadFeed() {
    return callRpc('halloween_2026_get_public_feed', { p_limit: 30 }).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  // -----------------------------------------------------------------
  // 2) Indicador discreto de reconexión -- si falla una llamada se
  //    mantiene el último estado bueno en pantalla (nunca se vacían las
  //    barras por un fallo temporal), y solo se muestra un ícono chico.
  // -----------------------------------------------------------------
  var reconnectBad = { state: false, feed: false };
  function setReconnect(bad, which) {
    reconnectBad[which] = bad;
    var el = $('hswReconnect');
    if (!el) return;
    el.hidden = !(reconnectBad.state || reconnectBad.feed);
  }

  // -----------------------------------------------------------------
  // 3) Render de estado -- SOLO representación, nunca cálculo.
  // -----------------------------------------------------------------
  var lastState = null;
  var prevBossPhase = null;
  var cataclysmTimerId = null;

  function applyPhase(state, root) {
    // La fase se lee tal cual de boss_phase, NUNCA se calcula por HP.
    var phase = state.boss_phase === 2 ? 2 : 1;
    if (root) root.setAttribute('data-phase', String(phase));
    var badge = $('hswPhaseBadge');
    if (badge) badge.textContent = phase === 2 ? 'FASE II' : 'FASE I';
    // NUEVO (rediseño visual): retrato + subtítulo, ambos derivados de la
    // misma `phase` ya calculada arriba -- ninguna cuenta nueva.
    updatePortrait(phase);
    updateSubtitle(phase);
    // Transición 1 -> 2 detectada entre dos polls de la misma sesión.
    if (prevBossPhase != null && prevBossPhase === 1 && phase === 2) {
      triggerPhaseFlash();
    }
    prevBossPhase = phase;
    return phase;
  }

  // -----------------------------------------------------------------
  // NUEVO (rediseño visual, único agregado de lógica permitido en esta
  // pasada además del subtítulo): retrato de Morvanna por fase. Depende
  // EXCLUSIVAMENTE de boss_phase (nunca de HP, nunca calculado). Si la
  // imagen no existe/falla, fallback oscuro elegante (#hswPortraitFallback,
  // ya en el HTML) -- NUNCA un ícono roto. Mismo patrón ya usado en
  // js/halloween-2026.js (updateBossImg/HERO_IMG_MISSING), reimplementado
  // aquí de forma aislada.
  // -----------------------------------------------------------------
  var PORTRAIT_SRC = {
    1: '../assets/halloween/heraldo-fase1.webp',
    2: '../assets/halloween/heraldo-fase2.webp',
  };
  var PORTRAIT_MISSING = {}; // recuerda qué src ya falló, evita reintentos en cada poll

  function updatePortrait(phase) {
    var img = $('hswPortrait');
    var fallback = $('hswPortraitFallback');
    if (!img || !fallback) return;
    var wanted = PORTRAIT_SRC[phase === 2 ? 2 : 1];

    if (PORTRAIT_MISSING[wanted]) {
      img.hidden = true;
      fallback.hidden = false;
      return;
    }
    if (img.getAttribute('data-portrait-src') === wanted && !img.hidden) return; // ya es esta

    img.onerror = function () {
      PORTRAIT_MISSING[wanted] = true;
      img.onerror = null;
      img.hidden = true;
      fallback.hidden = false;
    };
    img.onload = function () {
      img.hidden = false;
      fallback.hidden = true;
    };
    img.setAttribute('data-portrait-src', wanted);
    img.src = wanted;
    img.alt = 'Morvanna — ' + (phase === 2 ? 'Fase II' : 'Fase I');
  }

  // NUEVO (rediseño visual): subtítulo bajo el nombre, mismo espíritu que
  // el badge FASE I/II que ya existía (applyPhase() lo sigue rellenando
  // sin cambios), pero con el texto pedido explícitamente para el nuevo
  // layout.
  var SUBTITLE_BY_PHASE = {
    1: 'LA HERALDO · FORMA SELLADA',
    2: 'LA HERALDO · FORMA DEMONÍACA',
  };
  function updateSubtitle(phase) {
    var el = $('hswSubtitle');
    if (el) el.textContent = SUBTITLE_BY_PHASE[phase === 2 ? 2 : 1];
  }

  function triggerPhaseFlash() {
    var el = $('hswPhaseFlash');
    if (!el) return;
    el.hidden = false;
    el.classList.remove('is-active');
    void el.offsetWidth; // reflow, por si se dispara dos veces seguidas
    el.classList.add('is-active');
    setTimeout(function () { el.hidden = true; el.classList.remove('is-active'); }, 1800);
  }

  function flashOnce(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 600);
  }

  var prevBossHp = null, prevGeoHp = null;
  function renderBars(state) {
    var bossPct = state.boss_max_hp > 0 ? clampNum((state.boss_hp / state.boss_max_hp) * 100, 0, 100) : 0;
    var geoPct = state.geoarmy_max_hp > 0 ? clampNum((state.geoarmy_hp / state.geoarmy_max_hp) * 100, 0, 100) : 0;
    var bossFill = $('hswBossFill'), geoFill = $('hswGeoFill');
    if (bossFill) bossFill.style.width = bossPct + '%';
    if (geoFill) geoFill.style.width = geoPct + '%';
    var bossText = $('hswBossText'), geoText = $('hswGeoText');
    if (bossText) bossText.textContent = fmtNum(state.boss_hp) + ' / ' + fmtNum(state.boss_max_hp) + ' HP';
    if (geoText) geoText.textContent = fmtNum(state.geoarmy_hp) + ' / ' + fmtNum(state.geoarmy_max_hp) + ' HP';

    if (prevBossHp != null && bossFill) {
      if (state.boss_hp < prevBossHp) flashOnce(bossFill, 'hsw-flash-hit');
      else if (state.boss_hp > prevBossHp) flashOnce(bossFill, 'hsw-flash-heal');
    }
    if (prevGeoHp != null && geoFill) {
      if (state.geoarmy_hp < prevGeoHp) flashOnce(geoFill, 'hsw-flash-hit');
      else if (state.geoarmy_hp > prevGeoHp) flashOnce(geoFill, 'hsw-flash-heal');
    }
    prevBossHp = state.boss_hp;
    prevGeoHp = state.geoarmy_hp;
  }

  function setBottomLine(text, cls) {
    var box = $('hswBottomLine');
    if (!box) return;
    box.textContent = text;
    box.className = 'hsw-bottom-line' + (cls ? ' ' + cls : '');
    box.hidden = false;
  }

  function renderScheduled(state) {
    var root = $('hswRoot');
    if (root) { root.setAttribute('data-state', 'scheduled'); root.setAttribute('data-outcome', 'none'); }
    stopCataclysmTimer();
    // NUEVO (rediseño visual): SOLO retrato/subtítulo -- deliberadamente
    // NO se llama a applyPhase() aquí (eso queda intacto para
    // battle/finished): no hace falta tocar el badge oculto ni la
    // detección de transición 1->2 mientras el evento no empezó. boss_phase
    // ya viene en 1 desde el backend mientras 'scheduled' (mismo comentario
    // que ya existía en js/halloween-2026.js para este caso), así que se
    // lee el valor real en vez de asumirlo, pero nunca se calcula. El
    // atenuado del retrato es puro CSS (data-state="scheduled").
    var phase = (state && state.boss_phase === 2) ? 2 : 1;
    updatePortrait(phase);
    var sub = $('hswSubtitle');
    if (sub) sub.textContent = 'LA HERALDO'; // sin calificador de fase -- el evento no empezó
    // NO simula HP moviéndose: no se toca renderBars aquí a propósito.
  }

  function renderFinished(state) {
    var root = $('hswRoot');
    if (root) {
      root.setAttribute('data-state', 'finished');
      // NUEVO (rediseño visual): mismo state.outcome que ya se lee abajo
      // para el título/subtítulo -- solo se expone como atributo para que
      // el CSS pueda oscurecer el retrato en victoria de Geo Army.
      root.setAttribute('data-outcome', state.outcome || 'none');
      applyPhase(state, root);
    }
    renderBars(state); // "Mantener HP finales visibles"
    stopCataclysmTimer();
    var title = $('hswFinishedTitle'), sub = $('hswFinishedSub');
    if (state.outcome === 'geoarmy_victory') {
      if (title) title.textContent = 'LA HERALDO HA CAÍDO';
      if (sub) sub.textContent = 'GEO ARMY SOBREVIVIÓ';
    } else if (state.outcome === 'herald_victory') {
      if (title) title.textContent = 'LA RESISTENCIA HA CAÍDO';
      if (sub) sub.textContent = 'LA HERALDO VENCIÓ';
    } else {
      // outcome desconocido/null -- nunca se inventa un resultado.
      if (title) title.textContent = 'BATALLA FINALIZADA';
      if (sub) sub.textContent = '';
    }
  }

  function renderBattle(state) {
    var root = $('hswRoot');
    if (root) { root.setAttribute('data-state', 'battle'); root.setAttribute('data-outcome', 'none'); }
    applyPhase(state, root);
    renderBars(state);
    renderCataclysm(state);
    processMoveQueue(); // por si Cataclismo acaba de terminar, reanuda la cola
  }

  // Dispatcher único a partir de public_state -- status/outcome se leen
  // tal cual, nunca se infiere ni se calcula.
  function applyState(state) {
    if (!state) return; // sin dato bueno -- se conserva lo que ya había en pantalla
    lastState = state;
    if (state.status === 'scheduled') { renderScheduled(state); return; }
    if (state.status === 'finished') { renderFinished(state); return; }
    renderBattle(state); // 'active' o cualquier otro valor no final
  }

  // -----------------------------------------------------------------
  // 4) Cataclismo -- SOLO presentación. El countdown lee
  //    pending_resolves_at y jamás resuelve el ataque, cambia HP o
  //    asume que impactó. Al llegar a 00:00 sigue esperando el próximo
  //    public_state; al desaparecer pending_attack_key, vuelve sola al
  //    widget normal (siguiente poll ya no entra a esta rama).
  // -----------------------------------------------------------------
  function isCataclysmActive(state) {
    return !!(state && state.pending_attack_key === 'cataclismo' && state.pending_resolves_at);
  }
  function cataclysmActiveNow() { return isCataclysmActive(lastState); }

  function renderCataclysm(state) {
    var root = $('hswRoot');
    var active = isCataclysmActive(state);
    if (root) root.setAttribute('data-cataclysm', active ? '1' : '0');

    if (!active) { stopCataclysmTimer(); return; }

    // NUEVO (rediseño visual): capa dedicada, no oculta retrato/barras.
    var layer = $('hswCataclysmLayer');
    if (layer) layer.hidden = false;

    var resolvesAt = new Date(state.pending_resolves_at).getTime();
    if (cataclysmTimerId) clearInterval(cataclysmTimerId);

    // El cálculo del countdown es EXACTAMENTE el mismo de siempre --
    // pending_resolves_at vs Date.now(), 1 tick/seg, nunca resuelve el
    // ataque ni cambia HP. Lo único que cambió respecto a la versión
    // anterior es el elemento del DOM al que se escribe el resultado
    // (antes: la línea de "último movimiento"; ahora: #hswCataclysmTimer,
    // dentro de la nueva capa dedicada -- ver HTML/CSS).
    function tick() {
      var diff = Math.max(0, resolvesAt - Date.now());
      var totalSec = Math.floor(diff / 1000);
      var m = Math.floor(totalSec / 60), s = totalSec % 60;
      var timerEl = $('hswCataclysmTimer');
      if (timerEl) timerEl.textContent = pad2(m) + ':' + pad2(s);
      // Nunca se hace nada especial al llegar a 00:00 -- se sigue
      // esperando el próximo public_state, tal como pide la spec.
    }
    tick();
    cataclysmTimerId = setInterval(tick, 1000);
  }
  // FIX TÉCNICO (pasada final test -> producción): además de detener el
  // timer y ocultar la capa, ahora también fuerza data-cataclysm="0" en
  // #hswRoot -- antes renderScheduled()/renderFinished() llamaban a esta
  // función pero nunca tocaban ese atributo, así que el pulso/glow del
  // borde del panel (que depende de [data-cataclysm="1"] en el CSS) podía
  // quedarse encendido tras pasar de una batalla con Cataclismo activo a
  // 'scheduled'/'finished'. Centralizar el reset aquí (único punto que ya
  // llaman ambos renderScheduled/renderFinished, y también
  // renderCataclysm() cuando ya no está activo) garantiza que nunca quede
  // glow/countdown viejo, sin tocar el cálculo del countdown ni resolver
  // Cataclismo en el frontend.
  function stopCataclysmTimer() {
    if (cataclysmTimerId) { clearInterval(cataclysmTimerId); cataclysmTimerId = null; }
    var layer = $('hswCataclysmLayer');
    if (layer) layer.hidden = true;
    var root = $('hswRoot');
    if (root) root.setAttribute('data-cataclysm', '0');
  }

  // -----------------------------------------------------------------
  // 5) Cola de movimientos -- reutiliza CONCEPTUALMENTE
  //    MOVE_SEEN_IDS/MOVE_QUEUE/isMovementEntry de js/halloween-2026.js,
  //    pero con su propia implementación aislada (no importa ni depende
  //    de ese archivo). Dedupe por log_id. Primera carga = baseline, sin
  //    animar historial. Nunca se superponen dos movimientos.
  //
  //    Movimientos relevantes: player_attack, boss_attack, boss_heal,
  //    heal, shield, mission_damage, y effect_applied SOLO si trae un
  //    action_key reconocido (nunca effect_key -- no existe en el feed
  //    real). Quedan fuera: role_selected, effect_consumed,
  //    event_started, boss_attack_announced, phase_change (transición
  //    propia vía boss_phase), victory/defeat (estados finales propios
  //    vía status/outcome).
  // -----------------------------------------------------------------
  var MOVE_SEEN_IDS = {};
  var MOVE_QUEUE = [];
  var MOVE_PLAYING = false;
  var MOVE_BASELINE_DONE = false;

  function isMovementEntry(it) {
    if (it.entry_type === 'effect_applied') {
      return !!(it.action_key && EFFECT_ACTION_LABEL[it.action_key]);
    }
    return it.entry_type === 'player_attack' || it.entry_type === 'boss_attack' ||
      it.entry_type === 'boss_heal' || it.entry_type === 'heal' ||
      it.entry_type === 'shield' || it.entry_type === 'mission_damage';
  }

  // Texto de una sola línea por movimiento -- mismo espíritu que
  // feedItemText() de js/halloween-2026.js, formato pedido explícitamente
  // para este widget ("Actor usó/recuperó Etiqueta · ΔHP").
  function movementText(item) {
    switch (item.entry_type) {
      case 'player_attack': {
        var who = item.actor_name || 'Un guerrero';
        var label = ACTION_KEY_LABEL[item.action_key] || 'un ataque';
        return esc(who) + ' usó ' + esc(label) + ' · ' + fmtDelta(item.boss_hp_delta) + ' HP';
      }
      case 'boss_attack': {
        var bLabel = BOSS_ATTACK_LABEL[item.boss_attack_key] || 'un ataque';
        return 'La Heraldo usó ' + esc(bLabel) + ' · ' + fmtDelta(item.geoarmy_hp_delta) + ' HP';
      }
      case 'boss_heal':
        return 'Morvanna recuperó ' + fmtDelta(item.boss_hp_delta) + ' HP';
      case 'heal':
        return 'Geo Army recuperó ' + fmtDelta(item.geoarmy_hp_delta) + ' HP';
      case 'shield':
        return 'Geo Army activó un escudo';
      case 'mission_damage':
        // Solo boss_hp_delta -- el feed público no expone el título del
        // contrato, así que no se inventa.
        return 'Contrato completado · ' + fmtDelta(item.boss_hp_delta) + ' HP';
      case 'effect_applied': {
        var fxLabel = item.action_key && EFFECT_ACTION_LABEL[item.action_key];
        // isMovementEntry() ya filtró los casos sin label reconocido, así
        // que si llegamos aquí siempre hay algo real que mostrar -- pero
        // se deja un fallback defensivo sin inventar cuál fue.
        return 'Geo Army activó ' + (fxLabel || 'EFECTO ACTIVADO');
      }
      default:
        return '';
    }
  }

  function movementClass(item) {
    return item.entry_type === 'mission_damage' ? 'hsw-bottom-mission' : 'hsw-bottom-move';
  }
  function movementDurationMs(item) {
    // Contrato completado: animación "ligeramente más importante", 2.5-3s.
    // El resto: rango 1.2-1.8s ya probado en Batalla.
    return item.entry_type === 'mission_damage' ? 2800 : 1700;
  }

  function playMovement(item, done) {
    setBottomLine(movementText(item), movementClass(item));
    setTimeout(done, movementDurationMs(item));
  }

  function processMoveQueue() {
    if (MOVE_PLAYING) return;
    if (cataclysmActiveNow()) return; // Cataclismo tiene prioridad visual
    var item = MOVE_QUEUE.shift();
    if (!item) return;
    MOVE_PLAYING = true;
    playMovement(item, function () {
      MOVE_PLAYING = false;
      processMoveQueue();
    });
  }

  // Orden cronológico real: created_at ascendente, log_id como desempate.
  function moveChronoSort(a, b) {
    var ta = new Date(a.created_at || 0).getTime();
    var tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return (a.log_id || 0) - (b.log_id || 0);
  }

  // Primera carga: registra baseline SIN animar. Después: solo log_id
  // nuevos, en orden cronológico, encolados si llegan varios entre polls.
  function processBattleFeed(feed) {
    if (feed == null) return; // error de carga -- se conserva lo último bueno
    var items = feed.slice().sort(moveChronoSort);

    if (!MOVE_BASELINE_DONE) {
      items.forEach(function (it) { MOVE_SEEN_IDS[it.log_id] = true; });
      MOVE_BASELINE_DONE = true;
      var lastRelevant = null;
      for (var i = items.length - 1; i >= 0; i--) {
        if (isMovementEntry(items[i])) { lastRelevant = items[i]; break; }
      }
      if (lastRelevant && !cataclysmActiveNow()) {
        setBottomLine(movementText(lastRelevant), movementClass(lastRelevant));
      }
      return;
    }

    items.forEach(function (it) {
      if (MOVE_SEEN_IDS[it.log_id]) return; // dedupe real por log_id
      MOVE_SEEN_IDS[it.log_id] = true;
      if (!isMovementEntry(it)) return;
      MOVE_QUEUE.push(it);
    });
    processMoveQueue();
  }

  // -----------------------------------------------------------------
  // 6) Polling -- un solo ciclo cada 5s (public_state + public_feed),
  //    sin setInterval superpuestos. Si una llamada falla, se conserva
  //    el último estado bueno (nunca se vacían las barras).
  // -----------------------------------------------------------------
  var pollTimer = null;
  // FIX TÉCNICO (pasada final test -> producción): si una ronda anterior
  // sigue activa, no se inicia otra -- state y feed siguen ejecutándose en
  // paralelo DENTRO de la misma ronda (sin cambios ahí), y una RPC
  // fallando no impide procesar la otra (cada una ya atrapa su propio
  // error). pollInFlight se libera cuando AMBAS terminaron, tanto en
  // success como en failure. Intervalo sin cambios: 5000 ms.
  var pollInFlight = false;

  function doPoll() {
    if (pollInFlight) return;
    pollInFlight = true;

    var statePromise = loadState().then(function (state) {
      setReconnect(false, 'state');
      applyState(state);
    }).catch(function (e) {
      console.warn('[halloween-stream-widget] fallo halloween_2026_get_public_state', e);
      setReconnect(true, 'state');
    });

    var feedPromise = loadFeed().then(function (feed) {
      setReconnect(false, 'feed');
      processBattleFeed(feed);
    }).catch(function (e) {
      console.warn('[halloween-stream-widget] fallo halloween_2026_get_public_feed', e);
      setReconnect(true, 'feed');
    });

    Promise.all([statePromise, feedPromise]).then(function () {
      pollInFlight = false;
    });
  }

  // -----------------------------------------------------------------
  // 7) Arranque
  //
  // PASADA FINAL TEST -> PRODUCCIÓN (2026-09-26): se retiró por completo
  // el modo demo (?demo=active_p1|active_p2|cataclismo|geoarmy_victory|
  // herald_victory, DEMO_BASE, DEMO_SCENARIOS, getDemoParam(), initDemo()
  // y el tag "MODO DEMO"). El widget de producción arranca SIEMPRE contra
  // la RPC real -- ya no existe ningún query parameter público capaz de
  // simular HP, fase, victoria o Cataclismo.
  // -----------------------------------------------------------------
  function init() {
    waitForClient(function (client) {
      sbClient = client;
      doPoll();
      pollTimer = setInterval(doPoll, 5000);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
