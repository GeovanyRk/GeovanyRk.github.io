(function(){
  var start=Date.parse('2026-12-01T00:00:00-05:00'), epoch=null, tick=0, busy=false, launched=false;
  window.gaChristmasClock=function(){return epoch===null?NaN:epoch+performance.now()-tick;};
  function launch(){if(launched||!(window.gaChristmasClock()>=start))return;launched=true;mount();}
  async function sync(){if(busy)return;busy=true;try{
    var res=await fetch(window.GEOARMY_SUPABASE_URL+'/rest/v1/rpc/christmas_travel_v1',{method:'POST',headers:{apikey:window.GEOARMY_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:'{}',cache:'no-store'});
    if(!res.ok)throw Error('clock');var data=await res.json();var time=Date.parse(data.serverNow);if(!Number.isFinite(time))throw Error('clock');epoch=time;tick=performance.now();launch();
  }catch(e){}finally{busy=false;}}
  function mount(){
    (function () {
      if (window.__gaSantaMounted) return;
      var world = document.getElementById('wlOnePieceWorld');
      var link = document.getElementById('wlOnePieceOpen');
      if (!world || !link) return;
      var art = link.querySelector('img');
      var title = link.querySelector('.world-02-open-title');
      var subtitle = link.querySelector('.world-02-open-sub');
      if (!art || !title || !subtitle) return;
      var preview = new Image();
      preview.onload = function () {
        if (!preview.naturalWidth || window.__gaSantaMounted) return; window.__gaSantaMounted = true;
        if (!art.parentElement.classList.contains('ga-santa-art')) {
          var stage = document.createElement('span');
          stage.className = 'ga-santa-art';
          stage.id = 'gaSantaArt';
          // El marco es hermano del enlace original: evita enlaces anidados.
          link.parentNode.insertBefore(stage, link);
          stage.appendChild(art);
          var pin = document.createElement('a');
          pin.className = 'ga-santa-tree-pin';
          pin.href = 'navidad-arbol.html';
          pin.setAttribute('aria-label', 'Árbol de Navidad');
          pin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true">🎄</span><span class="ga-santa-pin-label">ÁRBOL DE NAVIDAD</span>';
          stage.appendChild(pin);
          var workshopPin = document.createElement('a');
          workshopPin.className = 'ga-santa-tree-pin ga-santa-workshop-pin';
          workshopPin.href = 'navidad-taller.html';
          workshopPin.setAttribute('aria-label', 'Entrar al Taller de Santa');
          workshopPin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true">🛠️</span><span class="ga-santa-pin-label">TALLER DE SANTA</span>';
          stage.appendChild(workshopPin);
          var postPin = document.createElement('a');
          postPin.className = 'ga-santa-tree-pin ga-santa-post-pin';
          postPin.href = 'navidad-cartas.html';
          postPin.setAttribute('aria-label', 'Oficina de Correos de Santa');
          postPin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true"><svg viewBox="0 0 36 36" width="28" height="28" fill="none"><rect x="4" y="9" width="28" height="19" rx="3" fill="#e8d2a7" stroke="#b98a50"/><path d="M5 10l13 11 13-11M5 27l9-9m17 9-9-9" stroke="#a67440" stroke-width="1.5"/><circle cx="18" cy="21" r="4" fill="#a3342d" stroke="#dc8b6d"/></svg></span><span class="ga-santa-pin-label">OFICINA DE CORREOS</span>';
          stage.appendChild(postPin);
          var listPin = document.createElement('a');
          listPin.className = 'ga-santa-tree-pin ga-santa-list-pin';
          listPin.href = 'navidad-lista.html';
          listPin.setAttribute('aria-label', 'La Lista de Santa');
          listPin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true"><svg viewBox="0 0 36 36" width="28" height="28" fill="none"><rect x="8" y="4" width="21" height="28" rx="3" fill="#ecd6aa" stroke="#bb9156"/><path d="M13 10h10M13 15h10M13 20h7" stroke="#9b7047" stroke-width="1.5"/><circle cx="25" cy="26" r="6" fill="#a3342d" stroke="#e9b58e"/><path d="m22 26 2 2 4-5" stroke="#f7dfb7" stroke-width="1.5"/></svg></span><span class="ga-santa-pin-label">LISTA DE SANTA</span>';
          stage.appendChild(listPin);
          var travelPin = document.createElement('a');
          travelPin.className = 'ga-santa-tree-pin ga-santa-travel-pin';
          travelPin.href = 'navidad-viaje.html';
          travelPin.setAttribute('aria-label', 'Viaje de Santa');
          travelPin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true"><svg viewBox="0 0 36 36" width="28" height="28" fill="none"><path d="M4 26h19c6 0 9-4 9-8M8 22l-3-9h7l3 5h10l2-7h5l-2 11H8Z" fill="#a83b32" stroke="#e9c184" stroke-width="1.7" stroke-linejoin="round"/><path d="m12 13 1-6h9l2 8" fill="#f0d8aa" stroke="#cc9f59"/><path d="M17 7v8M13 10h10M9 23v3m14-3v3" stroke="#d5ac68" stroke-width="1.5"/></svg></span><span class="ga-santa-pin-label">VIAJE DE SANTA</span>';
          stage.appendChild(travelPin);
          var regaloPin = document.createElement('a');
          regaloPin.className = 'ga-santa-tree-pin ga-santa-regalo-pin';
          regaloPin.href = 'navidad-regalo.html';
          regaloPin.setAttribute('aria-label', 'Mi regalo de Navidad');
          regaloPin.innerHTML = '<span class="ga-santa-pin-icon" aria-hidden="true"><svg viewBox="0 0 36 36" width="28" height="28" fill="none"><rect x="6" y="15" width="24" height="17" rx="2" fill="#a43b36" stroke="#e9bd75" stroke-width="1.5"/><rect x="4" y="11" width="28" height="6" rx="1.5" fill="#c44b3b" stroke="#f2cd8b"/><path d="M18 11v21M18 11C7 11 7 2 12 4c3 1 6 7 6 7Zm0 0c11 0 11-9 6-7-3 1-6 7-6 7Z" stroke="#e9bd75" stroke-width="2"/></svg></span><span class="ga-santa-pin-label">MI REGALO</span>';
          stage.appendChild(regaloPin);
          var iconArt = new Image();
          iconArt.alt = '';
          iconArt.className = 'ga-santa-pin-art';
          iconArt.onload = function () {
            var oldIcon = pin.querySelector('.ga-santa-pin-icon');
            if (oldIcon && iconArt.naturalWidth) oldIcon.replaceWith(iconArt);
          };
          iconArt.src = new URL('assets/navidad/pin-arbol-navidad.webp', document.baseURI).href;
        }
        world.classList.add('ga-santa-world');
        art.src = preview.src;
        art.alt = 'El Taller de Santa: fábrica navideña de juguetes';
        title.textContent = 'MUNDO 02 · EL TALLER DE SANTA';
        subtitle.textContent = 'Explora las seis actividades de Navidad';
        world.classList.add('is-unlocked');
        world.classList.remove('v3-world-locked');
        world.setAttribute('aria-label', 'Mundo 02 — El Taller de Santa');
        link.hidden = false;
        link.removeAttribute('href');
        link.removeAttribute('tabindex');
        link.setAttribute('aria-label', 'El Taller de Santa');
        link.style.cursor = 'default';
        var last = document.createElement('a');
        last.href = 'onepiece.html'; last.className = 'ga-onepiece-last';
        link.parentNode.insertBefore(last, link.nextSibling);
        function lastUpdate() {
          var left = Date.parse('2026-12-02T00:00:00-05:00') - window.gaChristmasClock();
          last.hidden = left <= 0;
          if (!last.hidden) {
            var sec=Math.max(0,Math.floor(left/1000));
            last.textContent='Últimas horas · Mini Pase One Piece · '+Math.floor(sec/3600)+'h '+String(Math.floor(sec%3600/60)).padStart(2,'0')+'m '+String(sec%60).padStart(2,'0')+'s →';
          }
        }
        lastUpdate();setInterval(lastUpdate,1000);

        // El temporizador previo de One Piece vuelve a actualizar su etiqueta
        // al recuperar visibilidad; restauramos únicamente la etiqueta visual.
        document.addEventListener('visibilitychange', function () {
          world.setAttribute('aria-label', 'Mundo 02 — El Taller de Santa');
          link.removeAttribute('tabindex');
        });
      };
      // Fase 1: usar el nuevo taller cuando esté disponible; conservar el anterior como respaldo.
      preview.onerror = function () {
        preview.onerror = null;
        preview.src = new URL('assets/navidad/planeta-santa-720.webp', document.baseURI).href;
      };
      preview.src = new URL('assets/navidad/planeta-santa-fase-01.webp', document.baseURI).href;
    })();
  }
  sync();setInterval(sync,60000);setInterval(launch,1000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)sync();});
})();