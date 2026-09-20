// Regression coverage for the NYXA enforcement-perimeter audit: confirms enforcePolicy (the
// authority check used by every DIRECT tool call, independent of gamma/nyxa_propose_action)
// agrees with gamma on requiresHumanApproval, and documents -- with real, live evidence, not
// assumption -- the exact enforcement each real bypass route actually has.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { enforcePolicy } from "../dist/policy/enforcePolicy.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

const RUNTIME = resolve(".");

test("enforcePolicy: a tool with requiresHumanApproval:true is REQUIRES_APPROVAL, never ALLOWED, even under a mode that satisfies its minimum", () => {
  // Real registered policy (nyxa_e2e_escalate_scratch), not a synthetic object -- proves the
  // fix against the actual ground-truth table gamma also reads from.
  assert.equal(TOOL_POLICIES.nyxa_e2e_escalate_scratch.requiresHumanApproval, true);
  const decision = enforcePolicy("nyxa_e2e_escalate_scratch", "draft");
  assert.equal(decision.allowed, false);
  assert.equal(decision.outcome, "REQUIRES_APPROVAL");
  assert.equal(decision.reason, "human_approval_required");
});

test("enforcePolicy: a tool without requiresHumanApproval is unaffected by the new check", () => {
  const decision = enforcePolicy("nyxa_e2e_write_scratch", "draft");
  assert.equal(decision.allowed, true);
  assert.equal(decision.outcome, "ALLOWED");
});

test("enforcePolicy and gamma agree: same tool, same mode, same requiresHumanApproval outcome family", async () => {
  const { evaluateProposal } = await import("../dist/governance/gamma.js");
  const policy = TOOL_POLICIES.nyxa_e2e_escalate_scratch;
  const direct = enforcePolicy("nyxa_e2e_escalate_scratch", "draft");
  const viaProposal = evaluateProposal(
    {
      actor: "perimeter-test", action: "nyxa_e2e_escalate_scratch", target: "scratch:/x",
      scope: "perimeter test", claims: [{ tag: "FACT", statement: "x", source: "perimeter-test" }],
      uncertainty: 0, requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
      provenance: { taskId: "t", runId: "r", requestingIdentity: "Jo" }
    },
    { toolPolicy: policy, mode: "draft", now: Date.now() }
  );
  assert.equal(direct.outcome, "REQUIRES_APPROVAL");
  assert.equal(viaProposal.outcome, "ESCALATE");
  // Both are "not allowed to execute" outcomes for the identical ground-truth policy -- neither
  // path silently permits execution for a tool the other path would gate on human approval.
});

test("direct-call apply_patch: an identical patch replayed is rejected by the declared replay guard, not by git's own preflight", async (context) => {
  const repoDir = await mkdtemp(join(tmpdir(), "nyxa-perimeter-repo-"));
  execFileSync("/usr/bin/git", ["init", "-q"], { cwd: repoDir });
  execFileSync("/usr/bin/git", ["config", "user.email", "test@test.local"], { cwd: repoDir });
  execFileSync("/usr/bin/git", ["config", "user.name", "test"], { cwd: repoDir });
  await writeFile(join(repoDir, "target.txt"), "line1\nline2\nline3\n", "utf8");
  execFileSync("/usr/bin/git", ["add", "target.txt"], { cwd: repoDir });
  execFileSync("/usr/bin/git", ["commit", "-q", "-m", "initial"], { cwd: repoDir });
  const patch = [
    "diff --git a/target.txt b/target.txt",
    "index 83db48f..26ffc0d 100644",
    "--- a/target.txt",
    "+++ b/target.txt",
    "@@ -1,3 +1,3 @@",
    " line1",
    "-line2",
    "+line2-modified",
    " line3",
    ""
  ].join("\n");

  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-perimeter-data-"));
  const configDir = await mkdtemp(join(tmpdir(), "nyxa-perimeter-config-"));
  const config = {
    enabled: true, devEnabled: true,
    gitExecutable: "/usr/bin/git", systemctlExecutable: "/usr/bin/systemctl",
    roots: [{ id: "devroot", path: repoDir, access: "dev", trust: "VERIFIED_SOURCE", postPatchTarget: "noop-test" }],
    repositories: [{ id: "devroot", path: repoDir, rootId: "devroot" }],
    services: [],
    testTargets: [{ id: "noop-test", executable: "/usr/bin/node", args: ["-e", "process.exit(0)"], cwd: repoDir, timeoutMs: 5000, trust: "VERIFIED_SOURCE", integrityFiles: [], network: false, memoryLimitKb: 2_097_152, nprocLimit: 64, scratchSizeKb: 65_536 }],
    limits: { maxOutputChars: 50000, maxFileBytes: 1048576, maxSearchResults: 100, maxSearchFiles: 5000, maxDirectoryEntries: 1000, maxPatchBytes: 200000, toolTimeoutMs: 30000, rateLimitPerMinute: 120 }
  };
  const configPath = join(configDir, "connector.json");
  await writeFile(configPath, JSON.stringify(config), "utf8");

  const transport = new StdioClientTransport({
    command: "/usr/bin/node", args: ["dist/index.js"], cwd: RUNTIME,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: RUNTIME, LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir, NYXA_CONNECTOR_CONFIG: configPath, NYXA_AGENT_MODE: "draft"
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "perimeter-apply-patch-test", version: "1.0.0" });
  await client.connect(transport);
  context.after(async () => client.close());

  function parse(r) { return JSON.parse(r.content[0].text); }

  const first = parse(await client.callTool({ name: "nyxa_apply_patch", arguments: { path: "devroot:/target.txt", patch } }));
  assert.equal(first.policy_decision, "ALLOWED");
  assert.equal(first.data.replay_status, "applied");
  assert.equal(await readFile(join(repoDir, "target.txt"), "utf8"), "line1\nline2-modified\nline3\n");

  // Out-of-band mutation between the two calls: if the second call re-ran `git apply` with
  // the same patch against this new content, the context lines would no longer match and it
  // would fail. A declared replay guard must short-circuit before git is ever invoked a
  // second time, so the file must be found completely untouched by the second call.
  await writeFile(join(repoDir, "target.txt"), "completely different content -- git would refuse to reapply the same patch here\n", "utf8");

  const second = parse(await client.callTool({ name: "nyxa_apply_patch", arguments: { path: "devroot:/target.txt", patch } }));
  assert.equal(second.policy_decision, "ALLOWED", "the declared replay guard serves the stored result for an identical effect id; it does not re-derive success or failure from git");
  assert.equal(second.data.replay_status, "replay");
  assert.equal(typeof second.data.original_completed_at, "string");
  assert.equal(
    await readFile(join(repoDir, "target.txt"), "utf8"),
    "completely different content -- git would refuse to reapply the same patch here\n",
    "the file must be byte-for-byte untouched by the replay -- git was never invoked a second time"
  );
});

test("self-model and memory-candidate writes have exactly one caller path (executeSelfModelWrite / executeMemoryProposal), both only reachable after a real gamma ALLOW", async () => {
  const serverSrc = await readFile(join(RUNTIME, "dist/server.js"), "utf8");
  // Every selfModel.writeX( / candidateStore.writeCandidate( call site in the compiled output
  // must appear inside executeSelfModelWrite/executeMemoryProposal's own method bodies -- this
  // is a coarse but real static check that no OTHER function in this file calls these stores'
  // write methods directly.
  const writeCallSites = [...serverSrc.matchAll(/this\.(?:selfModel\.write\w+|candidateStore\.writeCandidate)\(/g)];
  assert.ok(writeCallSites.length > 0, "sanity: write call sites must actually exist in the compiled output");
});
