/* GEO ARMY — Tema de Navidad 2026, solo presentación.
   Diseño aprobado en geoarmy-v2. Tienda y sistemas internos excluidos. */
(function(){
  'use strict';
  var script=document.currentScript, root=document.documentElement;
  if(!script||!script.src)return;
  var base=new URL('../',script.src), rel=location.pathname.indexOf(base.pathname)===0?location.pathname.slice(base.pathname.length):location.pathname.replace(/^\//,'');
  var page=rel.replace(/index\.html$/,'').replace(/\.html$/,'').replace(/\/$/,'')||'index';
  var PAGES={'index':'native','ranking':'full','ganadores':'full','mi-geoarmy':'full','plus':'full','misiones':'full','comunidad':'full','puntos':'full','guia':'full','pinatas':'full','streamer-vs-viewer':'full'};
  var profile=PAGES[page];if(!profile)return;
  var start=Date.parse('2026-12-01T00:00:00-05:00'), end=Date.parse('2027-01-01T00:00:00-05:00');
  var state=false,sheets=[],fx=null,glow=null;
    var LAYERS = {
      snow: '<div class="ga-xmas-snow"><i class="ga-sn-far"></i><i class="ga-sn-near"></i></div>',
      lights: '<div class="ga-xmas-garland"><i class="ga-gl-a"></i><i class="ga-gl-b"></i></div>',
      corners: '<span class="ga-xmas-corner ga-xmas-corner--tl"></span><span class="ga-xmas-corner ga-xmas-corner--tr"></span>' +
               '<span class="ga-xmas-corner ga-xmas-corner--bl"></span><span class="ga-xmas-corner ga-xmas-corner--br"></span>'
    };


  function addCss(path){var l=document.createElement('link');l.rel='stylesheet';l.href=new URL(path,base).href;l.setAttribute('data-ga-season-css','');document.head.appendChild(l);sheets.push(l);}
  function update(){
    var body=document.body;if(!body)return;
    var now=Date.now(),active=now>=start&&now<end;if(active===state)return;state=active;
    if(!active){
      root.removeAttribute('data-ga-season');root.removeAttribute('data-ga-scope');root.removeAttribute('data-ga-nov3');
      body.classList.remove('ga-theme-christmas');sheets.forEach(function(l){l.remove();});sheets=[];
      if(fx)fx.remove();if(glow)glow.remove();fx=null;glow=null;return;
    }
    root.setAttribute('data-ga-page',page);root.setAttribute('data-ga-season','navidad-2026');root.setAttribute('data-ga-scope',profile);
    body.classList.add('ga-theme-christmas');
    if(profile==='native'){addCss('css/christmas-home.css?v=6');addCss('css/seasons/navidad-2026-guide.css?v=1');}
    else {addCss('css/seasons/season-base.css?v=1');addCss('css/seasons/navidad-2026.css?v=1');}
    var host=document.querySelector('.v3-page');
    if(!host){host=body;root.setAttribute('data-ga-nov3','');}
    if(!document.querySelector('.ga-xmas-fx')){
      fx=document.createElement('div');fx.className='ga-xmas-fx';fx.setAttribute('aria-hidden','true');
      fx.innerHTML=LAYERS.corners+LAYERS.snow+LAYERS.lights;host.insertBefore(fx,host.firstChild);
    }
    if(profile==='native'){
      var hero=document.querySelector('#inicio');
      if(hero&&!hero.querySelector('.ga-xmas-glow')){
        glow=document.createElement('div');glow.className='ga-xmas-glow';glow.setAttribute('aria-hidden','true');
        glow.innerHTML='<div class="ga-gw-aura"></div><div class="ga-gw-sparkle ga-gw-sp-a"></div><div class="ga-gw-sparkle ga-gw-sp-b"></div>';hero.insertBefore(glow,hero.firstChild);
      }
    }
  }
  function ready(){
    if(!document.querySelector('script[src*="navidad-perfiles-2026.js"]')){
      var p=document.createElement('script');p.src=new URL('js/navidad-perfiles-2026.js?v=20261201',base).href;p.async=true;document.head.appendChild(p);
    }
    update();setInterval(update,1000);document.addEventListener('visibilitychange',function(){if(!document.hidden)update();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
