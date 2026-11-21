'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  class Element {
    constructor() { this.children=[]; this.textContent=''; this.className=''; this.style={setProperty(){}}; this.classList={add(){},remove(){}}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=[...nodes]; }
    getBoundingClientRect() { return {height:260}; }
    animate() { return {finished:Promise.resolve()}; }
  }
  const stage=new Element(), viewer=new Element(), game=new Element(), result=new Element();
  const reels=Array.from({length:3},()=>{ const reel=new Element(); reel.belt=new Element(); reel.querySelector=()=>reel.belt; return reel; });
  const named={'#stage':stage,'#viewer':viewer,'#game':game,'#result':result};
  const document={querySelector:s=>named[s],querySelectorAll:()=>reels,createElement:()=>new Element(),body:new Element()};
  const window={matchMedia:()=>({matches:false})};
  const html=fs.readFileSync(require('node:path').join(__dirname,'dist','index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script,{document,window,location:{search:''},URLSearchParams,Promise,Number,Object,String,setTimeout:fn=>queueMicrotask(fn)});
  return {api:window.GeoArmyRuletaOBS,viewer,game,result,reels};
}

const finish=()=>new Promise(resolve=>setImmediate(resolve));

test('representa un premio confirmado de Fortnite sin repetir el mismo evento',async()=>{
  const s=setup(); const event={id:'fn-1',viewer:'Ana',game:'fortnite',win:true,amount:800,guaranteed:false};
  assert.equal(s.api.showConfirmed(event),true);
  assert.equal(s.api.showConfirmed(event),false);
  await finish();
  assert.equal(s.viewer.textContent,'ANA');
  assert.equal(s.game.textContent,'FORTNITE');
  assert.equal(s.result.textContent,'¡GANASTE 800 V-BUCKS!');
  for(const reel of s.reels) assert.equal(reel.belt.children.at(-1).children[1].textContent,'800');
});

test('representa una pérdida en Overwatch con símbolos distintos',async()=>{
  const s=setup();
  assert.equal(s.api.showConfirmed({id:'ow-1',viewer:'Beto',game:'overwatch',win:false,amount:null,guaranteed:false}),true);
  await finish();
  assert.equal(s.result.textContent,'¡SIGUE INTENTANDO!');
  assert.deepEqual(s.reels.map(r=>r.belt.children.at(-1).children[1].textContent),['500','1000','1500']);
});

test('rechaza premios inexistentes y una derrota presentada como garantizada',()=>{
  const s=setup();
  assert.equal(s.api.showConfirmed({id:'bad-1',viewer:'C',game:'overwatch',win:true,amount:800,guaranteed:false}),false);
  assert.equal(s.api.showConfirmed({id:'bad-2',viewer:'C',game:'fortnite',win:false,amount:null,guaranteed:true}),false);
  assert.equal(s.api.showConfirmed({id:'bad-3',viewer:'C',game:'desconocido',win:false,amount:null,guaranteed:false}),false);
});
