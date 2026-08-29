import assert from "node:assert/strict";
import test from "node:test";
import { parseProposal, ProposalValidationError } from "../dist/governance/proposal.js";
import { evaluateProposal } from "../dist/governance/gamma.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

const NOW = Date.parse("2026-08-29T12:00:00.000Z");

function baseProposal(overrides = {}) {
  return {
    actor: "test-actor",
    action: "nyxa_read_file",
    target: "root:/README.md",
    scope: "read one file for verification",
    claims: [{ tag: "FACT", statement: "file exists", source: "filesystem-listing" }],
    uncertainty: 0.1,
    requestedCapabilityClass: "I0",
    estimatedIrreversibility: "I0",
    provenance: { taskId: "t1", runId: "r1", requestingIdentity: "tester" },
    ...overrides
  };
}

test("allowed action passes through to ALLOW", () => {
  const proposal = parseProposal(baseProposal());
  const decision = evaluateProposal(proposal, {
    toolPolicy: TOOL_POLICIES["nyxa_read_file"],
    mode: "observe_only",
    now: NOW
  });
  assert.equal(decision.outcome, "ALLOW");
  assert.equal(decision.domain, null);
});

test("denied action (unknown/disallowed tool) returns DENY", () => {
  const proposal = parseProposal(baseProposal());
  const disallowedPolicy = { ...TOOL_POLICIES["nyxa_read_file"], allowedInV01: false };
  const decision = evaluateProposal(proposal, { toolPolicy: disallowedPolicy, mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C1");
});

test("missing authority (mode below minimum) returns DENY at C2", () => {
  const proposal = parseProposal(
    baseProposal({ action: "nyxa_run_test", target: "unit-tests", estimatedIrreversibility: "I1" })
  );
  const decision = evaluateProposal(proposal, {
    toolPolicy: TOOL_POLICIES["nyxa_run_test"],
    mode: "observe_only",
    now: NOW
  });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C2");
  assert.equal(decision.reason, "mode_below_minimum");
});

test("action requiring human approval returns ESCALATE, not DENY or ALLOW", () => {
  const proposal = parseProposal(baseProposal());
  const approvalPolicy = { ...TOOL_POLICIES["nyxa_read_file"], requiresHumanApproval: true };
  const decision = evaluateProposal(proposal, { toolPolicy: approvalPolicy, mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "ESCALATE");
  assert.equal(decision.domain, "C2");
});

test("malformed proposal (missing required field) is rejected before reaching gamma, audited as INVALID", () => {
  const bad = baseProposal();
  delete bad.actor;
  assert.throws(
    () => parseProposal(bad),
    (error) => {
      assert.ok(error instanceof ProposalValidationError);
      assert.equal(error.code, "proposal_invalid");
      return true;
    }
  );
});

test("missing provenance (empty claims array) is rejected with a distinct reason", () => {
  const bad = baseProposal({ claims: [] });
  assert.throws(
    () => parseProposal(bad),
    (error) => {
      assert.ok(error instanceof ProposalValidationError);
      assert.equal(error.code, "missing_provenance_evidence");
      return true;
    }
  );
});

test("wrong I-level (proposer under-claims irreversibility) is DENIED at C3, not silently allowed", () => {
  const proposal = parseProposal(
    baseProposal({ action: "nyxa_run_test", target: "unit-tests", estimatedIrreversibility: "I0" })
  );
  const decision = evaluateProposal(proposal, { toolPolicy: TOOL_POLICIES["nyxa_run_test"], mode: "draft", now: NOW });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C3");
  assert.equal(decision.reason, "irreversibility_underestimated");
});

test("stale evidence (EXTERNAL_EVIDENCE claim older than 24h) is DENIED at C4", () => {
  const staleTimestamp = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
  const proposal = parseProposal(
    baseProposal({
      claims: [{ tag: "EXTERNAL_EVIDENCE", statement: "checked yesterday", source: "external-scan", asOf: staleTimestamp }]
    })
  );
  const decision = evaluateProposal(proposal, { toolPolicy: TOOL_POLICIES["nyxa_read_file"], mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C4");
  assert.match(decision.reason, /stale_evidence/);
});

test("fake/unsourced evidence is DENIED at C4 (schema catches empty, gamma catches whitespace-only)", () => {
  assert.throws(() => parseProposal(baseProposal({ claims: [{ tag: "FACT", statement: "x", source: "" }] })));

  const proposal = parseProposal(baseProposal({ claims: [{ tag: "FACT", statement: "x", source: "   " }] }));
  const decision = evaluateProposal(proposal, { toolPolicy: TOOL_POLICIES["nyxa_read_file"], mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C4");
});

test("attempted capability widening (I2/I3 action proposed) is DENIED at C3 regardless of other fields", () => {
  const proposal = parseProposal(baseProposal({ estimatedIrreversibility: "I3" }));
  const i2Policy = { ...TOOL_POLICIES["nyxa_read_file"], capabilityClass: "I2" };
  const decisionI2 = evaluateProposal(proposal, { toolPolicy: i2Policy, mode: "observe_only", now: NOW });
  assert.equal(decisionI2.outcome, "DENY");
  assert.equal(decisionI2.domain, "C3");

  const i3Policy = { ...TOOL_POLICIES["nyxa_read_file"], capabilityClass: "I3" };
  const decisionI3 = evaluateProposal(proposal, { toolPolicy: i3Policy, mode: "observe_only", now: NOW });
  assert.equal(decisionI3.outcome, "DENY");
  assert.equal(decisionI3.domain, "C3");
});

test("unknown tool name returns UNKNOWN, not ALLOW", () => {
  const proposal = parseProposal(baseProposal({ action: "nyxa_totally_made_up_tool" }));
  const decision = evaluateProposal(proposal, { toolPolicy: undefined, mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "UNKNOWN");
  assert.notEqual(decision.outcome, "ALLOW");
  assert.equal(decision.domain, "C1");
});

test("high-risk tool would ESCALATE at C5", () => {
  const proposal = parseProposal(baseProposal());
  const highRiskPolicy = { ...TOOL_POLICIES["nyxa_read_file"], executionRisk: "high" };
  const decision = evaluateProposal(proposal, { toolPolicy: highRiskPolicy, mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "ESCALATE");
  assert.equal(decision.domain, "C5");
});

test("backendDegraded flag forces DEGRADE outcome ahead of all other checks", () => {
  const proposal = parseProposal(baseProposal());
  const disallowedPolicy = { ...TOOL_POLICIES["nyxa_read_file"], allowedInV01: false };
  const decision = evaluateProposal(proposal, {
    toolPolicy: disallowedPolicy,
    mode: "observe_only",
    now: NOW,
    backendDegraded: true
  });
  assert.equal(decision.outcome, "DEGRADE");
  assert.equal(decision.domain, null);
});

test("attempted self-authorization: proposal targeting governance/policy source is denied even when requester claims to be the governance system itself", () => {
  const proposal = parseProposal(
    baseProposal({
      actor: "gamma-self",
      action: "nyxa_read_file",
      target: "root:/src/policy/toolPolicy.ts",
      provenance: { taskId: "t1", runId: "r1", requestingIdentity: "system:gamma" }
    })
  );
  const decision = evaluateProposal(proposal, { toolPolicy: TOOL_POLICIES["nyxa_read_file"], mode: "observe_only", now: NOW });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C1");
  assert.equal(decision.reason, "target_is_protected_governance_surface");
});
