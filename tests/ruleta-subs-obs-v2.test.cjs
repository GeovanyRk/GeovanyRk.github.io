'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const controller = fs.readFileSync(path.join(root,'js/ruleta-subs-autoescena-v2.js'),'utf8');
const html = fs.readFileSync(path.join(root,'ruleta-subs-obs-v2.html'),'utf8');
const overlay = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const bridge = fs.readFileSync(path.join(root,'js/ruleta-subs-obs-v2.js'),'utf8');

function fixture(options={}) {
  const timers=new Set(), listener={}, motions=[]; let closed=false;
  const schedule=(fn,ms)=>{if(closed)return null;const delay=ms===2000?100:Math.max(1,Math.round((ms||0)/400));const id=setTimeout(()=>{timers.delete(id);if(!closed)fn()},delay);timers.add(id);return id};
  const cancel=id=>{clearTimeout(id);timers.delete(id)};
  const notify=(name,detail)=>{for(const fn of listener[name]||[])fn({detail})};
  class Elem {
    constructor(){this.children=[];this.textContent='';this.className='';this.hidden=false;this.style={setProperty(k,v){this[k]=v}};this.classes=new Set();this.classList={add:(...x)=>x.forEach(y=>this.classes.add(y)),remove:(...x)=>x.forEach(y=>this.classes.delete(y)),contains:x=>this.classes.has(x)};this.motions=[]}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=[...nodes]}
    getBoundingClientRect(){return {height:260}}
    getAnimations(){return this.motions.filter(x=>x.state!=='idle')}
    animate(frames,settings){let resolve,reject;const m={duration:settings.duration,state:'running',finished:new Promise((r,j)=>{resolve=r;reject=j}),pause(){this.state='paused'},play(){this.state='running'},cancel(){this.state='idle'},finish(){if(this.state!=='finished'){this.state='finished';resolve()}},fail(){this.state='idle';reject(new Error('fallo simulado'))}};this.motions.push(m);motions.push(m);if(options.failAnimation)schedule(()=>m.fail(),400);else if(options.manualAnimations!==true)schedule(()=>m.finish(),400);return m}
  }
  const stage=new Elem(),viewer=new Elem(),game=new Elem(),result=new Elem(),status=new Elem(),body=new Elem();
  const reels=Array.from({length:3},()=>{const reel=new Elem();reel.belt=new Elem();reel.querySelector=()=>reel.belt;return reel});
  const named={'#stage':stage,'#viewer':viewer,'#game':game,'#result':result,'#auto-status':status};
  const document={hidden:!!options.initiallyHidden,body,querySelector:s=>named[s],querySelectorAll:()=>reels,createElement:()=>new Elem(),addEventListener:(name,fn)=>{(listener['doc:'+name]??=[]).push(fn)}};
  const state={scene:'Juego',scenes:options.scenes||['Juego','Sub','Charlando'],level:options.level??4,trace:[],requests:[],acknowledged:[],sounds:0,soundScenes:[]};
  const window={addEventListener:(name,fn)=>{(listener[name]??=[]).push(fn)},matchMedia:()=>({matches:false})};
  window.obsstudio={
    getControlLevel:cb=>queueMicrotask(()=>cb(state.level)),
    getScenes:cb=>queueMicrotask(()=>cb([...state.scenes])),
    getCurrentScene:cb=>{if(options.slowReturn && state.scene==='Sub' && motions.length>0 && !stage.classList.contains('visible')) setTimeout(()=>cb({name:state.scene}),30);else queueMicrotask(()=>cb({name:state.scene}))},
    setCurrentScene:name=>{state.trace.push(name);if(options.ignoreSwitch)return;state.scene=name;notify('obsSceneChanged',{name});if(options.targetHasSource===false || options.initiallyHidden){const visible=options.targetHasSource===false ? name!=='Sub' : name==='Sub';document.hidden=!visible;notify('obsSourceVisibleChanged',{visible});}},
  };
  if(options.noOBS)delete window.obsstudio;
  class AudioMock {constructor(){this.currentTime=0;this.paused=true;state.audio=this}addEventListener(){}pause(){this.paused=true}play(){this.paused=false;state.sounds++;state.soundScenes.push(state.scene);return Promise.resolve()}}
  let queue=(options.events||[]).map(x=>({...x}));
  const fetch=async(url,opts={})=>{
    state.requests.push({url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):null});
    if(options.fetchStatus)return {ok:false,status:options.fetchStatus,json:async()=>({})};
    const body=opts.body?JSON.parse(opts.body):{};
    if(body.id){state.acknowledged.push(body.id);queue=queue.filter(e=>e.id!==body.id);return {ok:true,status:200,json:async()=>({ok:true})}}
    return {ok:true,status:200,json:async()=>queue[0]||null};
  };
  const location={search:options.search||'',hash:options.hash===undefined?'#cola=key-ficticia&auto=1':options.hash};
  const env={window,document,location,URLSearchParams,Promise,Number,Object,String,Boolean,Array,Error,Audio:AudioMock,setTimeout:schedule,clearTimeout:cancel,performance:{now:()=>Date.now()},crypto:{randomUUID:()=> 'mock-claim'},AbortSignal:{timeout:()=>undefined},fetch,console};
  const ctx=vm.createContext(env);
  if(!options.missingController)vm.runInContext(controller,ctx);
  vm.runInContext(overlay,ctx);
  vm.runInContext(bridge,ctx);
  return {state,window,document,stage,viewer,game,result,status,reels,motions,notify,close(){closed=true;for(const t of timers)clearTimeout(t);timers.clear()}};
}
async function until(fn,label,ms=800){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,3))}throw Error('Tiempo agotado: '+label)}
const win={id:'id-demo-1',viewer:'Geo',game:'fortnite',win:true,amount:1200,guaranteed:false};
const loss={id:'id-demo-2',viewer:'Geo',game:'overwatch',win:false,amount:null,guaranteed:false};

test('cambia a la ruleta y vuelve solo después de mostrar y confirmar la tirada',async()=>{
  const f=fixture({events:[win],manualAnimations:true});
  try {
    assert.equal(f.stage.classList.contains('visible'),false,'espera transparente');
    await until(()=>f.motions.length===3,'inicio de animación');
    assert.equal(f.state.scene,'Sub');assert.deepEqual(f.state.trace,['Sub']);
    assert.deepEqual(f.state.acknowledged,[],'no confirmar antes de reproducir');
    assert.equal(f.state.sounds,1);
    f.motions.forEach(m=>m.finish());
    await until(()=>f.state.acknowledged.includes(win.id),'confirmación');
    await until(()=>f.state.scene==='Juego','regreso a escena anterior');
    assert.deepEqual(f.state.trace,['Sub','Juego']);
    assert.equal(f.stage.classList.contains('visible'),false);
    assert.equal(f.state.acknowledged.filter(x=>x===win.id).length,1);
  } finally {f.close()}
});

test('vigila la cola con la fuente oculta, entra a Sub y vuelve al terminar',async()=>{
  const f=fixture({events:[win],initiallyHidden:true,manualAnimations:true});
  try {
    await until(()=>f.motions.length===3,'inicio con la fuente antes oculta');
    assert.equal(f.state.scene,'Sub');
    assert.deepEqual(f.motions.map(m=>m.duration),[3000,4000,5000]);
    assert.deepEqual(f.state.acknowledged,[]);
    f.motions.forEach(m=>m.finish());
    await until(()=>f.state.acknowledged.includes(win.id),'confirmación al finalizar');
    await until(()=>f.state.scene==='Juego','vuelta a la escena anterior');
    assert.deepEqual(f.state.trace,['Sub','Juego']);
  } finally { f.close(); }
});

test('la pérdida corta el sonido justo al parar; la victoria lo mantiene',async()=>{
  for(const event of [loss,win]) {
    const f=fixture({events:[event],manualAnimations:true});
    try {
      await until(()=>f.motions.length===3,'carretes iniciados');
      assert.equal(f.state.audio.paused,false);
      f.motions.forEach(m=>m.finish());
      await until(()=>f.result.textContent.includes(event.win?'GANASTE':'SIGUE'),'resultado visible');
      assert.equal(f.state.audio.paused,!event.win);
      await until(()=>f.state.acknowledged.includes(event.id),'resultado terminado');
      assert.equal(f.state.audio.paused,true);
    } finally { f.close(); }
  }
});

test('las pérdidas varían sin enseñar tres iguales ni cambiar los premios ganadores',async()=>{
  const f=fixture({hash:'#cola=key-ficticia',manualAnimations:true});
  try {
    for (const gameName of ['fortnite','overwatch']) {
      let previous=''; const combinations=new Set();
      for(let i=0;i<12;i++) {
        const id=`loss-${gameName}-${i}`, start=f.motions.length;
        let finished=false;
        assert.equal(f.window.GeoArmyRuletaOBS.showConfirmed({id,viewer:'Geo',game:gameName,win:false,amount:null,guaranteed:false},()=>{finished=true}),true);
        await until(()=>f.motions.length===start+3,'inicio de pérdida');
        const marks=f.reels.map(reel=>reel.belt.children.at(-1).children[0].style);
        const values=marks.map(mark=>`${mark['--art-x']}/${mark['--art-y']}`);
        const key=values.join(',');
        assert.notEqual(new Set(values).size,1,'nunca debe parecer premio');
        assert.notEqual(key,previous,'no repite la pérdida anterior');
        previous=key; combinations.add(key);
        f.motions.slice(start).forEach(m=>m.finish());
        await until(()=>finished,'pérdida finalizada');
      }
      assert.ok(combinations.size>1);
    }
    let finished=false; const start=f.motions.length;
    assert.equal(f.window.GeoArmyRuletaOBS.showConfirmed({...win,id:'ganador-verificado'},()=>{finished=true}),true);
    await until(()=>f.motions.length===start+3,'inicio ganador');
    const marks=f.reels.map(reel=>reel.belt.children.at(-1).children[0].style);
    assert.ok(marks.every(mark=>mark['--art-x']==='100%' && mark['--art-y']==='100%'),'el premio de 1200 ocupa los tres carretes');
    f.motions.slice(start).forEach(m=>m.finish());
    await until(()=>f.result.textContent.includes('GANASTE 1200'),'premio ganador visible');
    await until(()=>finished,'ganador terminado');
  } finally { f.close(); }
});

test('si el usuario cambia de escena manualmente, pausa la animación y la reanuda al volver',async()=>{
  const f=fixture({events:[win],manualAnimations:true});
  try {await until(()=>f.motions.length===3,'ruleta iniciada');f.state.scene='Charlando';f.notify('obsSceneChanged',{name:'Charlando'});assert(f.motions.every(m=>m.state==='paused'));assert(f.state.audio.paused);assert(!f.stage.classList.contains('visible'));await new Promise(r=>setTimeout(r,20));assert.deepEqual(f.state.acknowledged,[]);f.state.scene='Sub';f.notify('obsSceneChanged',{name:'Sub'});assert(f.motions.every(m=>m.state==='running'));f.motions.forEach(m=>m.finish());await until(()=>f.state.acknowledged.includes(win.id),'confirmación al terminar');}finally{f.close()}
});

test('al volver no pisa un cambio manual de escena',async()=>{
  const f=fixture();try{const token=await f.window.GeoArmyAutoScene.enter();assert.equal(f.state.scene,'Sub');f.state.scene='Charlando';assert.equal(await f.window.GeoArmyAutoScene.back(token),false);assert.equal(f.state.scene,'Charlando');assert.deepEqual(f.state.trace,['Sub'])}finally{f.close()}
});

test('sin permiso avanzado, no reclama la cola ni cambia de escena',async()=>{
  const f=fixture({events:[win],level:2});try{await until(()=>f.status.textContent.includes('acceso avanzado'),'aviso de permisos');assert.equal(f.state.requests.length,0);assert.deepEqual(f.state.trace,[])}finally{f.close()}
});

test('si la escena no existe, no reclama ni confirma la tirada',async()=>{
  const f=fixture({events:[win],scenes:['Juego','Charlando']});try{await until(()=>f.status.textContent.includes('Crea en OBS'),'aviso de escena');assert.equal(f.state.requests.length,0);assert.deepEqual(f.state.acknowledged,[])}finally{f.close()}
});

test('si la fuente no está en la escena destino, regresa sin confirmar',async()=>{
  const f=fixture({events:[win],targetHasSource:false});try{await until(()=>f.status.textContent.includes('Agrega esta fuente'),'aviso de fuente');assert.deepEqual(f.state.trace,['Sub','Juego']);assert.deepEqual(f.state.acknowledged,[]);assert.equal(f.motions.length,0)}finally{f.close()}
});

test('un resultado inválido no provoca cambio ni confirmación',async()=>{
  const f=fixture({events:[{...win,amount:1500}]});try{await until(()=>f.status.textContent.includes('interpretar'),'aviso de tirada inválida');assert.deepEqual(f.state.trace,[]);assert.deepEqual(f.state.acknowledged,[])}finally{f.close()}
});

test('sin el módulo de control no reclama ni cambia, aunque auto esté activado',async()=>{
  const f=fixture({events:[win],missingController:true});try{await until(()=>f.status.textContent.includes('control de escenas'),'aviso');assert.equal(f.state.requests.length,0);assert.deepEqual(f.state.trace,[])}finally{f.close()}
});

test('sin clave no intenta consultar la cola ni cambia de escena',async()=>{
  const f=fixture({events:[win],hash:'#auto=1'});try{await until(()=>f.status.textContent.includes('clave privada'),'aviso de clave');assert.equal(f.state.requests.length,0);assert.deepEqual(f.state.trace,[])}finally{f.close()}
});

test('si el servidor rechaza la clave no cambia de escena ni confirma',async()=>{
  const f=fixture({events:[win],fetchStatus:401});try{await until(()=>f.status.textContent.includes('clave privada'),'aviso de clave rechazada');assert.deepEqual(f.state.trace,[]);assert.deepEqual(f.state.acknowledged,[])}finally{f.close()}
});

test('si OBS no cambia a la escena no confirma ni entra en un bucle de cambios',async()=>{
  const f=fixture({events:[win],ignoreSwitch:true});try{await until(()=>f.status.textContent.includes('No se pudo cambiar'),'aviso de cambio fallido');await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.state.trace,['Sub']);assert.deepEqual(f.state.acknowledged,[])}finally{f.close()}
});

test('si falla la animación, apaga el sonido y vuelve sin confirmar ni repetir',async()=>{
  const f=fixture({events:[win],failAnimation:true});try{await until(()=>f.status.textContent.includes('No se pudo reproducir'),'aviso de animación');await until(()=>f.state.scene==='Juego','regreso tras fallo');await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.state.trace,['Sub','Juego']);assert.deepEqual(f.state.acknowledged,[]);assert(f.state.audio.paused);assert(!f.stage.classList.contains('visible'))}finally{f.close()}
});

test('el modo actual sin auto sigue funcionando sin cambiar escenas',async()=>{
  const f=fixture({events:[win],hash:'#cola=key-ficticia'});try{assert.equal(f.stage.classList.contains('visible'),true);await until(()=>f.state.acknowledged.includes(win.id),'confirmación modo actual');assert.deepEqual(f.state.trace,[])}finally{f.close()}
});

test('dos eventos se muestran y confirman en orden sin duplicarlos',async()=>{
  const f=fixture({events:[win,loss],slowReturn:true});try{await until(()=>f.state.acknowledged.length===2,'dos confirmaciones');await until(()=>f.state.scene==='Juego','regreso final');assert.deepEqual(f.state.acknowledged,['id-demo-1','id-demo-2']);assert.deepEqual(f.state.soundScenes,['Sub','Sub']);assert.deepEqual(f.state.trace,['Sub','Juego','Sub','Juego'])}finally{f.close()}
});

test('la demostración automática cambia y regresa sin consultar la cola',async()=>{
  const f=fixture({search:'?demo=1&auto=1&juego=fortnite&cantidad=1200',hash:''});try{await until(()=>f.state.trace.length===2,'recorrido de prueba');assert.deepEqual(f.state.trace,['Sub','Juego']);assert.equal(f.state.requests.length,0);assert.equal(f.state.sounds,1);await new Promise(r=>setTimeout(r,30));assert.equal(f.state.trace.length,2,'la demostración no se repite en bucle')}finally{f.close()}
});

test('la demostración con espera cambia sola desde otra escena sin usar la cola real',async()=>{
  const f=fixture({search:'?demo=1&auto=1&espera=10&resultado=perder',hash:'',initiallyHidden:true});
  try {await until(()=>f.state.trace.length===2,'recorrido de prueba con espera');assert.deepEqual(f.state.trace,['Sub','Juego']);assert.equal(f.state.requests.length,0);assert.equal(f.state.sounds,1)}finally{f.close()}
});
