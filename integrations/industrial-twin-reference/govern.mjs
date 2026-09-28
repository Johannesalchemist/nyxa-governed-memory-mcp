export function govern(effect, observation, policy, now=new Date()){
  const p=policy.effects[effect];
  if(!p) return {decision:'DENY',reason:'UNKNOWN_EFFECT'};
  const age=Math.max(0,(now-Date.parse(observation.observedAt))/1000);
  const accuracy=observation.geometry?.accuracyMm ?? Infinity;
  const failures=[];
  if((observation.confidence??0)<p.minConfidence) failures.push('CONFIDENCE');
  if(accuracy>p.maxAccuracyMm) failures.push('ACCURACY');
  if(age>p.maxAgeSeconds) failures.push('FRESHNESS');
  return failures.length ? {decision:p.onFailure,reason:'INSUFFICIENT_EFFECT_EVIDENCE',failures,metrics:{ageSeconds:age,accuracyMm:accuracy,confidence:observation.confidence??0}} : {decision:'ALLOW',reason:'EVIDENCE_SUFFICIENT',metrics:{ageSeconds:age,accuracyMm:accuracy,confidence:observation.confidence??0}};
}
