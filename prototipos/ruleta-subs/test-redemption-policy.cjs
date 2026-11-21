'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {easternDay,classifyRedemption}=require('./redemption-policy.cjs');

test('el límite pertenece al día del Este, incluyendo el cambio de horario',()=>{
  assert.equal(easternDay('2026-11-21T04:59:59Z'),'2026-11-20');
  assert.equal(easternDay('2026-11-21T05:00:00Z'),'2026-11-21');
  assert.equal(easternDay('2026-07-10T03:59:59Z'),'2026-07-09');
  assert.equal(easternDay('2026-07-10T04:00:00Z'),'2026-07-10');
  assert.throws(()=>easternDay('not-a-date'),RangeError);
  assert.throws(()=>easternDay(null),RangeError);
});

test('solo se acepta una de las tres solicitudes con suscripción y juego claros',()=>{
  assert.deepEqual(classifyRedemption({subscription:'active',gameInput:'OW',used:2}),{decision:'accept',game:'overwatch'});
  assert.deepEqual(classifyRedemption({subscription:'active',gameInput:'OW',used:3}),{decision:'reject',reason:'daily_limit'});
  assert.deepEqual(classifyRedemption({subscription:'inactive',gameInput:'FN',used:0}),{decision:'reject',reason:'not_subscribed'});
});

test('si Twitch no verifica o el texto no es claro, no se inventa la respuesta',()=>{
  assert.deepEqual(classifyRedemption({subscription:'unknown',gameInput:'FN',used:0}),{decision:'wait',reason:'subscription_unconfirmed'});
  assert.deepEqual(classifyRedemption({subscription:'active',gameInput:'OW o FN',used:0}),{decision:'wait',reason:'game_unclear'});
  assert.throws(()=>classifyRedemption({subscription:'active',gameInput:'FN',used:-1}),RangeError);
});
