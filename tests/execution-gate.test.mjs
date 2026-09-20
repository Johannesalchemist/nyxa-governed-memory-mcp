import test from "node:test";
import assert from "node:assert/strict";
import { parseProposal } from "../dist/governance/proposal.js";
import { ExecutionGate } from "../dist/governance/executionGate.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

function proposal(overrides = {}) {
  return parseProposal({
    actor: "instinct-agent",
    action: "nyxa_e2e_write_scratch",
    target: "scratch:/counter.txt",
    scope: "execution-gate test",
    claims: [{ tag: "FACT", statement: "test", source: "execution-gate-test" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "gate", runId: "1", requestingIdentity: "Jo" },
    ...overrides
  });
}

function gate(overrides = {}) {
  return new ExecutionGate({
    windowMs: 60_000,
    maxExecutionsPerWindow: 30,
    maxPerActorAction: 10,
    maxPerTarget: 10,
    maxEffectUnitsPerWindow: 20,
    externalAuthority: [],
    ...overrides
  });
}test("external I1 without authority escalates instead of being amputated", () => {
  const g = gate();
  const p = proposal({ target: "https://api.example.invalid/book" });
  const decision = g.evaluateAndReserve(p, TOOL_POLICIES.nyxa_e2e_write_scratch, 1_000);
  assert.equal(decision.allowed, false);
  assert.equal(decision.outcome, "ESCALATE");
  assert.equal(decision.reason, "external_authority_required");
});

test("matching external authority lease allows bounded I1 execution", () => {
  const g = gate({ externalAuthority: [{ id: "booking-demo", action: "nyxa_e2e_write_scratch", targetPrefix: "https://api.example.invalid/", maxExecutionsPerWindow: 2 }] });
  const p = proposal({ target: "https://api.example.invalid/book" });
  const first = g.evaluateAndReserve(p, TOOL_POLICIES.nyxa_e2e_write_scratch, 1_000);
  assert.equal(first.allowed, true);
  assert.equal(first.authorityId, "booking-demo");
});

test("authority lease enforces its own budget", () => {
  const g = gate({ externalAuthority: [{ id: "mail-run", action: "nyxa_e2e_write_scratch", targetPrefix: "email:", maxExecutionsPerWindow: 1 }] });
  const policy = TOOL_POLICIES.nyxa_e2e_write_scratch;
  assert.equal(g.evaluateAndReserve(proposal({ target: "email:a@example.invalid" }), policy, 1_000).allowed, true);
  const blocked = g.evaluateAndReserve(proposal({ target: "email:b@example.invalid", provenance: { taskId: "x", runId: "2", requestingIdentity: "Jo" } }), policy, 1_001);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.outcome, "DENY");
  assert.equal(blocked.reason, "external_authority_rate_exceeded");
});



test("authority lease enforces effect-unit budget independently from rate", () => {
  const g = gate({ externalAuthority: [{ id: "budget", action: "nyxa_e2e_write_scratch", targetPrefix: "email:", maxExecutionsPerWindow: 10, maxEffectUnitsPerWindow: 1 }] });
  const policy = TOOL_POLICIES.nyxa_e2e_write_scratch;
  assert.equal(g.evaluateAndReserve(proposal({ target: "email:a@example.invalid" }), policy, 1_000).allowed, true);
  const blocked = g.evaluateAndReserve(proposal({ target: "email:b@example.invalid", provenance: { taskId: "b", runId: "2", requestingIdentity: "Jo" } }), policy, 1_001);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "external_authority_budget_exceeded");
});
test("actor+action burst is denied before an eleventh effect", () => {
  const g = gate();
  for (let i = 0; i < 10; i++) {
    const p = proposal({ target: `scratch:/counter-${i}.txt`, provenance: { taskId: "gate", runId: String(i), requestingIdentity: "Jo" } });
    assert.equal(g.evaluateAndReserve(p, TOOL_POLICIES.nyxa_e2e_write_scratch, 1_000 + i).allowed, true);
  }
  const blocked = g.evaluateAndReserve(
    proposal({ target: "scratch:/counter-10.txt", provenance: { taskId: "gate", runId: "10", requestingIdentity: "Jo" } }),
    TOOL_POLICIES.nyxa_e2e_write_scratch,
    1_020
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "actor_action_rate_exceeded");
});test("effect budget is independent from raw call count", () => {
  const g = gate({ maxEffectUnitsPerWindow: 2, maxPerActorAction: 20, maxPerTarget: 20 });
  const policy = TOOL_POLICIES.nyxa_e2e_write_scratch;
  assert.equal(g.evaluateAndReserve(proposal({ target: "scratch:/a" }), policy, 2_000).allowed, true);
  assert.equal(g.evaluateAndReserve(proposal({ target: "scratch:/b", provenance: { taskId: "g", runId: "2", requestingIdentity: "Jo" } }), policy, 2_001).allowed, true);
  const blocked = g.evaluateAndReserve(
    proposal({ target: "scratch:/c", provenance: { taskId: "g", runId: "3", requestingIdentity: "Jo" } }),
    policy,
    2_002
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "effect_budget_exceeded");
});

test("window expiry restores capacity", () => {
  const g = gate({ maxExecutionsPerWindow: 1, maxPerActorAction: 1, maxPerTarget: 1, maxEffectUnitsPerWindow: 1 });
  const p1 = proposal();
  const p2 = proposal({ target: "scratch:/later", provenance: { taskId: "gate", runId: "later", requestingIdentity: "Jo" } });
  assert.equal(g.evaluateAndReserve(p1, TOOL_POLICIES.nyxa_e2e_write_scratch, 10_000).allowed, true);
  assert.equal(g.evaluateAndReserve(p2, TOOL_POLICIES.nyxa_e2e_write_scratch, 10_100).allowed, false);
  assert.equal(g.evaluateAndReserve(p2, TOOL_POLICIES.nyxa_e2e_write_scratch, 70_001).allowed, true);
});