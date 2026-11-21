'use strict';

// Preparación aislada: crea una recompensa DESACTIVADA. Requiere un token del
// broadcaster con channel:manage:redemptions, de la aplicación que gestionará
// después los canjes. Nunca se debe poner ese token en OBS ni en la web pública.
const ENDPOINT='https://api.twitch.tv/helix/channel_points/custom_rewards';
const DEFAULT_TITLE='Ruleta de Subs';
const DEFAULT_PROMPT='Solo suscriptores. Escribe Fortnite u Overwatch. Máximo 3 canjes al día.';

class SetupError extends Error {
  constructor(code) { super(code); this.name='SetupError'; this.code=code; }
}

async function ensureDisabledReward({clientId,accessToken,broadcasterId,title=DEFAULT_TITLE,prompt=DEFAULT_PROMPT},fetcher=fetch) {
  if (!clientId || !accessToken || !/^\d{1,20}$/.test(broadcasterId || '')) throw new SetupError('invalid_credentials');
  if (typeof title!=='string' || !title.trim() || title.length>45 || typeof prompt!=='string' || !prompt.trim())
    throw new SetupError('invalid_configuration');

  const headers={'Client-Id':clientId,'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'};
  const url=new URL(ENDPOINT); url.searchParams.set('broadcaster_id',broadcasterId);
  const expected={title,cost:500,prompt,is_enabled:false,is_user_input_required:true,should_redemptions_skip_request_queue:false};

  async function request(target,method,body) {
    let response;
    try { response=await fetcher(target,{method,headers,...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(15000)}); }
    catch { throw new SetupError('transport_error'); }
    if (!response || !response.ok) throw new SetupError(`twitch_http_${response?.status || 0}`);
    let decoded;
    try { decoded=await response.json(); } catch { throw new SetupError('invalid_twitch_response'); }
    if (!Array.isArray(decoded?.data)) throw new SetupError('invalid_twitch_response');
    return decoded.data;
  }

  async function findExisting() {
    const all=await request(url.toString(),'GET');
    const matches=all.filter(x=>typeof x?.title==='string' && x.title.toLowerCase()===title.toLowerCase());
    if (matches.length>1) throw new SetupError('ambiguous_existing_reward');
    if (!matches.length) return null;
    const existing=matches[0];
    const managedUrl=new URL(url); managedUrl.searchParams.set('only_manageable_rewards','true');
    const manageable=await request(managedUrl.toString(),'GET');
    if (!manageable.some(x=>x.id===existing.id)) throw new SetupError('reward_owned_by_other_app');
    if (!existing.id || Object.entries(expected).some(([key,value])=>existing[key]!==value))
      throw new SetupError('existing_reward_has_different_settings');
    return existing;
  }

  const existing=await findExisting();
  if (existing) return {status:'existing',rewardId:existing.id};
  try {
    const created=(await request(url.toString(),'POST',expected))[0];
    if (!created?.id || Object.entries(expected).some(([key,value])=>created[key]!==value))
      throw new SetupError('invalid_created_reward');
    return {status:'created',rewardId:created.id};
  } catch (error) {
    // La respuesta del POST pudo perderse: consultar por título una vez antes
    // de decidir. Nunca lanzar un segundo POST ante un resultado incierto.
    try { const found=await findExisting(); if (found) return {status:'existing',rewardId:found.id}; }
    catch (recheck) {
      if (recheck.code==='reward_owned_by_other_app' || recheck.code==='existing_reward_has_different_settings') throw recheck;
    }
    throw new SetupError('create_unconfirmed');
  }
}

module.exports={ensureDisabledReward,SetupError};
