import { createHash } from "node:crypto";
import { safeJsonStringify } from "../utils/safeJson.js";
export type SemanticFactor={name:string;kind:"MEASURABLE"|"OBSERVABLE"|"COMPUTABLE"|"RULE"|"HUMAN_VALUE"|"E0";operator:string;grounded:boolean};
export type AlembicDistillate={version:"nyxa.alembic.v1";id:string;term:string;context:string;factors:readonly SemanticFactor[];semanticAliases:readonly string[];unresolvedResidue:readonly string[];groundingRatio:number;authority:"none";status:"QUINTESSENCE_AND_MATERIA_PRIMA"};
export function distillSemanticPortal(input:{term:string;context:string;factors:readonly SemanticFactor[];semanticAliases?:readonly string[]}):AlembicDistillate{
 if(!input.term.trim()||!input.context.trim()||input.factors.length<1||input.factors.length>64)throw new Error("alembic_input_invalid");
 for(const f of input.factors)if(!f.name.trim()||!f.operator.trim())throw new Error("alembic_factor_invalid");
 const unresolved=input.factors.filter(f=>!f.grounded||f.kind==="E0").map(f=>f.name);
 const grounded=input.factors.length-unresolved.length;
 const material={term:input.term,context:input.context,factors:input.factors,semanticAliases:[...(input.semanticAliases??[])].sort()};
 const id="alembic_"+createHash("sha256").update(safeJsonStringify(material)).digest("hex").slice(0,32);
 return {version:"nyxa.alembic.v1",id,term:input.term,context:input.context,factors:[...input.factors],semanticAliases:[...(input.semanticAliases??[])],unresolvedResidue:unresolved,groundingRatio:grounded/input.factors.length,authority:"none",status:"QUINTESSENCE_AND_MATERIA_PRIMA"};
}
export function requiresSemanticHold(x:AlembicDistillate,decisionRelevantFactors:readonly string[]):boolean{const relevant=new Set(decisionRelevantFactors);return x.unresolvedResidue.some(r=>relevant.has(r));}
export function semanticPortalInfluenceVector(input:{decision:number;attention:number;resource:number;memory:number;routing:number;epistemic:number;human:number;coordination:number}){for(const v of Object.values(input))if(!Number.isFinite(v)||v<0||v>1)throw new Error("alembic_influence_invalid");return Object.freeze({...input});}
