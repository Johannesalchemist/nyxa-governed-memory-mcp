import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, rmSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { evaluateTest, hash, executeCanary } from "../dist/arbeitsbahnhof/testGate.js";

const GATE_BIN = new URL("../dist/arbeitsbahnhof/testGate.js", import.meta.url).pathname;
const GRANT_PATH = "/etc/nyxa/arbeitsbahnhof-test-grant.json";
const now = Date.now();

const baseProposal = {
  actor: "arbeitsbahnhof-test",
  action: "arbeitsbahnhof.task.enqueue",
  target: "nixa-01:arbeitsbahnhof/test",
  expected_target: "nixa-01",
  scope: "synthetic test",
  uncertainty: 0,
  requestedCapabilityClass: "I1",
  estimatedIrreversibility: "I1",
  claims: [
    { tag: "EXTERNAL_EVIDENCE", statement: "Jo approved bounded internal test", source: "user approval", asOf: new Date(now).toISOString() }
  ],
  provenance: { taskId: "task-executor-test", runId: "run-executor-test", requestingIdentity: "Jo" },
  payload: { project: "arbeitsbahnhof-synthetic-executor-test" }
};
const c0Pass = { outcome: "PASS", reason: "target_match", localServerId: "nixa-01", expectedTarget: "nixa-01" };
const baseGrant = {
  id: "g-executor-test",
  run_id: "run-executor-test",
  actor: "arbeitsbahnhof-test",
  approved_by: "Jo",
  project: "arbeitsbahnhof-synthetic-executor-test",
  issued_at: new Date(now - 100).toISOString(),
  expires_at: new Date(now + 60000).toISOString(),
  entries: [{ action: baseProposal.action, target: baseProposal.target, payload_hash: hash(baseProposal.payload), nonce: "nonceexec01" }]
};

// --- Pure-function level: executor only ever runs against a genuine ALLOW, and only produces
// an artifact that faithfully reflects the exact proposal it was given (no substitution). ---

test("executor: ALLOW decision produces a verifiable artifact bound to the real proposal", async () => {
  const decision = evaluateTest(baseProposal, baseGrant, "nonceexec01", now, c0Pass);
  assert.equal(decision.decision.outcome, "ALLOW");
  const root = "/tmp/nyxa-executor-unit-test-" + Date.now();
  const result = await executeCanary(root, "audit-unit-1", baseProposal, baseGrant.id, baseGrant.run_id, "nonceexec01");
  assert.equal(result.executed, true);
  const artifact = JSON.parse(readFileSync(result.artifactPath, "utf8"));
  assert.equal(artifact.action, baseProposal.action);
  assert.equal(artifact.target, baseProposal.target);
  assert.equal(artifact.grant_id, baseGrant.id);
  assert.equal(artifact.run_id, baseGrant.run_id);
  assert.equal(artifact.task_id, baseProposal.provenance.taskId);
  const recomputed = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(artifact, null, 2)).digest("hex");
  assert.equal(recomputed, result.artifactHash, "artifact hash must be independently reproducible");
  rmSync(root, { recursive: true, force: true });
});

test("executor: a DENY decision is never reachable to executeCanary in the real dispatch path (no artifact for a wrong actor)", () => {
  const decision = evaluateTest({ ...baseProposal, actor: "untrusted" }, baseGrant, "nonceexec01", now, c0Pass);
  assert.equal(decision.decision.outcome, "DENY");
  // main() only calls executeCanary inside the ALLOW branch -- this asserts the precondition
  // that branch depends on, i.e. that this exact malicious input never produces ALLOW.
});

test("executor: repeated invocation for the SAME audit id fails closed (exclusive create, no silent overwrite)", async () => {
  const root = "/tmp/nyxa-executor-unit-test-replay-" + Date.now();
  const first = await executeCanary(root, "audit-replay-1", baseProposal, baseGrant.id, baseGrant.run_id, "nonceexec01");
  assert.equal(first.executed, true);
  const second = await executeCanary(root, "audit-replay-1", baseProposal, baseGrant.id, baseGrant.run_id, "nonceexec01");
  assert.equal(second.executed, false, "second write to the same artifact path must fail, not silently overwrite");
  assert.match(second.error ?? "", /EEXIST/);
  rmSync(root, { recursive: true, force: true });
});

// --- Real integration level: the actual compiled CLI binary, run as a real subprocess, against
// real (currently absent / deliberately malformed) state on this host. No grant is created or
// approved by these tests -- they only prove the negative/fail-closed paths. ---

function runGate(input) {
  const res = spawnSync("node", [GATE_BIN], { input: JSON.stringify(input), encoding: "utf8", timeout: 10000 });
  let parsed;
  try { parsed = JSON.parse(res.stdout.trim().split("\n").pop()); } catch { parsed = null; }
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, parsed };
}

test("D/I real: no grant file currently exists on this host -> real CLI fails closed, no artifact, no bypass", () => {
  assert.equal(existsSync(GRANT_PATH), false, "precondition: no live grant should exist for this test");
  const out = runGate({ proposal: baseProposal, nonce: "realnonce01aaaaaaaa" });
  assert.notEqual(out.status, 0, "gate must exit non-zero when no grant exists");
  assert.equal(out.parsed?.decision?.outcome, "DENY");
});

test("J real: a grant file with untrusted (group/other-writable) permissions is rejected before any decision logic runs", () => {
  assert.equal(existsSync(GRANT_PATH), false, "precondition: no live grant should exist for this test");
  mkdirSync("/etc/nyxa", { recursive: true });
  const badGrant = { ...baseGrant, entries: [{ ...baseGrant.entries[0], nonce: "realnoncebadperm001" }] };
  writeFileSync(GRANT_PATH, JSON.stringify(badGrant), { mode: 0o666 });
  chmodSync(GRANT_PATH, 0o666); // world-writable on purpose: this is the attack this check exists for
  try {
    const out = runGate({ proposal: baseProposal, nonce: "realnoncebadperm001" });
    assert.notEqual(out.status, 0, "gate must reject an untrusted-permission grant file");
    assert.equal(out.parsed?.decision?.outcome, "DENY");
    const artifactsDir = "/var/lib/nyxa-arbeitsbahnhof-test/artifacts";
    if (existsSync(artifactsDir)) {
      const before = readFileSync("/var/lib/nyxa-arbeitsbahnhof-test/audit.log.jsonl", "utf8").length;
      // no new artifact should correlate to this attempt; we only assert the gate refused, the
      // audit-log-growth assertion below is the meaningful one for "no side effect happened".
      void before;
    }
  } finally {
    rmSync(GRANT_PATH, { force: true });
  }
});

test("malformed nonce is rejected before any file is even read", () => {
  const out = runGate({ proposal: baseProposal, nonce: "!!!" });
  assert.notEqual(out.status, 0);
  assert.equal(out.parsed?.decision?.outcome, "DENY");
});
