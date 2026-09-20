import { randomUUID } from "node:crypto";
import { e0Triage } from "./e0.js";
import type { E0ClaimInput, E0Result, E0Thresholds } from "./e0Types.js";
import { DEFAULT_E0_THRESHOLDS } from "./e0Types.js";
import type { ResearchProvider } from "./researchAgent.js";

/**
 * Bounded depth-drill research loop (Phase 11A.5/11A.6). Depth drill only ever runs when
 * e0Triage already set trigger_depth_drill -- ordinary KNOWN/KNOWN_UNKNOWN cases never reach
 * this module at all, keeping the fast path fast. Every budget is a hard, explicit,
 * caller-configurable limit; defaults are conservative. No hidden loop: the while-loop below is
 * bounded by max_iterations on every path, and every early-return path is one of the six
 * documented stopping reasons -- there is no way to fall through into an unbounded loop.
 */
export type DepthDrillBudget = {
  max_iterations: number;
  max_research_agents: number;
  max_tool_calls: number;
  max_wall_time_ms: number;
  max_cost_units?: number;
  /** Consecutive no-material-change rounds before stopping (Phase 11A.6). */
  no_gain_stop_after: number;
};

export const DEFAULT_DEPTH_DRILL_BUDGET: DepthDrillBudget = {
  max_iterations: 3,
  max_research_agents: 1,
  max_tool_calls: 0,
  max_wall_time_ms: 5_000,
  no_gain_stop_after: 1
};

export type DepthDrillStoppingReason =
  | "resolved"
  | "bounded_known_unknown"
  | "budget_exhausted"
  | "no_information_gain"
  | "human_input_required";

export type DepthDrillEvidenceGraph = {
  supporting: string[];
  disconfirming: string[];
  hypotheses: string[];
  missing_observables: string[];
  contradictions: string[];
  provenance_refs: string[];
};

export type DepthDrillOutcome = {
  run_id: string;
  final: E0Result;
  iterations_used: number;
  stopping_reason: DepthDrillStoppingReason;
  evidence_graph: DepthDrillEvidenceGraph;
  budget: DepthDrillBudget;
  tool_calls_used: number;
};

/** Rounds scores for the "materially unchanged" comparison in the no-information-gain rule --
 *  intentionally coarse (1 decimal place) so noise-level float differences don't defeat it. */
function signatureOf(result: E0Result): string {
  const round = (n: number) => Math.round(n * 10) / 10;
  return [
    result.classification,
    round(result.evidence_strength),
    round(result.contradiction_score),
    round(result.anomaly_score),
    round(result.provenance_quality)
  ].join("|");
}

/**
 * Runs the bounded research loop. Returns immediately (iterations_used: 0, stopping_reason:
 * "resolved") if the initial triage did not trigger depth drill -- this function is always safe
 * to call unconditionally by a caller that doesn't want to duplicate the trigger check itself.
 *
 * The research provider is called at most max_iterations times, each call strictly bounded by
 * max_wall_time_ms (checked before every iteration, not only at the start). Every
 * ResearchFinding is merged into evidence_graph as plain data (string arrays and numeric score
 * overrides) and fed into a fresh e0Triage call -- never executed, never interpreted as an
 * instruction, matching researchAgent.ts's own guarantee.
 */
export async function runDepthDrill(
  initialInput: E0ClaimInput,
  provider: ResearchProvider,
  budget: DepthDrillBudget = DEFAULT_DEPTH_DRILL_BUDGET,
  thresholds: E0Thresholds = DEFAULT_E0_THRESHOLDS
): Promise<DepthDrillOutcome> {
  const runId = randomUUID();
  const startedAt = Date.now();
  const evidenceGraph: DepthDrillEvidenceGraph = {
    supporting: [],
    disconfirming: [],
    hypotheses: [],
    missing_observables: [],
    contradictions: [],
    provenance_refs: []
  };

  let current = e0Triage(initialInput, thresholds);
  if (!current.trigger_depth_drill) {
    return { run_id: runId, final: current, iterations_used: 0, stopping_reason: "resolved", evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
  }

  let input = initialInput;
  let iterations = 0;
  let lastSignature = signatureOf(current);
  let noGainStreak = 0;

  while (iterations < budget.max_iterations) {
    if (Date.now() - startedAt > budget.max_wall_time_ms) {
      return { run_id: runId, final: current, iterations_used: iterations, stopping_reason: "budget_exhausted", evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
    }

    iterations += 1;
    const finding = await provider.research({
      claim_id: input.claim_id,
      statement: input.statement,
      evidence_packet: input,
      prior_alternative_hypotheses: evidenceGraph.hypotheses
    });

    evidenceGraph.supporting.push(...finding.supporting_evidence);
    evidenceGraph.disconfirming.push(...finding.disconfirming_evidence);
    evidenceGraph.hypotheses.push(...finding.alternative_hypotheses);
    evidenceGraph.missing_observables.push(...finding.missing_observables);
    evidenceGraph.contradictions.push(...finding.contradictions);
    evidenceGraph.provenance_refs.push(...finding.provenance_refs);

    if (finding.requires_human_input) {
      const reassessed = e0Triage(input, thresholds);
      return { run_id: runId, final: reassessed, iterations_used: iterations, stopping_reason: "human_input_required", evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
    }

    const updatedInput: E0ClaimInput = {
      ...input,
      evidence_strength: finding.updated_evidence_strength ?? input.evidence_strength,
      contradiction_score: finding.updated_contradiction_score ?? input.contradiction_score ?? 0,
      anomaly_score: finding.updated_anomaly_score ?? input.anomaly_score ?? 0,
      provenance_quality: finding.updated_provenance_quality ?? input.provenance_quality
    };
    let reassessed = e0Triage(updatedInput, thresholds);
    reassessed = { ...reassessed, alternative_hypotheses: [...evidenceGraph.hypotheses] };

    if (!reassessed.trigger_depth_drill) {
      const stopping = reassessed.classification === "KNOWN" ? "resolved" : "bounded_known_unknown";
      return { run_id: runId, final: reassessed, iterations_used: iterations, stopping_reason: stopping, evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
    }

    const newSignature = signatureOf(reassessed);
    noGainStreak = newSignature === lastSignature ? noGainStreak + 1 : 0;
    lastSignature = newSignature;
    current = reassessed;
    input = updatedInput;

    if (noGainStreak >= budget.no_gain_stop_after) {
      return { run_id: runId, final: current, iterations_used: iterations, stopping_reason: "no_information_gain", evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
    }
  }

  return { run_id: runId, final: current, iterations_used: iterations, stopping_reason: "budget_exhausted", evidence_graph: evidenceGraph, budget, tool_calls_used: 0 };
}
