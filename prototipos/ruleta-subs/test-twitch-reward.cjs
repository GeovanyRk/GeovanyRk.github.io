'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ensureDisabledReward}=require('./twitch-reward.cjs');

const args={clientId:'test-client',accessToken:'test-token',broadcasterId:'123'};
const reward={id:'fake-reward',title:'Ruleta de Subs',cost:500,prompt:'Solo suscriptores. Escribe Fortnite u Overwatch. Máximo 3 canjes al día.',is_enabled:false,is_user_input_required:true,should_redemptions_skip_request_queue:false};
const ok=data=>({ok:true,json:async()=>({data})});

test('crea la recompensa apagada y requiere que la persona escriba el juego',async()=>{
  const calls=[];
  const fake=async (url,opts)=>{ calls.push({url,opts}); return calls.length===1?ok([]):ok([reward]); };
  assert.deepEqual(await ensureDisabledReward(args,fake),{status:'created',rewardId:'fake-reward'});
  assert.equal(calls[1].opts.method,'POST');
  const body=JSON.parse(calls[1].opts.body);
  assert.equal(body.cost,500); assert.equal(body.is_enabled,false);
  assert.equal(body.is_user_input_required,true); assert.equal(body.should_redemptions_skip_request_queue,false);
});

test('reutiliza únicamente una recompensa idéntica que la misma aplicación puede gestionar',async()=>{
  const calls=[];
  const fake=async (url,opts)=>{calls.push(opts.method);return ok([reward]);};
  assert.deepEqual(await ensureDisabledReward(args,fake),{status:'existing',rewardId:'fake-reward'});
  assert.deepEqual(calls,['GET','GET']);
});

test('no intenta apropiarse de una recompensa creada por otra aplicación',async()=>{
  let n=0; const fake=async()=>ok(++n===1?[reward]:[]);
  await assert.rejects(ensureDisabledReward(args,fake),e=>e.code==='reward_owned_by_other_app');
  assert.equal(n,2);
});

test('si se pierde la respuesta del POST, consulta el estado y no vuelve a crearla',async()=>{
  const calls=[];
  const fake=async (url,opts)=>{
    calls.push(opts.method);
    if(calls.length===1) return ok([]);
    if(calls.length===2) throw new Error('conexión perdida');
    return ok([reward]);
  };
  assert.deepEqual(await ensureDisabledReward(args,fake),{status:'existing',rewardId:'fake-reward'});
  assert.deepEqual(calls,['GET','POST','GET','GET']);
});
