/** Research-frontier evidence and ablation control. Pure and side-effect-free. */
export type Activation = 'OFF' | 'SHADOW' | 'SANDBOX' | 'CANARY' | 'ACTIVE' | 'QUARANTINED';
export type EvidenceKind = 'peer_reviewed' | 'dissertation' | 'preprint' | 'replication' | 'unverified';
export interface ResearchSource { id: string; url: string; title: string; kind: EvidenceKind; published: string; accessed: string; question: string; limitations: string[] }
export interface AblationResult { experimentId: string; baseline: number[]; candidate: number[]; higherIsBetter: boolean; independentReview: 'APPROVED' | 'DENIED' | 'PENDING'; gate: 'ALLOW' | 'DENY' | 'UNKNOWN'; }
const validUrl = (s: string) => { try { const u = new URL(s); return u.protocol === 'https:' && Boolean(u.hostname); } catch { return false; } };
export function validateResearchSource(s: ResearchSource): boolean {
 return Boolean(s.id?.trim() && s.title?.trim() && s.question?.trim() && validUrl(s.url) && ['peer_reviewed','dissertation','preprint','replication','unverified'].includes(s.kind) && Number.isFinite(Date.parse(s.published)) && Number.isFinite(Date.parse(s.accessed)) && Array.isArray(s.limitations));
}
export function evaluateAblation(r: AblationResult) {
 const valid = r.experimentId?.trim() && r.baseline.length >= 2 && r.candidate.length === r.baseline.length && [...r.baseline,...r.candidate].every(Number.isFinite);
 if (!valid) return { decision: 'HOLD' as const, reason: 'invalid_or_insufficient_measurements', improvement: null };
 const diff = r.candidate.reduce((sum,v,i)=>sum + (r.higherIsBetter ? v-(r.baseline[i] ?? 0) : (r.baseline[i] ?? 0)-v),0)/r.baseline.length;
 if (r.gate !== 'ALLOW' || r.independentReview !== 'APPROVED') return { decision: 'HOLD' as const, reason: 'independent_review_or_governance_missing', improvement: diff };
 return { decision: diff > 0 ? 'ELIGIBLE_FOR_AUTHORIZED_SANDBOX' as const : 'HOLD' as const, reason: diff > 0 ? 'positive_paired_delta_not_statistical_proof' : 'no_positive_improvement', improvement: diff };
}
export function canTransition(from: Activation, to: Activation, gate: 'ALLOW'|'DENY'|'UNKNOWN', authorized: boolean): boolean {
 if (to === 'OFF' || to === 'QUARANTINED') return true;
 if (gate !== 'ALLOW' || !authorized || from === 'QUARANTINED') return false;
 const transitions: Record<Activation, Activation[]> = {OFF:['SHADOW'],SHADOW:['SANDBOX'],SANDBOX:['CANARY'],CANARY:['ACTIVE'],ACTIVE:['CANARY'],QUARANTINED:[]};
 return transitions[from].includes(to);
}
