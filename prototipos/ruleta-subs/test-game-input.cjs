'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parseGameInput} = require('./game-input.cjs');

test('reconoce el juego escrito al canjear',()=>{
  for (const input of ['Fortnite',' FN ','ＦＯＲＴＮＩＴＥ']) assert.equal(parseGameInput(input),'fortnite');
  for (const input of ['Overwatch','OVERWATCH  2','overwatch2','ow','OW2']) assert.equal(parseGameInput(input),'overwatch');
});

test('deja sin decidir una respuesta vacía, ambigua o inesperada',()=>{
  for (const input of ['',null,{},'overwatch o fortnite','no sé','x'.repeat(81)]) assert.equal(parseGameInput(input),null);
});
