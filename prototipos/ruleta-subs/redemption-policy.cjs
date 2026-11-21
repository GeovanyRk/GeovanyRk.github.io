'use strict';

// Modelo aislado. El receptor debe verificar la firma de Twitch y la identidad,
// resolver duplicados y aplicar el límite bajo bloqueo en la base de datos.
const {parseGameInput}=require('./game-input.cjs');
const dayFormatter=new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
});

function easternDay(instant) {
  if (instant == null) throw new RangeError('Fecha inválida');
  const date=new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Fecha inválida');
  const parts=Object.fromEntries(dayFormatter.formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// used debe incluir canjes aceptados pendientes o completados, excluyendo
// cancelados; obtenerlo y reservar otro hueco requiere una transacción real.
function classifyRedemption({subscription,gameInput,used}) {
  if (!['active','inactive','unknown'].includes(subscription)) throw new TypeError('Estado inválido');
  if (!Number.isSafeInteger(used) || used<0) throw new RangeError('Conteo inválido');
  if (used>=3) return {decision:'reject',reason:'daily_limit'};
  if (subscription==='inactive') return {decision:'reject',reason:'not_subscribed'};
  if (subscription==='unknown') return {decision:'wait',reason:'subscription_unconfirmed'};
  const game=parseGameInput(gameInput);
  if (!game) return {decision:'wait',reason:'game_unclear'};
  return {decision:'accept',game};
}

module.exports={easternDay,classifyRedemption};
