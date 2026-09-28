import crypto from 'node:crypto';
export const distanceMm=(a,b)=>Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0));
export function stableAsset(observations){
  if(!observations.length) throw new Error('NO_OBSERVATIONS');
  const ids=new Set(observations.map(o=>o.assetId));
  if(ids.size!==1) throw new Error('IDENTITY_CONFLICT');
  return {assetId:observations[0].assetId,observations:[...observations].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt))};
}
export function detectChange(asset,minMoveMm=50){
  const xs=asset.observations.filter(o=>o.geometry?.position);
  if(xs.length<2) return null;
  const before=xs.at(-2), after=xs.at(-1), displacementMm=distanceMm(before.geometry.position,after.geometry.position);
  if(displacementMm<minMoveMm) return null;
  const payload={assetId:asset.assetId,type:'POSITION_CHANGE',fromObservationId:before.observationId,toObservationId:after.observationId,displacementMm};
  return {...payload,candidateId:'chg-'+crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0,16),status:'PROPOSED'};
}
