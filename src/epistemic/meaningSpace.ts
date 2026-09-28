import { createHash } from "node:crypto";

/** Meaning is a perspective-bound interpretation, never evidence or truth. */
export type MeaningObservation = {
  id: string;
  perspective: string;
  text: string;
  valence: number;
  relation_refs: string[];
  provenance_refs: string[];
};

export type MeaningSpace = {
  id: string;
  signature: string[];
  member_ids: string[];
  perspectives: string[];
  mean_valence: number;
  relation_refs: string[];
  provenance_refs: string[];
};

const STOP = new Set(["the","and","for","with","from","that","this","into","eine","einer","einem","einen","eines","der","die","das","den","dem","des","und","oder","mit","von","für","ist","sind","auf","im","in","zu"]);
function tokens(text: string): string[] {
  return [...new Set(text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}_-]{3,}/gu) ?? [])]
    .filter((x) => !STOP.has(x)).sort();
}
function similarity(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b); const union = new Set([...A, ...B]);
  if (!union.size) return 0;
  let intersection = 0; for (const x of A) if (B.has(x)) intersection++;
  return intersection / union.size;
}
function clampValence(v: number): number { return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }

/** Deterministic recurring-meaning detector. It groups lexical/relational recurrence only.
 * It MUST NOT promote a meaning to evidence, causality, ontology or governance authority. */
export function detectRecurringMeaningSpaces(observations: readonly MeaningObservation[], threshold = 0.34): MeaningSpace[] {
  const groups: Array<{ signature: string[]; members: MeaningObservation[] }> = [];
  for (const observation of [...observations].sort((a,b) => a.id.localeCompare(b.id))) {
    const signature = tokens(observation.text);
    let best = -1, score = 0;
    for (let i=0;i<groups.length;i++) { const s=similarity(signature, groups[i]!.signature); if (s>score) { score=s; best=i; } }
    if (best >= 0 && score >= threshold) {
      const g=groups[best]!; g.members.push(observation);
      const counts=new Map<string,number>(); for (const m of g.members) for (const t of tokens(m.text)) counts.set(t,(counts.get(t)??0)+1);
      g.signature=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8).map(([t])=>t).sort();
    } else groups.push({ signature, members:[observation] });
  }
  return groups.filter(g=>g.members.length>1).map(g=>{
    const member_ids=g.members.map(m=>m.id).sort();
    const id=`meaning-${createHash("sha256").update(member_ids.join("|")).digest("hex").slice(0,16)}`;
    return { id, signature:g.signature, member_ids, perspectives:[...new Set(g.members.map(m=>m.perspective))].sort(),
      mean_valence:g.members.reduce((s,m)=>s+clampValence(m.valence),0)/g.members.length,
      relation_refs:[...new Set(g.members.flatMap(m=>m.relation_refs))].sort(), provenance_refs:[...new Set(g.members.flatMap(m=>m.provenance_refs))].sort() };
  });
}
