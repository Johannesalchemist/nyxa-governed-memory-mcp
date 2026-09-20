// Step 11A: E0 epistemic control layer -- deterministic unit tests. No MCP server spawn needed
// for most cases (E0 is a pure library), except where the tests specifically verify audit
// persistence, which uses a real, isolated data directory (never production).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { e0Triage, recommendEpistemicHold } from "../dist/epistemic/e0.js";
import { DEFAULT_E0_THRESHOLDS } from "../dist/epistemic/e0Types.js";
import { runDepthDrill, DEFAULT_DEPTH_DRILL_BUDGET } from "../dist/epistemic/depthDrill.js";
import { MockResearchProvider } from "../dist/epistemic/researchAgent.js";
import { E0AuditLog } from "../dist/epistemic/e0AuditLog.js";

function baseClaim(overrides = {}) {
  return {
    claim_id: "claim-1",
    statement: "ordinary claim",
    evidence_strength: 0.8,
    provenance_quality: 0.8,
    impact_score: 0.2,
    ...overrides
  };
}

// ---- A. Strong evidence, no contradiction -> KNOWN, no depth drill ----
test("A: strong evidence, no contradiction -> KNOWN, no depth drill", () => {
  const result = e0Triage(baseClaim());
  assert.equal(result.classification, "KNOWN");
  assert.equal(result.trigger_depth_drill, false);
});

// ---- B. Weak evidence, low impact -> UNKNOWN/KNOWN_UNKNOWN, no expensive drill ----
test("B: weak evidence, low impact -> UNKNOWN or KNOWN_UNKNOWN, no drill", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.2, provenance_quality: 0.3, impact_score: 0.1 }));
  assert.ok(["UNKNOWN", "KNOWN_UNKNOWN"].includes(result.classification));
  assert.equal(result.trigger_depth_drill, false, "low impact must not force an expensive drill");
});

// ---- C. High-impact + weak evidence -> depth drill triggered ----
test("C: high-impact + weak evidence -> depth drill triggered", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.2, impact_score: 0.9 }));
  assert.equal(result.trigger_depth_drill, true);
  assert.ok(result.reasons.includes("high_impact_weak_evidence"));
});

// ---- D. Contradictory evidence -> depth drill triggered ----
test("D: contradictory evidence -> unresolved epistemic conflict and depth drill", () => {
  const result = e0Triage(baseClaim({ contradiction_score: 0.7 }));
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.equal(result.trigger_depth_drill, true);
  assert.ok(result.reasons.includes("conflicting_evidence"));
  assert.ok(result.contradictions.length > 0);
});

// ---- E. Anomalous observation -> UNKNOWN_UNKNOWN_SIGNAL, depth drill triggered ----
test("E: anomalous observation -> UNKNOWN_UNKNOWN_SIGNAL, depth drill triggered", () => {
  const result = e0Triage(baseClaim({ anomaly_score: 0.8 }));
  assert.equal(result.classification, "UNKNOWN_UNKNOWN_SIGNAL");
  assert.equal(result.trigger_depth_drill, true);
  assert.ok(result.reasons.includes("anomalous_observation"));
});

// ---- F. Missing provenance on consequential claim -> depth drill or epistemic hold ----
test("F: missing provenance on a consequential claim -> depth drill or epistemic hold", () => {
  const result = e0Triage(baseClaim({ provenance_quality: 0.1, impact_score: 0.9, evidence_strength: 0.5 }));
  const hold = recommendEpistemicHold(result);
  assert.ok(result.trigger_depth_drill || hold, "must trigger depth drill and/or recommend epistemic hold");
});

// ---- Claim <= Evidence violation (signal B), explicit ----
test("Claim <= Evidence violation is detected as its own signal", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.3, claimed_confidence: 0.95 }));
  assert.ok(result.reasons.includes("claim_exceeds_evidence"));
});

// ---- Independent sources disagreeing (signal H) ----
test("independent sources disagreeing materially -> unresolved conflict and depth drill", () => {
  const result = e0Triage(baseClaim({ independent_sources: 3, disagreement_score: 0.8 }));
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.equal(result.trigger_depth_drill, true);
});

// ---- Unexpected verification failure (signal G) ----
test("unexpected verification failure triggers UNKNOWN_UNKNOWN_SIGNAL", () => {
  const result = e0Triage(baseClaim({ verification_failed_unexpectedly: true }));
  assert.equal(result.classification, "UNKNOWN_UNKNOWN_SIGNAL");
  assert.equal(result.trigger_depth_drill, true);
});


// ---- Answerability / epistemic sufficiency is primary; anomaly is only one subset ----
test("missing evidence -> UNKNOWN even without anomaly", () => {
  const result = e0Triage(baseClaim({ evidence_missing: true, anomaly_score: 0 }));
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("missing_evidence"));
});

test("stale evidence -> KNOWN_UNKNOWN and requests fresh evidence", () => {
  const result = e0Triage(baseClaim({ evidence_stale: true }));
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.ok(result.reasons.includes("stale_evidence"));
  assert.ok(result.missing_evidence.includes("fresh_evidence"));
});

test("unavailable evidence -> UNKNOWN", () => {
  const result = e0Triage(baseClaim({ evidence_unavailable: true }));
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("unavailable_evidence"));
});

test("unobservable current state -> UNKNOWN", () => {
  const result = e0Triage(baseClaim({ current_state_observable: false }));
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("unobservable_current_state"));
});

test("unverifiable claim -> UNKNOWN", () => {
  const result = e0Triage(baseClaim({ unverifiable_claim: true }));
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("unverifiable_claim"));
});

test("unresolved competing hypotheses -> KNOWN_UNKNOWN", () => {
  const result = e0Triage(baseClaim({ unresolved_hypotheses: 2 }));
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.ok(result.reasons.includes("unresolved_competing_hypotheses"));
});

test("evidence below required confidence -> KNOWN_UNKNOWN without pretending anomaly", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.75, required_confidence: 0.9 }));
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.ok(result.reasons.includes("confidence_below_required_threshold"));
  assert.ok(!result.reasons.includes("anomalous_observation"));
});

// ---- Bounded ranges ----
test("all scores remain within [0,1] even for out-of-range input", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 5, provenance_quality: -3, impact_score: 2 }));
  for (const v of [result.evidence_strength, result.provenance_quality, result.impact_score, result.residual_uncertainty]) {
    assert.ok(v >= 0 && v <= 1, `score ${v} out of [0,1]`);
  }
});

// ---- G. Research resolves uncertainty -> re-entry through E0 -> KNOWN or bounded KNOWN_UNKNOWN ----
test("G: research resolves uncertainty -> KNOWN or bounded KNOWN_UNKNOWN", async () => {
  const provider = new MockResearchProvider();
  const input = baseClaim({ statement: "claim __RESOLVES__ eventually", contradiction_score: 0.6, evidence_strength: 0.2, impact_score: 0.5 });
  const outcome = await runDepthDrill(input, provider);
  assert.ok(outcome.iterations_used >= 1);
  assert.ok(["KNOWN", "KNOWN_UNKNOWN"].includes(outcome.final.classification));
  assert.ok(["resolved", "bounded_known_unknown"].includes(outcome.stopping_reason));
});

// ---- H. Research finds stronger contradiction -> unresolved / escalates ----
test("H: research finds stronger contradiction -> remains unresolved or escalates", async () => {
  const provider = new MockResearchProvider();
  const input = baseClaim({ statement: "claim __ESCALATES__ over time", contradiction_score: 0.6, evidence_strength: 0.3, impact_score: 0.5 });
  const outcome = await runDepthDrill(input, provider, { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 2 });
  assert.ok(
    outcome.final.classification === "UNKNOWN_UNKNOWN_SIGNAL" || outcome.stopping_reason === "budget_exhausted",
    "must not silently resolve to KNOWN when contradiction strengthens"
  );
});

// ---- I. Budget exhausted -> clean stop, no loop, residual uncertainty recorded ----
test("I: budget exhausted -> clean stop, no loop, residual uncertainty recorded", async () => {
  const provider = new MockResearchProvider();
  const input = baseClaim({ statement: "claim __ESCALATES__ forever", contradiction_score: 0.6, evidence_strength: 0.3, impact_score: 0.5 });
  const budget = { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 2 };
  const outcome = await runDepthDrill(input, provider, budget);
  assert.equal(outcome.iterations_used <= budget.max_iterations, true);
  assert.ok(outcome.stopping_reason === "budget_exhausted" || outcome.stopping_reason === "no_information_gain");
  assert.equal(typeof outcome.final.residual_uncertainty, "number");
});

test("I2: wall-clock budget is enforced even with a slow, ever-changing-score provider", async () => {
  // Score keeps moving every round (never repeats) so the no-information-gain rule can never
  // fire -- isolating the wall-clock budget as the ONLY possible stopping mechanism here.
  let call = 0;
  const slowProvider = {
    async research() {
      call += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { supporting_evidence: [], disconfirming_evidence: [], alternative_hypotheses: [], missing_observables: [], provenance_refs: [], contradictions: [], updated_contradiction_score: 0.6 + (call % 3) * 0.1 };
    }
  };
  const input = baseClaim({ contradiction_score: 0.7, evidence_strength: 0.2, impact_score: 0.5 });
  const budget = { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 100, max_wall_time_ms: 60, no_gain_stop_after: 100 };
  const outcome = await runDepthDrill(input, slowProvider, budget);
  assert.equal(outcome.stopping_reason, "budget_exhausted");
  assert.ok(outcome.iterations_used < 100, "wall-time budget must cut the loop short well before max_iterations");
});

// ---- J. No information gain -> clean stop by diminishing-return rule ----
test("J: no information gain -> clean stop by diminishing-return rule", async () => {
  const provider = new MockResearchProvider();
  const input = baseClaim({ statement: "claim __NO_GAIN__ stays put", contradiction_score: 0.6, evidence_strength: 0.3, impact_score: 0.5 });
  const outcome = await runDepthDrill(input, provider, { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 5, no_gain_stop_after: 1 });
  assert.equal(outcome.stopping_reason, "no_information_gain");
  assert.ok(outcome.iterations_used < 5, "must stop well before exhausting the iteration budget once gain stalls");
});

// ---- K. Research agent attempts mutation -> blocked/unavailable by construction ----
test("K: a hostile-shaped finding is never executed, only merged as inert data", async () => {
  const provider = new MockResearchProvider();
  const input = baseClaim({ statement: "claim __HOSTILE__ payload", contradiction_score: 0.6, evidence_strength: 0.3, impact_score: 0.5 });
  const outcome = await runDepthDrill(input, provider, { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 1 });
  // The hostile "action" field is not part of ResearchFinding's type and is never read by
  // depthDrill.ts -- proven structurally: the outcome contains no trace of it (no "action" key
  // anywhere in the outcome), and no exception/side effect occurred from receiving it.
  const serialized = JSON.stringify(outcome);
  assert.equal(serialized.includes("nyxa_memory_promote_candidate"), false, "a smuggled action must never be surfaced or acted on");
  assert.ok(outcome.run_id, "the loop must still complete normally despite the hostile payload");
});

test("K2: ResearchProvider interface receives no reference to any mutating store", async () => {
  // Structural proof: capture exactly what depthDrill.ts passes to provider.research(...).
  let capturedRequest;
  const spyProvider = {
    async research(request) {
      capturedRequest = request;
      return { supporting_evidence: [], disconfirming_evidence: [], alternative_hypotheses: [], missing_observables: [], provenance_refs: [], contradictions: [] };
    }
  };
  const input = baseClaim({ contradiction_score: 0.6, evidence_strength: 0.3, impact_score: 0.5 });
  await runDepthDrill(input, spyProvider, { ...DEFAULT_DEPTH_DRILL_BUDGET, max_iterations: 1 });
  const keys = Object.keys(capturedRequest).sort();
  assert.deepEqual(keys, ["claim_id", "evidence_packet", "prior_alternative_hypotheses", "statement"].sort());
  // None of these are AuditLog/CandidateStore/HumanGrantStore/SecureConnector instances --
  // they are plain data (string, string, object, array).
  assert.equal(typeof capturedRequest.claim_id, "string");
  assert.equal(typeof capturedRequest.statement, "string");
  assert.equal(typeof capturedRequest.evidence_packet, "object");
  assert.ok(Array.isArray(capturedRequest.prior_alternative_hypotheses));
});

// ---- L. Human grant presence must not alter E0 result ----
test("L: E0's function signature has no grant/approval parameter at all -- independence by construction", () => {
  const withoutAnyGrantConcept = e0Triage(baseClaim({ evidence_strength: 0.9, provenance_quality: 0.9 }));
  // e0Triage takes exactly (input, thresholds) -- there is no third parameter for an
  // approval/grant object, so it is structurally impossible for human-authority state to
  // influence this result. Demonstrated by calling it with extraneous grant-shaped fields
  // stuffed into the input object itself: E0ClaimInput has no such field, so TypeScript
  // wouldn't compile it in production code, but even at the JS boundary, e0Triage ignores any
  // key it doesn't recognize.
  const withExtraneousGrantLikeFields = e0Triage({
    ...baseClaim({ evidence_strength: 0.9, provenance_quality: 0.9 }),
    humanGrant: { grantId: "forged-should-be-ignored" },
    approved: true
  });
  assert.deepEqual(withoutAnyGrantConcept, withExtraneousGrantLikeFields);
});

// ---- Epistemic hold semantics ----
test("EPISTEMIC_HOLD is a separate recommendation, not a classification value", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.1, provenance_quality: 0.1, impact_score: 0.9, anomaly_score: 0.8 }));
  assert.ok(!("EPISTEMIC_HOLD" === result.classification), "EPISTEMIC_HOLD must never be a classification value itself");
  assert.equal(recommendEpistemicHold(result), true);
});

test("EPISTEMIC_HOLD is not recommended for low-impact claims even with high uncertainty", () => {
  const result = e0Triage(baseClaim({ evidence_strength: 0.1, provenance_quality: 0.1, impact_score: 0.1, anomaly_score: 0.8 }));
  assert.equal(recommendEpistemicHold(result), false, "low impact must not trigger a hold recommendation");
});

// ---- Audit ----
test("AUDIT: a triggered depth-drill run produces a hash-chain-valid, correlatable record", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-step11a-e0audit-"));
  const auditLog = new E0AuditLog(dataDir);
  await auditLog.init();

  const provider = new MockResearchProvider();
  const input = baseClaim({ claim_id: "claim-audit-1", statement: "claim __RESOLVES__ soon", contradiction_score: 0.6, evidence_strength: 0.2, impact_score: 0.5 });
  const initial = e0Triage(input);
  const outcome = await runDepthDrill(input, provider);
  const hold = recommendEpistemicHold(outcome.final);
  const record = await auditLog.recordDepthDrillRun(input, initial.reasons, outcome, hold);

  assert.equal(record.claim_id, "claim-audit-1");
  assert.equal(record.run_id, outcome.run_id);
  assert.ok(record.thresholds_crossed.length > 0);

  const integrity = await auditLog.verifyIntegrity();
  assert.equal(integrity.valid, true);

  const recent = await auditLog.recent(10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].run_id, outcome.run_id);
});

// ---- Fast path never invokes a research provider ----
test("fast path (no trigger) never touches the research provider", async () => {
  let called = false;
  const spyProvider = { async research() { called = true; return { supporting_evidence: [], disconfirming_evidence: [], alternative_hypotheses: [], missing_observables: [], provenance_refs: [], contradictions: [] }; } };
  const outcome = await runDepthDrill(baseClaim(), spyProvider);
  assert.equal(called, false);
  assert.equal(outcome.iterations_used, 0);
  assert.equal(outcome.stopping_reason, "resolved");
});

// ---- Performance (Phase 11A.10) ----
test("PERFORMANCE: fast-path triage median/p95 latency is negligible, zero external calls", () => {
  const N = 2000;
  const samples = [];
  for (let i = 0; i < N; i += 1) {
    const t0 = process.hrtime.bigint();
    e0Triage(baseClaim({ evidence_strength: Math.random(), provenance_quality: Math.random(), impact_score: Math.random() }));
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6); // ms
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(N / 2)];
  const p95 = samples[Math.floor(N * 0.95)];
  console.log(`E0 fast-path triage: median=${median.toFixed(4)}ms p95=${p95.toFixed(4)}ms over ${N} samples`);
  assert.ok(median < 1, `median ${median}ms should be well under 1ms for a pure synchronous function`);
  assert.ok(p95 < 5, `p95 ${p95}ms should be well under 5ms`);
});
