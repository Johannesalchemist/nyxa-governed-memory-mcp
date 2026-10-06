import { createHash, randomUUID } from "node:crypto";
import { consultNewsroom, type NewsroomInput } from "./newsroom.js";
export type NannyIntent = "CARE" | "GENERAL_HEALTH_INFO" | "MEDICAL_DECISION" | "URGENT_SAFETY";
export type NannyDecision = "ALLOW" | "ALLOW_WITH_BOUNDARY" | "DENY" | "ESCALATE";
const urgent=[/atmet\s+nicht/i,/keine\s+atmung/i,/bewusstlos/i,/nicht\s+weckbar/i,/blau(e|er|es|en)?\s+(lippen|haut|gesicht)/i,/krampfanfall/i,/schwer(e|er)?\s+atemnot/i];
const medical=[/\b(dosis|dosierung|medikament|paracetamol|ibuprofen)\b/i,/\b(diagnose|diagnostizier|behandeln|behandlung|therapie)\b/i,/\b(soll|muss)\s+ich\s+(zum\s+)?arzt/i];
const general=[/\b(fieber|temperatur|ausschlag|erbrechen|durchfall|husten|schnupfen|krank)\b/i];
const hash=(v:string)=>createHash("sha256").update(v,"utf8").digest("hex");
export function classifyNannyIntent(prompt:string):{intent:NannyIntent;decision:NannyDecision}{
 if(urgent.some(r=>r.test(prompt)))return{intent:"URGENT_SAFETY",decision:"ESCALATE"};
 if(medical.some(r=>r.test(prompt)))return{intent:"MEDICAL_DECISION",decision:"DENY"};
 if(general.some(r=>r.test(prompt)))return{intent:"GENERAL_HEALTH_INFO",decision:"ALLOW_WITH_BOUNDARY"};
 return{intent:"CARE",decision:"ALLOW"};
}
function makeReceipt(prompt:string,intent:NannyIntent,decision:NannyDecision,output?:string){return{id:randomUUID(),policy:"BB_NANNY_MEDICAL_BARRIER_V1",intent,decision,input_sha256:hash(prompt),...(output?{output_sha256:hash(output)}:{}),created_at:new Date().toISOString()};}
export async function consultNanny(prompt:string):Promise<Record<string,unknown>>{
 if(typeof prompt!=="string"||!prompt.trim()||prompt.length>10000)throw new Error("nanny_prompt_invalid");
 const clean=prompt.trim(),pre=classifyNannyIntent(clean);
 if(pre.decision==="ESCALATE"){const output="Das kann ein akutes Warnzeichen sein. Bitte hole jetzt unverzüglich professionelle medizinische Hilfe; bei einem Notfall nutze die örtliche Notrufnummer.";return{status:"escalated",output,receipt:makeReceipt(clean,pre.intent,pre.decision,output)}}
 if(pre.decision==="DENY"){const output="Dabei kann Nanny keine individuelle Diagnose, Medikamentendosierung oder Behandlungsentscheidung geben. Bitte wende dich dafür an qualifiziertes medizinisches Fachpersonal.";return{status:"blocked",output,receipt:makeReceipt(clean,pre.intent,pre.decision,output)}}
 const boundary=pre.decision==="ALLOW_WITH_BOUNDARY"?"Gib nur allgemeine, nicht-diagnostische Gesundheitsinformation. Keine individuelle Diagnose, Dosierung, Behandlungsempfehlung oder Entscheidung, ob ärztliche Behandlung nötig ist. Bei Warnzeichen eskalieren.":"Hilf bei Baby-Alltag, Organisation und neutraler Information. Erfinde keine medizinischen Fakten.";
 const input:NewsroomInput={prompt:`Du bist Nanny in der privaten BB-App. ${boundary}\n\nNutzer: ${clean}`,participants:["openai"],modality:"text",input_refs:["bb:nanny"],evidence_refs:["policy:BB_NANNY_MEDICAL_BARRIER_V1"]};
 const result=await consultNewsroom(input); const contributions=Array.isArray(result["contributions"])?result["contributions"] as Array<Record<string,unknown>>:[]; const first=contributions.find(x=>x["status"]==="ok"&&typeof x["output"]==="string");
 if(!first||typeof first["output"]!=="string")throw new Error("nanny_model_no_verified_output"); const output=first["output"];
 if(medical.some(r=>r.test(output))){const blocked="Die erzeugte Antwort wurde von der Nanny-Medical-Barriere zurückgehalten. Bitte wende dich für individuelle medizinische Entscheidungen an qualifiziertes Fachpersonal.";return{status:"blocked_post_gate",output:blocked,receipt:makeReceipt(clean,"MEDICAL_DECISION","DENY",blocked)}}
 return{status:"ok",output,model:first["actual_model"],provider:first["provider"],request_id:first["request_id"],receipt:makeReceipt(clean,pre.intent,pre.decision,output)};
}
