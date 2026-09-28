import crypto from 'node:crypto';
export function toNyxaProposal({effect,observation,change,actor='industrial-twin-agent',runId='windtunnel-001',action='nyxa_e2e_write_scratch'}){
  const evidence={effect,observationId:observation.observationId,evidenceHash:observation.evidence.hash,changeCandidateId:change?.candidateId??null};
  const effectId='twin-'+crypto.createHash('sha256').update(JSON.stringify({effect,assetId:observation.assetId,evidence})).digest('hex').slice(0,24);
  return {actor,action,target:`scratch:/${effectId}.txt`,scope:'industrial twin governed effect',claims:[{tag:'FACT',statement:`effect ${effect} requested for ${observation.assetId}`,source:observation.evidence.hash}],uncertainty:Math.max(0,1-(observation.confidence??0)),requestedCapabilityClass:'I1',estimatedIrreversibility:'I1',provenance:{requestingIdentity:actor,taskId:`twin:${effect}:${effectId}`,runId},payload:{effectId,...evidence}};
}
export function gateDecision(localDecision,proposal){
  if(localDecision.decision!=='ALLOW') return {dispatch:false,policy_decision:localDecision.decision,domain:'EFFECT_RELATIVE_EVIDENCE',reason:localDecision.reason,proposal};
  return {dispatch:true,policy_decision:'PROPOSE_TO_NYXA',proposal};
}
