/** GED V0: pure freeze and branch planning, no effects. */
import { createHash } from "node:crypto";
export type FreezeEvidence = { revision:string; policy:string; passport:string; models:string; world:string; testsPassed:boolean; independentlyVerified:boolean; replayVerified:boolean; criticalFindings:number };
export type FreezeDecision = { decision:"FREEZE_CANDIDATE"|"HOLD"; fingerprint:string|null; authorityEffect:"NONE"; reasons:string[] };
const hash=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function evaluateFreezePoint(e:FreezeEvidence):FreezeDecision {
 const reasons:string[]=[];
 for(const k of ["revision","policy","passport","models","world"] as const) if(typeof e[k]!=="string"||!e[k].trim())reasons.push(k+"_missing");
 if(e.testsPassed!==true)reasons.push("tests_failed");
 if(e.independentlyVerified!==true)reasons.push("independent_verification_missing");
 if(e.replayVerified!==true)reasons.push("replay_missing");
 if(!Number.isSafeInteger(e.criticalFindings)||e.criticalFindings!==0)reasons.push("critical_findings");
 return {decision:reasons.length?"HOLD":"FREEZE_CANDIDATE",fingerprint:reasons.length?null:hash([e.revision,e.policy,e.passport,e.models,e.world]),authorityEffect:"NONE",reasons};
}
export function planEvolutionaryBranch(f:FreezeDecision,hypothesis:string,changeDigest:string){
 const reasons:string[]=[];
 if(f.decision!=="FREEZE_CANDIDATE"||!f.fingerprint||f.authorityEffect!=="NONE")reasons.push("freeze_missing");
 if(typeof hypothesis!=="string"||!hypothesis.trim())reasons.push("hypothesis_missing");
 if(typeof changeDigest!=="string"||!changeDigest.trim())reasons.push("change_digest_missing");
 return {decision:reasons.length?"HOLD" as const:"SHADOW_BRANCH_CANDIDATE" as const,branchId:reasons.length?null:hash([f.fingerprint,hypothesis,changeDigest]),baselineFingerprint:f.fingerprint,isolation:"NO_NETWORK_NO_EFFECTS" as const,authorityEffect:"NONE" as const,reasons};
}
