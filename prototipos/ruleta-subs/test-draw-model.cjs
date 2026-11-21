'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {draw}=require('./draw-model.cjs');

test('tras 29 pérdidas compartidas entre los juegos, la tirada 30 gana',()=>{
  let losses=0;
  for(let n=0;n<29;n++) {
    const result=draw({game:n%2?'overwatch':'fortnite',consecutiveLosses:losses},()=>1);
    assert.equal(result.win,false); losses=result.consecutiveLosses;
  }
  const result=draw({game:'overwatch',consecutiveLosses:losses},()=>0);
  assert.deepEqual(result,{win:true,guaranteed:true,amount:500,currency:'OWCOINS',consecutiveLosses:0});
});

test('una victoria anticipada reinicia la racha',()=>{
  const result=draw({game:'fortnite',consecutiveLosses:17},()=>0);
  assert.deepEqual(result,{win:true,guaranteed:false,amount:500,currency:'VBUCKS',consecutiveLosses:0});
});

test('una de las 30 posibilidades del giro normal produce victoria',()=>{
  let wins=0;
  for(let ticket=0;ticket<30;ticket++) {
    let call=0;
    const result=draw({game:'fortnite',consecutiveLosses:0},()=>call++===0?ticket:0);
    wins+=Number(result.win);
  }
  assert.equal(wins,1);
});

test('usa las proporciones de premios de las ruletas originales',()=>{
  for (const [game,bounds] of [
    ['fortnite',[[0,500],[199,500],[200,800],[274,800],[275,1200],[289,1200],[290,1500],[295,1500]]],
    ['overwatch',[[0,500],[999,500],[1000,1000],[1014,1000],[1015,1500],[1017,1500]]]
  ]) for (const [ticket,amount] of bounds) {
    const result=draw({game,consecutiveLosses:29},()=>ticket);
    assert.equal(result.amount,amount);
  }
});

test('rechaza entradas y sorteos fuera del rango esperado',()=>{
  assert.throws(()=>draw({game:'desconocido',consecutiveLosses:0}),TypeError);
  assert.throws(()=>draw({game:'fortnite',consecutiveLosses:30}),RangeError);
  assert.throws(()=>draw({game:'fortnite',consecutiveLosses:0},()=>30),RangeError);
});
