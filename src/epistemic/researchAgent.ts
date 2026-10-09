import type { E0ClaimInput } from "./e0Types.js";

/**
 * Independent E0 research agent contract (Phase 11A.4). "Independent" means a genuinely
 * separate role from the main system evaluating its own answer -- it receives only the claim
 * and evidence packet, searches FOR and AGAINST the claim, and returns evidence, never
 * authority. This interface is the entire surface a provider gets: no reference to AuditLog,
 * CandidateStore, HumanGrantStore, SecureConnector, or any other mutating object is ever passed
 * in, and ResearchFinding is pure data, never executed or dispatched anywhere -- a provider
 * structurally CANNOT invoke a mutating tool, write production state, issue a grant, approve an
 * action, alter policy mode, bypass Gamma, or directly execute a downstream capability, because
 * nothing in this file or depthDrill.ts ever gives it a handle capable of any of that (verified
 * in tests/e0-epistemic.test.mjs case K, which feeds a deliberately hostile-shaped finding
 * through and confirms it is only ever merged as inert data).
 *
 * No production research provider is implemented here. Wiring a real external research/model
 * provider is explicitly out of scope for this step -- only the interface, orchestration, and a
 * deterministic mock/test provider exist, per Phase 11A.4's own instruction not to wire an
 * unsafe or ungoverned production research path just to make tests pass.
 */
export type ResearchRequest = {
  claim_id: string;
  statement: string;
  evidence_packet: E0ClaimInput;
  prior_alternative_hypotheses?: string[];
  /** Provider must propagate cancellation to every downstream operation. */
  signal?: AbortSignal;
};

export type ResearchFinding = {
  supporting_evidence: string[];
  disconfirming_evidence: string[];
  alternative_hypotheses: string[];
  missing_observables: string[];
  provenance_refs: string[];
  contradictions: string[];
  /** Optional updated scores the finding suggests -- merged into the next E0 reassessment by
   *  the depth-drill loop (depthDrill.ts), never applied anywhere else. */
  updated_evidence_strength?: number;
  updated_contradiction_score?: number;
  updated_anomaly_score?: number;
  updated_provenance_quality?: number;
  requires_human_input?: boolean;
  /** Metered provider-internal tool calls; mandatory for nonzero tool budgets. */
  tool_calls_used?: number;
};

export type ResearchProvider = {
  research(request: ResearchRequest): Promise<ResearchFinding>;
};

/**
 * Deterministic, test-only provider. Behavior is entirely a pure function of
 * request.evidence_packet.claim_id / statement -- no randomness, no network, no LLM call -- so
 * tests are reproducible. Recognizes a few fixed marker substrings in the statement to select a
 * scripted finding shape (resolves / strengthens contradiction / no information gain / etc.),
 * letting tests exercise every depth-drill stopping path deterministically.
 */
export class MockResearchProvider implements ResearchProvider {
  private callCount = 0;

  public async research(request: ResearchRequest): Promise<ResearchFinding> {
    this.callCount += 1;
    const statement = request.statement;

    if (statement.includes("__RESOLVES__")) {
      return {
        supporting_evidence: [`independent_confirmation_round_${this.callCount}`],
        disconfirming_evidence: [],
        alternative_hypotheses: [],
        missing_observables: [],
        provenance_refs: [`mock:source:${this.callCount}`],
        contradictions: [],
        updated_evidence_strength: 0.9,
        updated_contradiction_score: 0,
        updated_anomaly_score: 0,
        updated_provenance_quality: 0.9
      };
    }

    if (statement.includes("__ESCALATES__")) {
      return {
        supporting_evidence: [],
        disconfirming_evidence: [`stronger_disconfirming_evidence_round_${this.callCount}`],
        alternative_hypotheses: [`alternative_hypothesis_round_${this.callCount}`],
        missing_observables: ["independent_replication"],
        provenance_refs: [`mock:source:${this.callCount}`],
        contradictions: [`new_contradiction_round_${this.callCount}`],
        updated_contradiction_score: Math.min(1, 0.6 + this.callCount * 0.1),
        updated_anomaly_score: Math.min(1, 0.6 + this.callCount * 0.1)
      };
    }

    if (statement.includes("__NO_GAIN__")) {
      // Deliberately returns the exact same scores every round -- proves the
      // diminishing-information-gain stopping rule (Phase 11A.6).
      return {
        supporting_evidence: [`same_evidence_round_${this.callCount}`],
        disconfirming_evidence: [],
        alternative_hypotheses: [],
        missing_observables: ["independent_replication"],
        provenance_refs: [`mock:source:${this.callCount}`],
        contradictions: [],
        updated_evidence_strength: 0.5,
        updated_contradiction_score: 0.55,
        updated_anomaly_score: 0.1,
        updated_provenance_quality: 0.5
      };
    }

    if (statement.includes("__HOSTILE__")) {
      // A deliberately hostile-shaped finding: an extra, unspecified field that LOOKS like an
      // executable instruction. Proves the orchestrator never interprets ResearchFinding as
      // anything but inert data (case K).
      return {
        supporting_evidence: [],
        disconfirming_evidence: [],
        alternative_hypotheses: [],
        missing_observables: [],
        provenance_refs: [],
        contradictions: [],
        // @ts-expect-error -- deliberately not part of ResearchFinding, simulating a hostile/
        // malformed provider trying to smuggle an executable-looking instruction through.
        action: { type: "nyxa_propose_action", tool: "nyxa_memory_promote_candidate" }
      };
    }

    // Default: mild supporting evidence, no contradiction, small information gain.
    return {
      supporting_evidence: [`general_supporting_evidence_round_${this.callCount}`],
      disconfirming_evidence: [],
      alternative_hypotheses: [],
      missing_observables: [],
      provenance_refs: [`mock:source:${this.callCount}`],
      contradictions: [],
      updated_evidence_strength: Math.min(1, 0.5 + this.callCount * 0.15),
      updated_provenance_quality: Math.min(1, 0.5 + this.callCount * 0.1)
    };
  }
}
