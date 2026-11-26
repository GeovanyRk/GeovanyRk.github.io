/* GEO ARMY: adornos de perfil, solo visuales. Fechas en hora del Este. */
(function () {
  'use strict';
  var root = document.documentElement;
  var script = document.currentScript;
  var base = script && script.src ? new URL('../', script.src).href : './';
  var start = Date.parse('2026-12-01T00:00:00-05:00');
  var end = Date.parse('2027-01-01T00:00:00-05:00');
  var sheet;
  function update() {
    var now = Date.now();
    var active = now >= start && now < end;
    if (active && !sheet) { sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = base + 'css/navidad-perfiles-2026.css?v=4'; document.head.appendChild(sheet); }
    if (active) root.setAttribute('data-ga-profile-christmas', 'on');
    else root.removeAttribute('data-ga-profile-christmas');
  }
  update();
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) update(); });
}());
