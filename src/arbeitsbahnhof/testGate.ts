import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, mkdir, open, unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseProposal, type ValidatedProposal } from "../governance/proposal.js";
import { evaluateC0, type C0Decision } from "../governance/c0.js";
import { evaluateProposal, type GammaDecision } from "../governance/gamma.js";
import { TOOL_POLICIES } from "../policy/toolPolicy.js";
import { AuditLog } from "../audit/AuditLog.js";
export const TEST_ACTIONS = new Set([
 "arbeitsbahnhof.task.enqueue","arbeitsbahnhof.task.claim",
 "arbeitsbahnhof.task.result","arbeitsbahnhof.crm.test_upsert"
]);
export type Grant = { id:string; run_id:string; actor:string; issued_at:string; expires_at:string;
 approved_by:string; project:string; entries:Array<{action:string;target:string;payload_hash:string;nonce:string}> };
export function canonical(v:unknown):string {
 if(v===null || typeof v!=="object") return JSON.stringify(v);
 if(Array.isArray(v)) return "["+v.map(canonical).join(",")+"]";
 return "{"+Object.keys(v as object).sort().map(k=>JSON.stringify(k)+":"+canonical((v as Record<string,unknown>)[k])).join(",")+"}";
}
export function hash(v:unknown):string {return createHash("sha256").update(canonical(v)).digest("hex");}
export function evaluateTest(p:ValidatedProposal,g:Grant,nonce:string,now:number,c0:C0Decision):
 {decision:GammaDecision;payloadHash:string} {
 const payloadHash=hash(p.payload);
 const deny=(reason:string)=>({decision:{outcome:"DENY" as const,domain:"C2" as const,reason},payloadHash});
 if(c0.outcome!=="PASS" || c0.reason!=="target_match") return deny("verified_target_required");
 if(!TEST_ACTIONS.has(p.action)) return TOOL_POLICIES[p.action] ? deny("outside_test_scope") : {decision:evaluateProposal(p,{toolPolicy:undefined,mode:"observe_only",now}),payloadHash};
 if(!g || g.approved_by!=="Jo" || g.actor!=="arbeitsbahnhof-test" || p.actor!==g.actor ||
 !g.id || !g.run_id || p.provenance.runId!==g.run_id || p.provenance.requestingIdentity!=="Jo") return deny("grant_identity_mismatch");
 const issued=Date.parse(g.issued_at),expiry=Date.parse(g.expires_at);
 if(!Number.isFinite(issued)||!Number.isFinite(expiry)||issued>now||expiry<=now||expiry-issued>3600000)
 return deny("grant_expired_or_invalid");
 if(!g.project.startsWith("arbeitsbahnhof-synthetic-") || p.payload?.["project"]!==g.project) return deny("synthetic_project_required");
 if(!g.entries.some(e=>e.action===p.action&&e.target===p.target&&e.payload_hash===payloadHash&&e.nonce===nonce))
 return deny("action_target_payload_nonce_mismatch");
 // Scoped authority is derived solely from the protected human grant.
 // Global process mode remains observe_only; other tools never receive draft authority.
 return {decision:evaluateProposal(p,{toolPolicy:TOOL_POLICIES[p.action],mode:"draft",now}),payloadHash};
}

/**
 * Real executor step: the one thing the pre-existing decision pipeline (C0 -> grant check ->
 * gamma) never did on its own -- it only ever computed and audited a decision, never performed
 * anything. This is intentionally the smallest possible verifiable side effect: a single JSON
 * artifact file, written exclusively ("wx" - fails if it already exists, so this can never
 * silently overwrite a prior run's artifact), inside the same isolated synthetic-test root the
 * rest of this gate already uses. No production system, no other host, no arbeitsbahnhof_crm
 * row, no real Twenty/Supabase write. Only runs after ALLOW + successful nonce consumption
 * (single-use already enforced by the caller), so this executor itself carries no separate
 * replay risk. A write failure here is reported, not swallowed -- the audit record always
 * reflects what actually happened, never an assumed success.
 */
export async function executeCanary(
 root:string,auditId:string,proposal:ValidatedProposal,grantId:string,runId:string,nonce:string
):Promise<{executed:boolean;artifactPath:string;artifactHash:string;error?:string}> {
 const artifactsDir=root+"/artifacts";
 const artifactPath=artifactsDir+"/"+auditId+".json";
 try {
 await mkdir(artifactsDir,{recursive:true,mode:0o700});
 const artifact={
 kind:"arbeitsbahnhof_synthetic_canary_artifact",
 audit_id:auditId,
 action:proposal.action,
 target:proposal.target,
 grant_id:grantId,
 run_id:runId,
 task_id:proposal.provenance.taskId,
 nonce,
 executed_at:new Date().toISOString(),
 note:"synthetic reversible canary artifact; no production side effect"
 };
 const content=JSON.stringify(artifact,null,2);
 await writeFile(artifactPath,content,{encoding:"utf8",flag:"wx",mode:0o600});
 const artifactHash=createHash("sha256").update(content).digest("hex");
 return {executed:true,artifactPath,artifactHash};
 } catch (error) {
 return {executed:false,artifactPath,artifactHash:"",error:error instanceof Error?error.message:String(error)};
 }
}

async function main() {
 const root="/var/lib/nyxa-arbeitsbahnhof-test";
 await mkdir(root,{recursive:true,mode:0o700});
 const lock=await open(root+"/gate.lock","wx",0o600);
 try {
 let raw="";for await(const b of process.stdin){raw+=b;if(raw.length>131072)throw new Error("request_too_large");}
 const input=JSON.parse(raw) as {proposal:unknown;nonce:string};
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(input.nonce))throw new Error("invalid_nonce");
 const p=parseProposal(input.proposal);
 const gp="/etc/nyxa/arbeitsbahnhof-test-grant.json";
 const gs=await stat(gp);if(gs.uid!==0||(gs.mode&0o022)!==0)throw new Error("untrusted_grant_permissions");
 const g=JSON.parse(await readFile(gp,"utf8")) as Grant;
 const c0=evaluateC0(p.expected_target);
 const result=evaluateTest(p,g,input.nonce,Date.now(),c0);
 const audit=new AuditLog(root);await audit.init();
 if(!(await audit.verifyIntegrity()).valid)throw new Error("audit_integrity_failed");
 let executor:{executed:boolean;artifactPath:string;artifactHash:string;error?:string}|undefined;
 if(result.decision.outcome==="ALLOW"){
 try {const used=await open(root+"/used-"+input.nonce,"wx",0o600);await used.writeFile(g.id);await used.close();}
 catch {result.decision={outcome:"DENY",domain:"C2",reason:"nonce_already_used_or_storage_unavailable"};}
 if(result.decision.outcome==="ALLOW"){
 executor=await executeCanary(root,randomUUID(),p,g.id,g.run_id,input.nonce);
 }
 }
 const id=randomUUID();
 await audit.append({id,timestamp:new Date().toISOString(),actor:"agent",action:"nyxa_propose_action",
 tool:p.action,mode:"observe_only",backend:"arbeitsbahnhof-synthetic-test",
 result:result.decision.outcome==="ALLOW"?"allowed":"blocked",
 capability_class:"I1",policy_decision:result.decision.outcome==="ALLOW"?"ALLOWED":"DENIED",
 arguments_hash:result.payloadHash,affected_resource:p.target,requesting_identity:"Jo",
 gamma_outcome:result.decision.outcome,gamma_domain:result.decision.domain,gamma_reason:result.decision.reason,
 c0_outcome:c0.outcome,c0_reason:c0.reason,
 details:{grant_id:g.id,run_id:g.run_id,nonce:input.nonce,effective_action_mode:TEST_ACTIONS.has(p.action)?"draft":"observe_only",
 executor:executor?{executed:executor.executed,artifact_path:executor.artifactPath,artifact_hash:executor.artifactHash,error:executor.error}:undefined}});
 if((await audit.recent(1))[0]?.id!==id || !(await audit.verifyIntegrity()).valid)throw new Error("audit_not_persisted");
 console.log(JSON.stringify({audit_id:id,grant_id:g.id,action:p.action,target:p.target,task_id:p.provenance.taskId,issued_at:new Date().toISOString(),expires_at:g.expires_at,c0,decision:result.decision,payload_hash:result.payloadHash,executor}));
 } finally {await lock.close();await unlink(root+"/gate.lock");}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 main().catch((error)=>{console.log(JSON.stringify({decision:{outcome:"DENY",reason:"gate_runtime_rejected"},error:error instanceof Error?error.message:String(error)}));process.exitCode=1;});
}
