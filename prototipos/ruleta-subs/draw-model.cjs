'use strict';

// Modelo aislado para desarrollo. La integración real DEBE serializar cada
// cuenta y confirmar resultado y crédito de forma atómica en la base; este
// módulo no hace ninguna de esas operaciones y no se conecta a producción.
const {randomInt} = require('node:crypto');
const GAMES = Object.freeze({
  fortnite: Object.freeze({currency:'VBUCKS', prizes:Object.freeze([
    Object.freeze({amount:500,weight:200}), Object.freeze({amount:800,weight:75}),
    Object.freeze({amount:1200,weight:15}), Object.freeze({amount:1500,weight:6})
  ])}),
  overwatch: Object.freeze({currency:'OWCOINS', prizes:Object.freeze([
    Object.freeze({amount:500,weight:1000}), Object.freeze({amount:1000,weight:15}),
    Object.freeze({amount:1500,weight:3})
  ])})
});

function draw({game, consecutiveLosses}, randomBelow=randomInt) {
  if (!Object.hasOwn(GAMES,game)) throw new TypeError('Juego desconocido');
  if (!Number.isSafeInteger(consecutiveLosses) || consecutiveLosses < 0 || consecutiveLosses > 29)
    throw new RangeError('Racha inválida');
  if (typeof randomBelow !== 'function') throw new TypeError('Generador inválido');
  const sample=(max)=>{
    const value=randomBelow(max);
    if (!Number.isSafeInteger(value) || value < 0 || value >= max) throw new RangeError('Valor aleatorio inválido');
    return value;
  };
  const guaranteed=consecutiveLosses === 29;
  if (!guaranteed && sample(30) !== 0) {
    return {win:false,guaranteed:false,amount:null,currency:null,consecutiveLosses:consecutiveLosses+1};
  }
  const config=GAMES[game];
  const ticket=sample(config.prizes.reduce((sum,p)=>sum+p.weight,0));
  let upper=0;
  const prize=config.prizes.find(p=>{upper+=p.weight; return ticket<upper;});
  return {win:true,guaranteed,amount:prize.amount,currency:config.currency,consecutiveLosses:0};
}

module.exports={draw};
