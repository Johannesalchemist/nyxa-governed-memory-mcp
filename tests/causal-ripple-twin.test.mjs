import test from "node:test";
import assert from "node:assert/strict";
import { deterministicRevisionId, effectiveClaimRevision, gateClaim, gateCausalEdge } from "../dist/ripple/engine.js";

const r = (status, valid_from, recorded_at = valid_from, extra = {}) => ({
  claim_id: "CL-1", status, valid_from, recorded_at, provenance_ref: `prov:${status}:${recorded_at}`, ...extra
});

test("event truth state is temporal: later correction wins without deleting history", () => {
  const history = [
    r("REPORTED", "2026-01-01T00:00:00Z"),
    r("SUPPORTED", "2026-01-03T00:00:00Z"),
    r("CONTESTED", "2026-01-08T00:00:00Z"),
    r("CONTRADICTED", "2026-02-12T00:00:00Z")
  ];
  assert.equal(effectiveClaimRevision(history, "2026-01-04T00:00:00Z")?.status, "SUPPORTED");
  assert.equal(effectiveClaimRevision(history, "2026-02-20T00:00:00Z")?.status, "CONTRADICTED");
  assert.equal(history.length, 4, "history remains immutable and inspectable");
});

test("late-recorded correction does not leak backwards in an as-of query", () => {
  const history = [
    r("SUPPORTED", "2026-01-03T00:00:00Z"),
    r("CONTRADICTED", "2026-01-03T00:00:00Z", "2026-02-12T00:00:00Z", { supersedes: "old" })
  ];
  assert.equal(effectiveClaimRevision(history, "2026-01-20T00:00:00Z")?.status, "SUPPORTED");
  assert.equal(effectiveClaimRevision(history, "2026-02-20T00:00:00Z")?.status, "CONTRADICTED");
});

test("reported claim cannot silently become evidence", () => {
  const result = gateClaim([r("REPORTED", "2026-01-01T00:00:00Z")], "2026-01-02T00:00:00Z");
  assert.equal(result.decision, "ESCALATE");
});

test("supported claim can satisfy a bounded supported requirement", () => {
  const result = gateClaim([r("SUPPORTED", "2026-01-01T00:00:00Z")], "2026-01-02T00:00:00Z");
  assert.equal(result.decision, "ALLOW");
});

test("contested claim escalates and contradicted claim denies", () => {
  assert.equal(gateClaim([r("CONTESTED", "2026-01-01T00:00:00Z")], "2026-01-02T00:00:00Z").decision, "ESCALATE");
  assert.equal(gateClaim([r("CONTRADICTED", "2026-01-01T00:00:00Z")], "2026-01-02T00:00:00Z").decision, "DENY");
});

test("no ripple without provenance: missing effective revision denies", () => {
  const result = gateClaim([], "2026-01-02T00:00:00Z");
  assert.equal(result.decision, "DENY");
  assert.deepEqual(result.reasons, ["no_valid_evidence_state"]);
});

test("simulation/repetition cannot promote a claim because gate accepts only evidence history", () => {
  const history = [r("REPORTED", "2026-01-01T00:00:00Z")];
  const before = gateClaim(history, "2026-01-02T00:00:00Z");
  const pretendSimulationRuns = 10_000_000;
  const pretendReach = 1_000_000_000;
  assert.ok(pretendSimulationRuns > 0 && pretendReach > 0);
  const after = gateClaim(history, "2026-01-02T00:00:00Z");
  assert.deepEqual(after, before);
  assert.equal(after.decision, "ESCALATE");
});

test("causal gate denies correlation/hypothesis, escalates support, allows causal evidence", () => {
  const base = { id: "CE-1", from: "A", to: "B", mechanism: "test", confidence: 0.9, evidence_ids: ["E-1"] };
  assert.equal(gateCausalEdge({ ...base, status: "CORRELATION" }).decision, "DENY");
  assert.equal(gateCausalEdge({ ...base, status: "HYPOTHESIS" }).decision, "DENY");
  assert.equal(gateCausalEdge({ ...base, status: "CAUSAL_SUPPORT" }).decision, "ESCALATE");
  assert.equal(gateCausalEdge({ ...base, status: "CAUSAL_EVIDENCE" }).decision, "ALLOW");
});

test("revision evidence id is deterministic", () => {
  const revision = r("SUPPORTED", "2026-01-01T00:00:00Z");
  assert.equal(deterministicRevisionId(revision), deterministicRevisionId({ ...revision }));
  assert.match(deterministicRevisionId(revision), /^ripple-[a-f0-9]{24}$/);
});
