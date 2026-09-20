// Current C5/E0 ordering and Human Authority boundary against the real compiled
// dist/index.js, plus a few direct module-level tests where the live proposal envelope
// genuinely has no way yet to carry the needed signal (documented per case, not hidden).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome, cleanupAll } from "./helpers/isolated-e2e-env.mjs";
import { e0Triage } from "../dist/epistemic/e0.js";
import { applyTrustedEpistemicContext, assessEpistemicStateSafely, deriveE0ClaimInput, requiresEpistemicAssessment, shouldEpistemicHold } from "../dist/epistemic/integration.js";

const RUNTIME = resolve(".");
const TOKEN = "step11b-integration-token";
const isolatedHomes = [];
after(() => cleanupAll(isolatedHomes));

async function spawnServer({ mode = "draft", token = TOKEN } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-step11b-data-"));
  const home = await createIsolatedE2EHome();
  isolatedHomes.push(home);
  const env = {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: home.homeDir,
    LANG: "C.UTF-8",
    NYXA_DATA_DIR: dataDir
  };
  if (mode) env.NYXA_AGENT_MODE = mode;
  if (token) env.NYXA_HUMAN_AUTHORITY_TOKEN = token;
  const transport = new StdioClientTransport({ command: "/usr/bin/node", args: ["dist/index.js"], cwd: RUNTIME, env, stderr: "pipe" });
  const client = new Client({ name: "nyxa-step11b-integration-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, dataDir };
}

function parse(result) { return JSON.parse(result.content[0].text); }

function strongClaim(source = "step11b-test") {
  return { tag: "FACT", statement: "strong claim", source };
}
function weakClaim(source = "unknown") {
  return { tag: "HYPOTHESIS", statement: "weak claim", source };
}

async function readCandidatesJsonl(dataDir) {
  const raw = await readFile(join(dataDir, "memory", "candidates.jsonl"), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function readAuditEvents(dataDir) {
  const raw = await readFile(join(dataDir, "audit.log.jsonl"), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function storeProposal({ claims, uncertainty = 0, provenanceOverrides = {}, payloadOverrides = {} } = {}) {
  return {
    actor: "step11b-test",
    action: "nyxa_memory_store_candidate",
    target: "memory:/candidate",
    scope: "step11b integration E2E",
    claims,
    uncertainty,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "step11b", runId: `run-${Math.random()}`, requestingIdentity: "Jo", ...provenanceOverrides },
    payload: {
      content: "step11b candidate",
      candidate_type: "observation",
      source: "agent",
      scope: "project",
      purpose: "step11b integration test",
      confidence: 0.9,
      importance: 0.5,
      ...payloadOverrides
    }
  };
}

async function issueGrant(client, { capability = "nyxa_memory_promote_candidate", targetId, token = TOKEN } = {}) {
  const res = await client.callTool({ name: "nyxa_human_grant_issue", arguments: { token, capability, target_id: targetId } });
  return { raw: res, parsed: JSON.parse(res.content[0].text) };
}

function promoteProposal(candidateId, claims, uncertainty, humanGrant, provenanceOverrides = {}) {
  return {
    actor: "step11b-test",
    action: "nyxa_memory_promote_candidate",
    target: `memory-candidate:/${candidateId}`,
    scope: "step11b integration E2E",
    claims,
    uncertainty,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "step11b-promote", runId: `run-${Math.random()}`, requestingIdentity: "Jo", ...provenanceOverrides },
    ...(humanGrant ? { payload: { humanGrant } } : {})
  };
}

// Memory mutations currently stop at C5 before E0: no trusted dependency radius.
for (const [label, claims, payloadOverrides] of [
  ["strong evidence", [strongClaim(), strongClaim("second-source")], {}],
  ["weak evidence", [weakClaim()], {}],
  ["caller radius/confidence spoof", [weakClaim()], { effectRadius: 0, evidence_strength: 1 }]
]) {
  test(`C5 precedes E0 for unsupported memory target: ${label}, no effect`, async context => {
    const { client, dataDir } = await spawnServer();
    context.after(() => client.close());
    const result = parse(await client.callTool({ name: "nyxa_propose_action", arguments: {
      proposal: { ...storeProposal({ claims, payloadOverrides }), target: "memory:/unsupported" }
    }}));
    assert.equal(result.policy_decision, "ESCALATE");
    assert.equal(result.domain, "C5");
    assert.equal(result.reason, "effect_radius_unknown_requires_human_review");
    assert.equal((await readCandidatesJsonl(dataDir)).length, 0);
    const event = (await readAuditEvents(dataDir)).find(e => e.tool === "nyxa_propose_action");
    assert.equal(event.gamma_domain, "C5");
    assert.equal("epistemic_classification" in event, false);
  });
}

// ---- C. Unknown-unknown signal -> EPISTEMIC_HOLD, no effect ----
// Module-level, not full MCP E2E: the live proposal envelope has no current signal source for
// contradiction_score/anomaly_score (deriveE0ClaimInput only derives evidence_strength/
// provenance_quality/impact_score/claimed_confidence from real structural data today -- see
// epistemic/integration.ts's own doc comment). This proves the INTEGRATION layer (the real
// compiled shouldEpistemicHold, not a reimplementation) correctly holds once such a signal
// exists, honestly documented as not yet wired end-to-end from the live envelope.
test("C: unknown-unknown signal -> HELD at the integration-decision layer (signal not yet live-wired end-to-end)", () => {
  const result = e0Triage({ claim_id: "c", statement: "s", evidence_strength: 0.7, provenance_quality: 0.7, impact_score: 0.7, anomaly_score: 0.8 });
  assert.equal(result.classification, "UNKNOWN_UNKNOWN_SIGNAL");
  assert.equal(shouldEpistemicHold(result), true);
});

test("valid human grant cannot override unknown effect radius and remains unconsumed", async context => {
  const { client, dataDir } = await spawnServer();
  context.after(() => client.close());
  // Seed one candidate directly as test setup, not as evidence of MCP write authorization.
  const { CandidateStore } = await import("../dist/memory/candidateStore.js");
  const store = new CandidateStore(dataDir);
  await store.init();
  const candidate = await store.writeCandidate(storeProposal({ claims: [strongClaim()] }).payload,
    { writtenBy: "fixture", taskId: "fixture", runId: "fixture" },
    { outcome: "ALLOW", domain: null, reason: "explicit isolated test fixture" });
  const grant = await issueGrant(client, { targetId: candidate.id });
  assert.ok(grant.parsed.grant_id);
  for (const claims of [[strongClaim()], [weakClaim()]]) {
    const result = parse(await client.callTool({ name: "nyxa_propose_action", arguments: {
      proposal: promoteProposal(candidate.id, claims, 0, { grantId: grant.parsed.grant_id })
    }}));
    assert.equal(result.policy_decision, "ESCALATE");
    assert.equal(result.reason, "effect_radius_unknown_requires_human_review");
  }
  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].status, "pending");
  const events = (await readAuditEvents(dataDir)).filter(e => e.tool === "nyxa_propose_action");
  assert.equal(events.length, 2);
  assert.ok(events.every(e => e.human_grant_status === "valid"));
  assert.ok(events.every(e => !("epistemic_classification" in e)));
});

// ---- I. Pure read -> E0 bypassed, normal behavior ----
test("I: a pure I0 read dispatched via nyxa_propose_action bypasses E0 entirely", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const proposal = {
    actor: "step11b-test", action: "nyxa_read_file", target: "isolated-readroot:/does-not-need-to-exist.txt",
    scope: "step11b read bypass test", claims: [strongClaim()], uncertainty: 0,
    requestedCapabilityClass: "I0", estimatedIrreversibility: "I0",
    provenance: { taskId: "step11b-read", runId: "run-1", requestingIdentity: "Jo" }
  };
  await client.callTool({ name: "nyxa_propose_action", arguments: { proposal } });
  const events = await readAuditEvents(dataDir);
  const readEvent = events.find((e) => e.tool === "nyxa_propose_action" && e.affected_resource?.includes("does-not-need-to-exist"));
  assert.ok(readEvent);
  assert.equal("epistemic_classification" in readEvent, false, "E0 must never have run for a pure read");
  assert.equal(requiresEpistemicAssessment({ capabilityClass: "I0", executionRisk: "none", writesAuthoritativeMemory: false, requiresHumanApproval: false }), false);
});

// ---- K. E0 internal failure -> consequential action fails closed / HELD, no effect ----
test("K: an internal E0 failure fails closed (HELD), never silently ALLOW", () => {
  const throwingTriage = () => { throw new Error("simulated internal E0 failure"); };
  const assessment = assessEpistemicStateSafely(
    "claim-1", "statement", [{ tag: "FACT", statement: "x", source: "y" }], 0,
    { capabilityClass: "I1", executionRisk: "medium", writesAuthoritativeMemory: true, requiresHumanApproval: true },
    undefined,
    throwingTriage
  );
  assert.equal(assessment.ran, true);
  assert.equal(assessment.held, true);
  assert.equal(assessment.failed, true);
});

// ---- L. E0 internal failure on irrelevant pure read -> read remains available ----
test("L: a pure read is structurally never exposed to E0 failure at all", () => {
  // requiresEpistemicAssessment gates BEFORE assessEpistemicStateSafely would ever call the
  // (possibly-throwing) triage function -- assessEpistemicStateSafely's own first branch
  // returns {ran:false} without invoking triageFn, so a pure read's dispatch path never reaches
  // code that could throw for E0 reasons at all.
  const throwingTriage = () => { throw new Error("should never be called for a pure read"); };
  const assessment = assessEpistemicStateSafely(
    "claim-1", "statement", [{ tag: "FACT", statement: "x", source: "y" }], 0,
    { capabilityClass: "I0", executionRisk: "none", writesAuthoritativeMemory: false, requiresHumanApproval: false },
    undefined,
    throwingTriage
  );
  assert.equal(assessment.ran, false, "pure reads must bypass E0 before any triage call, throwing or not");
});


// ---- M. Real signal extraction: stale evidence is derived from claim.asOf, not caller score ----
test("M: stale evidence is deterministically derived from claim timestamp", () => {
  const now = Date.parse("2026-09-12T16:00:00.000Z");
  const input = deriveE0ClaimInput(
    [{ tag: "EXTERNAL_EVIDENCE", statement: "old observation", source: "sensor-A", asOf: "2026-09-10T16:00:00.000Z" }],
    0,
    { capabilityClass: "I1", executionRisk: "medium", writesAuthoritativeMemory: true, requiresHumanApproval: false },
    "stale-1", "test stale evidence", now
  );
  assert.equal(input.evidence_stale, true);
  const result = e0Triage(input);
  assert.equal(result.classification, "KNOWN_UNKNOWN");
  assert.ok(result.reasons.includes("stale_evidence"));
});

// ---- N. Real signal extraction: unavailable source markers cannot masquerade as evidence ----
test("N: unavailable evidence marker is derived and remains epistemically unresolved", () => {
  const input = deriveE0ClaimInput(
    [{ tag: "HYPOTHESIS", statement: "unverified possibility", source: "unavailable" }],
    0,
    { capabilityClass: "I1", executionRisk: "medium", writesAuthoritativeMemory: true, requiresHumanApproval: false },
    "unavailable-1", "test unavailable evidence"
  );
  assert.equal(input.evidence_unavailable, true);
  const result = e0Triage(input);
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("unavailable_evidence"));
});

// ---- O/P. Trusted current-state context: system observation, never caller self-report ----
test("O: trusted candidate context marks current state observable and binds provenance", () => {
  const base = { claim_id: "ctx", statement: "candidate state", evidence_strength: 0.8, provenance_quality: 0.8, impact_score: 0.8 };
  const candidate = { id: "candidate-1", content: "x", candidate_type: "observation", source: "agent", scope: "project", purpose: "test", confidence: 0.8, importance: 0.5, status: "pending", createdAt: new Date().toISOString(), writtenAt: new Date().toISOString(), writtenBy: "Jo", taskId: "t", runId: "r" };
  const enriched = applyTrustedEpistemicContext(base, { target_candidate: candidate, target_candidate_observable: true });
  assert.equal(enriched.current_state_observable, true);
  assert.ok(enriched.provenance_refs.includes("candidate:candidate-1:pending"));
});

test("P: trusted lookup miss makes current state unobservable/unverifiable", () => {
  const base = { claim_id: "ctx-miss", statement: "candidate state", evidence_strength: 0.8, provenance_quality: 0.8, impact_score: 0.8 };
  const enriched = applyTrustedEpistemicContext(base, { target_candidate_observable: false });
  const result = e0Triage(enriched);
  assert.equal(result.classification, "UNKNOWN");
  assert.ok(result.reasons.includes("unobservable_current_state"));
  assert.ok(result.reasons.includes("unverifiable_claim"));
});

test("Q: explicit contradiction between independent sources triggers depth drill and HOLD", () => {
  const claims = [
    {
      tag: "FACT",
      statement: "The proposed effect is safe.",
      source: "independent-source-A"
    },
    {
      tag: "FACT",
      statement: "The proposed effect is not safe.",
      source: "independent-source-B"
    }
  ];

  const input = deriveE0ClaimInput(
    claims,
    0.2,
    { risk: "medium", requiresHumanApproval: false, authoritative: false },
    "contradiction-regression",
    "The proposed effect is safe"
  );

  const result = e0Triage(input);

  assert.equal(input.contradiction_score, 1);
  assert.equal(input.disagreement_score, 1);
  assert.equal(result.trigger_depth_drill, true);
  assert.equal(shouldEpistemicHold(result), true);
});
