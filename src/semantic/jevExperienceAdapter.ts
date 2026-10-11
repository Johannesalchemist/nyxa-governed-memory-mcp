import type {InsightRun} from '../organism/insightWindTunnel.js';
import {scoreInsightRun} from '../organism/insightWindTunnel.js';
import type {SemanticObservation,SemanticMaxim} from './linguaSemantica.js';
import {deriveSemanticMaxims} from './linguaSemantica.js';
/** Read-only translation of measured JEV runs into NLS hypotheses; no claim of verified truth. */
export function semanticObservationsFromJev(runs:readonly InsightRun[]):SemanticObservation[]{
 return runs.flatMap(r=>{const s=scoreInsightRun(r);if(!s.eligible||r.provenanceCoverage!==1||r.evidenceConfirmed<1||r.evidenceRejected>0)return[];
 return [{domain:r.domain,term:'evidence-backed cognitive lift',meaning:s.cognitiveLift>0?'positive measured lift':'no positive measured lift',context:`${r.arm}:${r.scenarioRef}`,sourceRef:`jev-run:${r.runId}`,independent:false}];});
}
/** Independently attested evidence must be added by a verifier, never inferred from JEV self-report. */
export function proposeJevSemanticMaxims(runs:readonly InsightRun[]):SemanticMaxim[]{return deriveSemanticMaxims(semanticObservationsFromJev(runs));}
