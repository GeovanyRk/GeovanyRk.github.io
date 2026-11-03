/* Geo Army — Cumpleaños V1 — Fase 1B (interfaz de registro)
 *
 * Módulo independiente. Reusa la sesión/cliente de js/geoarmy-account.js
 * (window.GeoArmyAccount.client). Debe cargarse DESPUÉS de ese script.
 *
 * Solo usa las dos RPC ya instaladas en Supabase:
 *   get_my_birthday_status()  -> { registered, month, day, registered_at, is_new_account }
 *   set_my_birthday(p_month, p_day) -> { registered, month, day, registered_at }
 * Al servidor solo viaja p_month y p_day. NUNCA escribe en tablas, ni toca
 * profiles, billeteras, XP, misiones, rangos o regalos. No acredita nada.
 *
 * Comportamiento:
 *  - Cuenta nueva (is_new_account=true) sin cumpleaños: onboarding inicial (modal sin
 *    cierre) tras la sesión de Twitch, en cualquier página que cargue este módulo.
 *    Solo se puede salir sin guardar ante un error técnico ("Continuar"), y se vuelve a
 *    pedir en la siguiente sesión del navegador.
 *  - Cuenta existente sin cumpleaños, SOLO en Mi Geo Army: ventana descartable +
 *    aviso fino bajo la cabecera + tarjeta permanente en la pestaña Cuenta.
 *  - Con cumpleaños registrado: todo lo anterior desaparece y la tarjeta muestra la fecha.
 *  - Si la funcionalidad se desactiva en Supabase (permiso denegado / función inexistente),
 *    el módulo no muestra nada y el sitio sigue igual.
 *  - La consulta inicial que falla nunca bloquea nada: simplemente no se muestra UI.
 */
(function () {
  'use strict';

  if (window.__geoarmyBirthdayLoaded) return;   // protege contra doble inclusión
  window.__geoarmyBirthdayLoaded = true;

  var A = window.GeoArmyAccount;
  if (!A || !A.client || !A.client.rpc || !A.client.auth) {
    console.warn('[geoarmy-birthday] GeoArmyAccount no está disponible; el módulo no hace nada.');
    return;
  }
  var sb = A.client;

  // ===== Configuración =====
  var TIMEOUT_MS = 8000;   // consulta o guardado sin respuesta -> error técnico
  // Texto de contacto para correcciones/eliminación. DECISIÓN DEL PROPIETARIO PENDIENTE:
  // cambiar aquí cuando exista un canal oficial definitivo.
  var PRIVACY_CONTACT = 'el equipo de Geo Army (canal de Twitch geovannyrk)';
  var KEY_SKIP = 'geoarmy_bday_skip_v1:';        // sessionStorage: salida de emergencia (por cuenta)
  var KEY_DISMISS = 'geoarmy_bday_dismiss_v1:';  // localStorage: invitación descartada (por cuenta)

  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // febrero 29 permitido

  // Modo completo = Mi Geo Army (tiene la tarjeta y el aviso en el HTML).
  var FULL = !!document.getElementById('gaBdaySection');
  var skipInvite = false;   // ?x_connect= al cargar: no interrumpir el retorno de X
  try { skipInvite = /[?&]x_connect=/.test(window.location.search); } catch (e) {}

  // ===== Estado (identidad vigente) =====
  var uid = null;          // uid de la sesión vigente
  var gen = 0;             // sube con cada cambio de identidad: descarta respuestas viejas
  var st = null;           // { registered, month, day, isNew } de la cuenta vigente
  var off = false;         // funcionalidad desactivada en el backend (esta carga)
  var nameHint = '';
  var active = null;       // formulario abierto (uno solo a la vez)
  var sessionSeen = false;
  var mem = {};            // respaldo en memoria si el almacenamiento del navegador falla

  // ===== Utilidades =====
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  function isMD(m, d) { return isInt(m) && isInt(d) && m >= 1 && m <= 12 && d >= 1 && d <= DAYS_IN[m - 1]; }
  function fmt(m, d) { return isMD(m, d) ? d + ' de ' + MONTHS[m - 1] : ''; }
  function $(id) { return document.getElementById(id); }

  // Almacenamiento del navegador con respaldo en memoria (puede fallar o estar bloqueado).
  function storeGet(kind, key) {
    try {
      var v = (kind === 'session' ? window.sessionStorage : window.localStorage).getItem(key);
      if (v !== null) return v;
    } catch (e) {}
    return mem[kind + ':' + key] || null;
  }
  function storeSet(kind, key, val) {
    mem[kind + ':' + key] = val;
    try { (kind === 'session' ? window.sessionStorage : window.localStorage).setItem(key, val); } catch (e) {}
  }
  function getSkip(id) { return storeGet('session', KEY_SKIP + id) === '1'; }
  function setSkip(id) { storeSet('session', KEY_SKIP + id, '1'); }
  function getDismissed(id) { return storeGet('local', KEY_DISMISS + id) === '1'; }
  function setDismissed(id) { storeSet('local', KEY_DISMISS + id, '1'); }

  function nameOf(session) {
    try {
      var m = (session && session.user && session.user.user_metadata) || {};
      var n = m.preferred_username || m.name || m.full_name || m.user_name || '';
      return String(n).slice(0, 40);
    } catch (e) { return ''; }
  }

  // Clasificación de errores de las RPC (contrato del backend 1A).
  function classify(err) {
    var msg = String((err && err.message) || ''), code = String((err && err.code) || '');
    var status = err && err.status;
    if (/already_registered/.test(msg) || code === '23505') return 'already';
    if (/invalid_date/.test(msg) || code === '22023') return 'invalid';
    if (/not_authenticated/.test(msg) || code === '28000' || code === 'PGRST301' || /JWT/.test(msg)) return 'noauth';
    if (/profile_not_found|launch_config_missing/.test(msg) || code === 'P0002') return 'profile';
    if (code === '42501' || code === 'PGRST202' || code === '42883' || status === 404 ||
        /permission denied|could not find the function|does not exist/i.test(msg)) return 'off';
    return 'tech';   // red, 5xx, tiempo agotado, respuesta inesperada
  }

  // Llama una RPC con tiempo máximo. Nunca rechaza. Si la respuesta llega DESPUÉS del
  // tiempo máximo se entrega a onLate (p. ej. un guardado que sí se completó).
  function callRpc(name, args, onLate) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ data: null, error: { message: 'timeout', code: '', timeout: true } });
      }, TIMEOUT_MS);
      var p;
      try { p = args ? sb.rpc(name, args) : sb.rpc(name); }
      catch (e) {
        clearTimeout(timer); done = true;
        resolve({ data: null, error: { message: String((e && e.message) || e), code: '' } });
        return;
      }
      Promise.resolve(p).then(function (r) {
        r = r || { data: null, error: { message: 'empty', code: '' } };
        if (!done) { done = true; clearTimeout(timer); resolve(r); }
        else if (onLate) { try { onLate(r); } catch (e) {} }
      }, function (e) {
        if (!done) {
          done = true; clearTimeout(timer);
          resolve({ data: null, error: { message: String((e && e.message) || e), code: '' } });
        }
      });
    });
  }

  function validStatus(d) {
    return !!d && typeof d === 'object' && !Array.isArray(d) &&
      typeof d.registered === 'boolean' && typeof d.is_new_account === 'boolean' &&
      (!d.registered || isMD(d.month, d.day));
  }
  function validSet(d) {
    return !!d && typeof d === 'object' && d.registered === true && isMD(d.month, d.day);
  }

  // ===== Estilos (inyectados una sola vez; usan las variables del sitio con respaldo) =====
  function injectStyle() {
    if ($('gabStyle')) return;
    var css =
      '#gaBdaySection[hidden],#gaBdayNotice[hidden]{display:none!important}' +
      '.gab-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,4,8,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);overflow-y:auto}' +
      '.gab-modal{position:relative;width:100%;max-width:400px;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;box-sizing:border-box;background:var(--card-bg,#131316);border:1px solid var(--border2,rgba(255,255,255,.16));border-radius:var(--radius-lg,24px);box-shadow:var(--card-shadow,0 24px 48px -28px rgba(0,0,0,.7));padding:28px 22px 22px;text-align:center;color:var(--text,#f6f6f8);font-family:"Inter",sans-serif;outline:none}' +
      '.gab-x{position:absolute;top:10px;right:10px;width:36px;height:36px;background:none;border:0;color:var(--text3,#6f6f7d);font-size:16px;cursor:pointer;line-height:1;border-radius:8px}' +
      '.gab-x:hover{color:var(--text,#f6f6f8)}' +
      '.gab-ic{font-size:34px;margin-bottom:.5rem}' +
      '.gab-modal h3{font-family:"Space Grotesk",sans-serif;font-size:1.3rem;margin:0 0 .6rem;color:var(--text,#f6f6f8)}' +
      '.gab-sub{color:var(--text2,#a9a9b4);font-size:14px;line-height:1.55;margin:0 0 1rem}' +
      '.gab-sub strong{color:var(--text,#f6f6f8)}' +
      '.gab-row{display:flex;gap:10px;text-align:left;margin-bottom:10px}' +
      '.gab-f{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text2,#a9a9b4)}' +
      '.gab-f select{width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;font-size:16px;font-family:inherit;color:var(--text,#f6f6f8);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:10px}' +
      '.gab-f select option{color:#111;background:#fff}' +
      '.gab-prev{min-height:1.4em;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:15px;color:var(--gold,#ffd23f);margin:2px 0 12px}' +
      '.gab-priv,.gab-gift,.gab-more{font-size:12px;line-height:1.5;color:var(--text2,#a9a9b4);text-align:left;margin:0 0 10px}' +
      '.gab-gift{padding:8px 10px;border-radius:10px;background:rgba(255,210,63,.08);border:1px solid rgba(255,210,63,.22)}' +
      '.gab-more{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04)}' +
      '.gab-link{background:none;border:0;padding:4px 0;margin:0 0 8px;color:var(--accent-light,#c9a3ff);font-size:12px;text-decoration:underline;cursor:pointer;display:block;text-align:left;font-family:inherit}' +
      '.gab-err{min-height:1.2em;color:#ff8080;font-size:13px;line-height:1.4;margin:0 0 8px;text-align:left}' +
      '.gab-actions{display:flex;gap:10px}' +
      '.gab-actions .gab-btn{flex:1}' +
      '.gab-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:44px;padding:10px 14px;border:0;border-radius:12px;cursor:pointer;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:14px;color:#fff;background:linear-gradient(135deg,var(--accent,#9147ff),#6c1fe0)}' +
      '.gab-btn:disabled{opacity:.5;cursor:not-allowed}' +
      '.gab-btn-2{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);color:var(--text,#f6f6f8)}' +
      '.gab-x:focus-visible,.gab-btn:focus-visible,.gab-link:focus-visible,.gab-f select:focus-visible{outline:2px solid var(--accent-light,#c9a3ff);outline-offset:2px}' +
      '.gab-notice{display:flex;align-items:center;gap:10px;flex-wrap:wrap;max-width:640px;margin:14px auto;padding:10px 14px;box-sizing:border-box;width:calc(100% - 32px);border-radius:14px;border:1px solid rgba(145,71,255,.4);background:rgba(145,71,255,.12);color:var(--text,#f6f6f8);font-size:13.5px;line-height:1.45}' +
      '.gab-notice-t{flex:1;min-width:180px}' +
      '.gab-notice-btn{min-height:36px;padding:6px 14px;border:0;border-radius:10px;cursor:pointer;font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(135deg,var(--accent,#9147ff),#6c1fe0)}' +
      '.gab-card-gift{margin:0;font-size:12px;line-height:1.5;color:var(--text2,#a9a9b4)}' +
      '#gaBdaySection .gab-card-gift{margin-top:10px}' +
      '#mgtPanel-cuenta .mgt-acct-grid>#gaBdaySection{grid-column:1/-1}' +
      '@container mgp (min-width:620px){#mgtPanel-cuenta #gaBdaySection .v3-x-card{flex-direction:row;align-items:center;justify-content:space-between}#mgtPanel-cuenta #gaBdaySection .v3-x-connect-btn{width:auto;min-width:180px}}' +
      '@media (max-width:420px){.gab-modal{padding:24px 16px 18px}.gab-actions{flex-direction:column-reverse}}' +
      '@media (prefers-reduced-motion:no-preference){.gab-modal{animation:gabIn .18s ease-out}@keyframes gabIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}';
    var s = document.createElement('style');
    s.id = 'gabStyle';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ===== Textos =====
  var GIFT_TXT = '🎁 Regalo de cumpleaños — todavía NO está activo. Cuando se active, los miembros de rango ' +
    'Oro I o superior podrán recibir 1,000 V-Bucks en su billetera de Geo Army una vez al año. Estará sujeto ' +
    'a las reglas definitivas, que se anunciarán antes de comenzar. Registrar tu fecha no garantiza ningún regalo.';
  var PRIV_TXT = '🔒 Solo guardamos tu día y mes, nunca tu año de nacimiento ni tu edad. No se muestra a otros ' +
    'miembros ni se usa para publicidad. Se almacena en nuestro proveedor de base de datos (Supabase), que lo ' +
    'procesa en nuestro nombre. Puedes pedir que lo eliminemos cuando quieras. Si eres menor de edad, te ' +
    'recomendamos hacerlo con conocimiento de tu madre, padre o tutor.';
  var MORE_TXT = 'Lo usamos para celebrar tu cumpleaños cada año en la comunidad y, cuando esté activo, para ' +
    'gestionar el regalo de cumpleaños. Lo ve el equipo de Geo Army solo para corregir errores o atender ' +
    'solicitudes. Se conserva mientras tengas cuenta; si eliminas tu cuenta, se elimina también. Para pedir su ' +
    'eliminación o corregir un error, escribe a ' + PRIVACY_CONTACT + '.';

  // ===== Superficies permanentes (aviso fino + tarjeta en Cuenta) =====
  function renderSurfaces() {
    var notice = $('gaBdayNotice'), section = $('gaBdaySection');
    var show = !!uid && !!st && !off;
    if (notice) notice.hidden = !(show && !st.registered);
    if (!section) return;
    section.hidden = !show;
    if (!show) return;
    var info = $('gaBdayInfo'), btn = $('gaBdayBtn');
    if (info) {
      if (st.registered) {
        var f = fmt(st.month, st.day);
        info.innerHTML = '<div class="v3-x-title"><span class="v3-x-check">✓</span> ' +
          (f ? 'Tu cumpleaños: ' + esc(f) : 'Tu cumpleaños ya está registrado') + '</div>' +
          '<p class="v3-x-desc">Solo tú y el equipo de Geo Army lo ven.</p>';
      } else {
        info.innerHTML = '<div class="v3-x-title">Aún no registras tu cumpleaños</div>' +
          '<p class="v3-x-desc">Solo necesitamos tu día y mes. No se muestra a otros miembros.</p>';
      }
    }
    if (btn) btn.hidden = !!st.registered;
    var gift = $('gaBdayGift');
    if (gift) gift.textContent = GIFT_TXT;
  }

  // ===== Formulario (modal) =====
  function focusables(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href]'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }

  function closeForm() {
    var f = active;
    if (!f) return;
    active = null;
    f.alive = false;
    document.removeEventListener('keydown', f.onKey, true);
    if (f.ov && f.ov.parentNode) f.ov.parentNode.removeChild(f.ov);
    try { document.documentElement.style.overflow = f.prevOverflow || ''; } catch (e) {}
    try { if (f.prevFocus && f.prevFocus.focus && document.contains(f.prevFocus)) f.prevFocus.focus(); } catch (e) {}
  }

  // Cierre pedido por la persona (X, Esc, fuera del cuadro). Solo si el modo lo permite.
  function dismissForm(f) {
    if (!f || !f.alive || f.saving) return;
    if (f.mode === 'onboarding' && f.step !== 'done') return;   // el onboarding solo se cierra al terminar (o con la salida de emergencia)
    if (f.mode === 'invite' && (f.step === 'pick' || f.step === 'confirm') && uid) setDismissed(uid);
    closeForm();
  }

  function openForm(mode) {
    if (active) { try { active.modal.focus(); } catch (e) {} return; }   // sin formularios duplicados
    if (!uid || !st || st.registered || off) return;
    injectStyle();

    var closable = mode !== 'onboarding';
    var ov = document.createElement('div');
    ov.className = 'gab-ov';
    ov.innerHTML =
      '<div class="gab-modal" role="dialog" aria-modal="true" aria-labelledby="gabTitle" tabindex="-1">' +
        (closable ? '<button type="button" class="gab-x" data-a="close" aria-label="Cerrar">✕</button>' : '') +
        '<div class="gab-ic" aria-hidden="true">🎂</div>' +
        '<h3 id="gabTitle"></h3>' +
        '<div class="gab-body"></div>' +
      '</div>';
    var f = {
      mode: mode, g: gen, alive: true, step: 'pick', saving: false, month: 0, day: 0,
      ov: ov, modal: ov.firstChild, body: ov.querySelector('.gab-body'), title: ov.querySelector('#gabTitle'),
      prevFocus: document.activeElement, prevOverflow: document.documentElement.style.overflow
    };
    f.onKey = function (e) {
      if (!f.alive) return;
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault(); e.stopPropagation();
        dismissForm(f);   // dismissForm ignora Esc en el onboarding mientras no haya terminado
        return;
      }
      if (e.key === 'Tab') {                                 // el foco no se escapa del cuadro
        var list = focusables(f.modal);
        if (!list.length) { e.preventDefault(); f.modal.focus(); return; }
        var first = list[0], last = list[list.length - 1], cur = document.activeElement;
        if (!f.modal.contains(cur)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
      }
    };
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && closable) dismissForm(f); });
    ov.addEventListener('click', function (e) { onClick(f, e); });
    ov.addEventListener('change', function (e) { onChange(f, e); });
    document.addEventListener('keydown', f.onKey, true);
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
    document.body.appendChild(ov);
    active = f;

    f.title.textContent = mode === 'onboarding'
      ? 'Bienvenido/a a Geo Army' + (nameHint ? ', ' + nameHint : '')
      : 'Registra tu cumpleaños';
    renderPick(f, '');
  }

  function setBody(f, html, focusSel) {
    f.body.innerHTML = html;
    var el = focusSel ? f.body.querySelector(focusSel) : null;
    try { (el || f.modal).focus(); } catch (e) {}
  }

  function monthOptions(sel) {
    var h = '<option value="" disabled' + (sel ? '' : ' selected') + '>Mes</option>';
    for (var i = 1; i <= 12; i++) h += '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + MONTHS[i - 1] + '</option>';
    return h;
  }
  function dayOptions(m, sel) {
    var max = m ? DAYS_IN[m - 1] : 31;
    var h = '<option value="" disabled' + (sel ? '' : ' selected') + '>Día</option>';
    for (var i = 1; i <= max; i++) h += '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + i + '</option>';
    return h;
  }

  function renderPick(f, errMsg) {
    f.step = 'pick';
    var lead = f.mode === 'onboarding'
      ? 'Para celebrar tu cumpleaños en la comunidad, te pedimos tu <strong>día y mes</strong>.'
      : 'Ahora puedes registrar tu cumpleaños en Geo Army. Solo necesitamos tu <strong>día y mes</strong>.';
    setBody(f,
      '<p class="gab-sub">' + lead + '</p>' +
      '<div class="gab-row">' +
        '<label class="gab-f"><span>Mes</span><select id="gabMonth" data-f="month">' + monthOptions(f.month) + '</select></label>' +
        '<label class="gab-f"><span>Día</span><select id="gabDay" data-f="day">' + dayOptions(f.month, f.day) + '</select></label>' +
      '</div>' +
      '<div class="gab-prev" id="gabPrev" aria-live="polite">' + (isMD(f.month, f.day) ? esc(fmt(f.month, f.day)) : '') + '</div>' +
      '<p class="gab-priv">' + esc(PRIV_TXT) + '</p>' +
      '<button type="button" class="gab-link" data-a="more" aria-expanded="false" aria-controls="gabMore">¿Qué hacemos con este dato?</button>' +
      '<p class="gab-more" id="gabMore" hidden>' + esc(MORE_TXT) + '</p>' +
      '<p class="gab-gift">' + esc(GIFT_TXT) + '</p>' +
      '<div class="gab-err" role="alert">' + esc(errMsg) + '</div>' +
      '<button type="button" class="gab-btn" id="gabNext" data-a="next"' + (isMD(f.month, f.day) ? '' : ' disabled') + '>Continuar</button>',
      '#gabMonth');
  }

  function renderConfirm(f, errMsg) {
    f.step = 'confirm';
    f.saving = false;
    setBody(f,
      '<p class="gab-sub">¿Tu cumpleaños es el <strong>' + esc(fmt(f.month, f.day)) + '</strong>?</p>' +
      '<p class="gab-priv">Una vez guardado no podrás cambiarlo por tu cuenta; si cometes un error, escríbele a ' +
        esc(PRIVACY_CONTACT) + ' y lo revisamos.</p>' +
      '<div class="gab-err" role="alert">' + esc(errMsg) + '</div>' +
      '<div class="gab-actions">' +
        '<button type="button" class="gab-btn gab-btn-2" data-a="back">Cambiar</button>' +
        '<button type="button" class="gab-btn" id="gabSave" data-a="save">Sí, guardar</button>' +
      '</div>',
      '#gabSave');
  }

  function renderSaving(f) {
    f.step = 'saving';
    f.saving = true;
    setBody(f, '<p class="gab-sub" role="status">Guardando tu cumpleaños…</p>' +
      '<div class="gab-actions"><button type="button" class="gab-btn" disabled>Guardando…</button></div>');
  }

  function renderDone(f, already) {
    f.step = 'done';
    f.saving = false;
    var txt = fmt(st && st.month, st && st.day);
    setBody(f,
      '<p class="gab-sub" role="status">' + (already ? 'Ya tenías tu cumpleaños registrado' : '¡Listo! Tu cumpleaños quedó registrado') +
        (txt ? ': <strong>' + esc(txt) + '</strong>' : '') + '.</p>' +
      '<p class="gab-gift">' + esc(GIFT_TXT) + '</p>' +
      '<button type="button" class="gab-btn" id="gabClose" data-a="close">Cerrar</button>',
      '#gabClose');
  }

  function renderChecking(f) {
    f.step = 'checking';
    f.saving = true;   // mientras consulta no se puede cerrar ni reenviar
    setBody(f, '<p class="gab-sub" role="status">Consultando tu cumpleaños…</p>' +
      '<div class="gab-actions"><button type="button" class="gab-btn" disabled>Consultando…</button></div>');
  }

  // Ya había una fecha, pero no pudimos leerla: error recuperable.
  function renderRecheck(f) {
    f.step = 'recheck';
    f.saving = false;
    var exit = f.mode === 'onboarding'
      ? '<button type="button" class="gab-btn gab-btn-2" data-a="cont">Continuar</button>'   // salida de emergencia (error técnico)
      : '<button type="button" class="gab-btn gab-btn-2" data-a="close">Cerrar</button>';
    setBody(f,
      '<p class="gab-sub" role="alert">Parece que ya tienes un cumpleaños registrado, pero no pudimos consultarlo ' +
        'ahora mismo. No se ha cambiado nada.</p>' +
      '<div class="gab-actions">' + exit +
        '<button type="button" class="gab-btn" id="gabRecheck" data-a="recheck">Volver a consultar</button>' +
      '</div>',
      '#gabRecheck');
  }

  // Salida de emergencia: solo ante error técnico durante el onboarding.
  function renderEmergency(f) {
    f.step = 'emergency';
    f.saving = false;
    setBody(f,
      '<p class="gab-sub" role="alert">No pudimos guardar tu cumpleaños ahora mismo. Puedes seguir usando Geo Army; ' +
        'te lo pediremos de nuevo la próxima vez.</p>' +
      '<div class="gab-actions">' +
        '<button type="button" class="gab-btn gab-btn-2" data-a="retry">Reintentar</button>' +
        '<button type="button" class="gab-btn" id="gabCont" data-a="cont">Continuar</button>' +
      '</div>',
      '#gabCont');
  }

  function onChange(f, e) {
    if (!f.alive || f.step !== 'pick') return;
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var which = t.getAttribute('data-f');
    if (which !== 'month' && which !== 'day') return;
    var v = parseInt(t.value, 10);
    if (which === 'month') {
      f.month = isInt(v) ? v : 0;
      if (f.month && f.day > DAYS_IN[f.month - 1]) f.day = 0;
      var dsel = $('gabDay');
      if (dsel) dsel.innerHTML = dayOptions(f.month, f.day);
    } else {
      f.day = isInt(v) ? v : 0;
    }
    var ok = isMD(f.month, f.day);
    var prev = $('gabPrev'), next = $('gabNext');
    if (prev) prev.textContent = ok ? fmt(f.month, f.day) : '';
    if (next) next.disabled = !ok;
  }

  function onClick(f, e) {
    if (!f.alive) return;
    var b = e.target && e.target.closest ? e.target.closest('[data-a]') : null;
    if (!b || !f.modal.contains(b) || b.disabled) return;
    var a = b.getAttribute('data-a');
    if (a === 'close') { dismissForm(f); return; }
    if (a === 'more') {
      var more = $('gabMore'), open = more.hidden;
      more.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if (a === 'next') { if (isMD(f.month, f.day)) renderConfirm(f, ''); return; }
    if (a === 'back') { renderPick(f, ''); return; }
    if (a === 'save') { doSave(f); return; }
    if (a === 'retry') { renderConfirm(f, ''); return; }
    if (a === 'recheck') { afterAlready(f, f.g); return; }
    if (a === 'cont') { if (uid) setSkip(uid); closeForm(); return; }
  }

  // ===== Guardado =====
  function setRegistered(m, d) {
    if (!isMD(m, d)) return;   // nunca se marca "registrado" sin una fecha confirmada por el servidor
    st = { registered: true, month: m, day: d, isNew: st ? st.isNew : false };
    renderSurfaces();
    try {
      document.dispatchEvent(new CustomEvent('geoarmy:birthday-registered', { detail: { uid: uid } }));
    } catch (e) {}
  }

  function doSave(f) {
    if (f.saving || !f.alive || !isMD(f.month, f.day)) return;   // protege contra doble clic
    var g = f.g, m = f.month, d = f.day;
    renderSaving(f);
    callRpc('set_my_birthday', { p_month: m, p_day: d }, function (r) {
      // Respuesta tardía: solo importa si el guardado SÍ se completó.
      if (g !== gen) return;
      if (!r.error && validSet(r.data)) { setRegistered(r.data.month, r.data.day); if (f.alive) renderDone(f, false); }
      else if (r.error && classify(r.error) === 'already') { afterAlready(f, g); }
    }).then(function (r) { handleSave(f, g, r); });
  }

  function handleSave(f, g, r) {
    if (g !== gen) return;                       // cambió la cuenta: respuesta descartada
    var err = r && r.error;
    if (!err && validSet(r.data)) {
      setRegistered(r.data.month, r.data.day);
      if (f.alive) renderDone(f, false);
      return;
    }
    var kind = err ? classify(err) : 'tech';     // respuesta sin forma esperada = error técnico
    if (kind === 'already') { afterAlready(f, g); return; }
    if (kind === 'invalid') {
      if (f.alive) { f.saving = false; renderPick(f, 'La fecha no es válida. Revisa el mes y el día.'); }
      return;
    }
    if (kind === 'noauth') { closeForm(); return; }       // sin sesión: no se muestra nada
    if (kind === 'off') { off = true; closeForm(); renderSurfaces(); return; }
    // 'profile' | 'tech'
    if (!f.alive) return;
    if (f.mode === 'onboarding') renderEmergency(f);
    else renderConfirm(f, 'No pudimos guardar tu cumpleaños ahora mismo. Intenta de nuevo en unos minutos.');
  }

  // El servidor dice que ya había una fecha (otra pestaña, doble envío): se consulta cuál es.
  // Si esa consulta falla o no confirma una fecha, NO se marca como registrado: se muestra un
  // error recuperable con "Volver a consultar" y el estado local queda como estaba.
  function afterAlready(f, g) {
    if (f.alive) renderChecking(f);
    callRpc('get_my_birthday_status').then(function (r) {
      if (g !== gen) return;
      var d = r && !r.error ? r.data : null;
      if (validStatus(d) && d.registered) {
        setRegistered(d.month, d.day);
        if (f.alive) renderDone(f, true);
        return;
      }
      var kind = r && r.error ? classify(r.error) : 'tech';
      if (kind === 'noauth') { closeForm(); return; }
      if (kind === 'off') { off = true; closeForm(); renderSurfaces(); return; }
      if (f.alive) renderRecheck(f, g);
    });
  }

  // ===== Carga de estado e identidad =====
  function applyState() {
    renderSurfaces();
    if (!st || st.registered || off) return;
    var g = gen;
    if (st.isNew) {
      if (!getSkip(uid)) openForm('onboarding');
      return;
    }
    if (FULL && !skipInvite && !getDismissed(uid)) {
      setTimeout(function () {   // deja que el panel termine de pintarse
        if (g !== gen || !st || st.registered || off || active) return;
        if (document.querySelector('.ga-modal-overlay')) return;   // hay otro modal abierto
        openForm('invite');
      }, 700);
    }
  }

  function loadStatus(id, g) {
    callRpc('get_my_birthday_status').then(function (r) {
      if (g !== gen || id !== uid) return;
      if (r.error) {
        if (classify(r.error) === 'off') off = true;
        else console.warn('[geoarmy-birthday] no se pudo consultar el estado', r.error.message || r.error);
        renderSurfaces();
        return;                       // fallo de consulta: sin UI y sin bloquear nada
      }
      if (!validStatus(r.data)) {
        console.warn('[geoarmy-birthday] respuesta inesperada de get_my_birthday_status');
        return;
      }
      st = {
        registered: r.data.registered,
        month: r.data.registered ? r.data.month : null,
        day: r.data.registered ? r.data.day : null,
        isNew: r.data.is_new_account
      };
      applyState();
    });
  }

  function onSession(session) {
    var id = session && session.user ? session.user.id : null;
    if (id === uid) { if (session) nameHint = nameOf(session) || nameHint; return; }   // refresco de token / duplicado
    closeForm();
    uid = id; gen++; st = null; nameHint = '';
    renderSurfaces();
    if (!id) return;
    nameHint = nameOf(session);
    loadStatus(id, gen);
  }

  // Botones de las superficies permanentes.
  function wire() {
    var b1 = $('gaBdayBtn'), b2 = $('gaBdayNoticeBtn');
    function open() { openForm('card'); }
    if (b1) b1.addEventListener('click', open);
    if (b2) b2.addEventListener('click', open);
  }

  function init() {
    injectStyle();
    wire();
    renderSurfaces();
    // Nunca se hace una llamada a supabase DENTRO del callback de auth (riesgo de bloqueo): se difiere.
    sb.auth.onAuthStateChange(function (event, session) {
      sessionSeen = true;
      setTimeout(function () { onSession(session); }, 0);
    });
    // Respaldo por si el evento inicial no llegara (versiones antiguas del cliente).
    Promise.resolve(sb.auth.getSession()).then(function (r) {
      if (!sessionSeen) onSession(r && r.data ? r.data.session : null);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
