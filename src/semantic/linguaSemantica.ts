/** NYXA Lingua Semantica: inert, evidence-linked semantic evolution candidates. */
export type SemanticObservation={domain:string;term:string;meaning:string;context:string;sourceRef:string;independent:boolean};
export type SemanticMaxim={id:string;term:string;domain:string;hypothesis:string;supportingRefs:string[];counterexampleRefs:string[];status:'HYPOTHESIS'|'TESTABLE';authorityEffect:'NONE'};
const normalize=(s:string)=>s.trim().replace(/\s+/g,' ').toLowerCase();
export function deriveSemanticMaxims(observations:readonly SemanticObservation[]):SemanticMaxim[]{
 const groups=new Map<string,SemanticObservation[]>();
 for(const o of observations){if(!o.term.trim()||!o.domain.trim()||!o.meaning.trim()||!o.sourceRef.trim())continue;const key=JSON.stringify([normalize(o.domain),normalize(o.term)]);groups.set(key,[...(groups.get(key)??[]),o]);}
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>{
  const meanings=new Map<string,SemanticObservation[]>();for(const o of items){const k=normalize(o.meaning);meanings.set(k,[...(meanings.get(k)??[]),o]);}
  const ordered=[...meanings.entries()].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]));const [meaning,support]=ordered[0]!;const dissent=ordered.slice(1).flatMap(([,xs])=>xs);
  const refs=[...new Set(support.filter(x=>x.independent).map(x=>x.sourceRef))].sort();const counter=[...new Set(dissent.map(x=>x.sourceRef))].sort();
  const [domain,term]=JSON.parse(key) as [string,string];return{id:key,domain,term,hypothesis:meaning,supportingRefs:refs,counterexampleRefs:counter,status:refs.length>=2&&counter.length===0?'TESTABLE':'HYPOTHESIS',authorityEffect:'NONE' as const};
 });
}
