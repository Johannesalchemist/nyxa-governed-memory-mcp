// Real end-to-end regression coverage for the governance E2E milestone: an actual I1 mutation
// through the normal proposal/dispatcher path with independently-verified real effect, replay
// protection, a registered-tool ESCALATE path, authority revocation, and scope/symlink
// enforcement for the new nyxa_e2e_write_scratch / nyxa_e2e_escalate_scratch test fixtures
// (see TOOL_POLICIES and NyxaGovernedMemoryServer.executeE2EScratchWrite in src/server.ts).
// Every case spawns the REAL compiled dist/index.js as its own process -- no reimplemented
// governance, no mocked gamma.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome, cleanupAll } from "./helpers/isolated-e2e-env.mjs";

const RUNTIME = resolve(".");

// Every isolated HOME created by this file is tracked here and cleaned up once,
// deterministically, after all tests complete (set NYXA_TEST_PRESERVE_ISOLATED_HOME=1
// to preserve them for post-mortem instead).
const isolatedHomes = [];
after(() => cleanupAll(isolatedHomes));

async function spawnServer({ mode = "observe_only" } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-gov-e2e-data-"));
  const scratchRoot = await mkdtemp(join(tmpdir(), "nyxa-gov-e2e-scratch-"));
  const home = await createIsolatedE2EHome();
  isolatedHomes.push(home);
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd: RUNTIME,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: home.homeDir,
      LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir,
      NYXA_E2E_SCRATCH_ROOT: scratchRoot,
      NYXA_AGENT_MODE: mode
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "nyxa-governance-e2e-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, dataDir, scratchRoot };
}

function parse(result) {
  return JSON.parse(result.content[0].text);
}

function baseProposal(overrides = {}) {
  return {
    actor: "governance-e2e-test",
    action: "nyxa_e2e_write_scratch",
    target: "scratch:/counter.txt",
    scope: "governance e2e regression",
    claims: [{ tag: "FACT", statement: "probe", source: "governance-e2e-test" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "gov-e2e", runId: "run-1", requestingIdentity: "Jo" },
    ...overrides
  };
}

async function readCounter(scratchRoot, name = "counter.txt") {
  try {
    return (await readFile(join(scratchRoot, name), "utf8")).trim();
  } catch {
    return undefined;
  }
}

test("1: I1 ALLOW through the real dispatcher produces a real, independently verified effect", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  assert.equal(await readCounter(scratchRoot), undefined, "counter file must not exist before any mutation");
  const res = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } }));
  assert.equal(res.policy_decision, "ALLOW");
  assert.equal(res.result.previous_counter, 0);
  assert.equal(res.result.new_counter, 1);
  assert.equal(await readCounter(scratchRoot), "1", "the actual file on disk must independently show the mutation");

  // The successful I1 effect must carry operational evidence from the
  // effect producer, and that exact evidence must survive the governance
  // audit path into evidence.latest.
  assert.equal(res.result.evidence.status, "SUPPORTED");
  assert.equal(res.result.evidence.trust, "VERIFIED_SOURCE");
  assert.equal(res.result.evidence.gamma, "SUPPORTED");
  assert.equal(
    res.result.evidence.implementation,
    "NyxaGovernedMemoryServer.executeE2EScratchWrite"
  );

  const evidenceView = parse(await client.callTool({
    name: "evidence.latest",
    arguments: { limit: 50 }
  }));

  const writeEvidence = evidenceView.entries.find(
    (entry) =>
      entry.tool === "nyxa_propose_action" &&
      entry.evidence?.implementation ===
        "NyxaGovernedMemoryServer.executeE2EScratchWrite"
  );

  assert.ok(
    writeEvidence,
    "successful governed scratch write must persist operational evidence"
  );
  assert.equal(writeEvidence.evidence.status, "SUPPORTED");
  assert.equal(writeEvidence.evidence.trust, "VERIFIED_SOURCE");
  assert.equal(writeEvidence.evidence.gamma, "SUPPORTED");
  assert.equal(
    writeEvidence.evidence.observations.includes(
      "scratch counter changed from 0 to 1"
    ),
    true
  );

  // Evidence metadata must not become a second copy of effect payload data.
  assert.equal(
    Object.hasOwn(writeEvidence.evidence, "path"),
    false,
    "persisted evidence must not contain the scratch filesystem path"
  );
});

test("2: identical replay of an executed proposal is denied and produces no second effect", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  const first = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } }));
  assert.equal(first.policy_decision, "ALLOW");
  assert.equal(await readCounter(scratchRoot), "1");

  const replay = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } }));
  assert.equal(replay.policy_decision, "DENY");
  assert.equal(replay.domain, "REPLAY");
  assert.equal(replay.reason, "already_executed");
  assert.equal(await readCounter(scratchRoot), "1", "counter must still read 1, not 2 -- no second effect");
});

test("2b: a genuinely new taskId/runId is not treated as a replay (legitimate retry still works)", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } });
  const second = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ provenance: { taskId: "gov-e2e", runId: "run-2", requestingIdentity: "Jo" } }) }
  }));
  assert.equal(second.policy_decision, "ALLOW");
  assert.equal(second.result.new_counter, 2, "a distinct dedup identity must be able to execute again");
  assert.equal(await readCounter(scratchRoot), "2");
});

test("3/4: ESCALATE via an actually-registered tool through the real dispatcher produces no effect", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        action: "nyxa_e2e_escalate_scratch",
        target: "scratch:/escalate-counter.txt",
        provenance: { taskId: "gov-e2e-escalate", runId: "run-1", requestingIdentity: "Jo" }
      })
    }
  }));
  assert.equal(res.policy_decision, "ESCALATE");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_approval_required");
  assert.equal(await readCounter(scratchRoot, "escalate-counter.txt"), undefined, "escalate must never reach the execution handler");
});

test("5: revoked test authority (back to default observe_only) denies the same mutation, file unchanged", async (context) => {
  // First establish a real ALLOWed mutation under draft, then reconnect as a fresh process
  // (simulating authority revocation) without draft, against the SAME scratch root.
  const { client: elevated, scratchRoot } = await spawnServer({ mode: "draft" });
  await elevated.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } });
  await elevated.close();
  assert.equal(await readCounter(scratchRoot), "1");

  const dataDir2 = await mkdtemp(join(tmpdir(), "nyxa-gov-e2e-data-"));
  const home2 = await createIsolatedE2EHome();
  isolatedHomes.push(home2);
  const transport2 = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd: RUNTIME,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: home2.homeDir, LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir2, NYXA_E2E_SCRATCH_ROOT: scratchRoot
      // NYXA_AGENT_MODE intentionally omitted -- defaults to observe_only, i.e. revoked.
    },
    stderr: "pipe"
  });
  const revoked = new Client({ name: "nyxa-governance-e2e-revoked", version: "0.1.0" });
  await revoked.connect(transport2);
  context.after(async () => revoked.close());

  const res = parse(await revoked.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ provenance: { taskId: "gov-e2e-revoked", runId: "run-1", requestingIdentity: "Jo" } }) }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "mode_below_minimum");
  assert.equal(await readCounter(scratchRoot), "1", "revoked authority must not be able to mutate the file again");
});

test("6: scope traversal against the scratch tool is denied at C1, no effect", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ target: "scratch:/../outside.txt" }) }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C1");
});

test("7: symlink escape inside the scratch root is denied, target outside untouched", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());
  const outside = await mkdtemp(join(tmpdir(), "nyxa-gov-e2e-outside-"));
  const outsideFile = join(outside, "real.txt");
  await writeFile(outsideFile, "untouched", "utf8");
  await symlink(outsideFile, join(scratchRoot, "evil.txt"));

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ target: "scratch:/evil.txt" }) }
  }));
  assert.equal(res.error?.code, "symlink_escape_denied");
  assert.equal(await readFile(outsideFile, "utf8"), "untouched", "the real file behind the symlink must never be written");
  await rm(outside, { recursive: true, force: true });
});

test("8: I2 remains non-executable without a server-resolved mandate even when C2 is satisfied", async (context) => {
  const { client } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        action: "nyxa_self_model_write_identity",
        target: "self-model:/identity",
        requestedCapabilityClass: "I2",
        estimatedIrreversibility: "I2",
        provenance: { taskId: "gov-e2e-i2", runId: "run-1", requestingIdentity: "Jo" },
        payload: { fields: {} }
      })
    }
  }));
  assert.equal(res.policy_decision, "ESCALATE");
  assert.equal(res.domain, "C3");
  assert.equal(res.reason, "capability_class_I2_requires_mandate");
});

test("9: UNKNOWN tool produces no effect and is distinguishable from ALLOW/DENY", async (context) => {
  const { client, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ action: "nyxa_totally_fake_tool" }) }
  }));
  assert.equal(res.policy_decision, "UNKNOWN");
  assert.equal(await readCounter(scratchRoot), undefined);
});

test("9b: unknown Effect Radius ESCALATES at C5 through real MCP proposal path, executes no mutation, and is audited", async (context) => {
  const { client, dataDir, scratchRoot } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  assert.equal(await readCounter(scratchRoot), undefined);
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        action: "nyxa_apply_patch",
        target: "dev:/synthetic-effect-radius-probe.ts",
        provenance: { taskId: "gov-e2e-effect-radius", runId: "run-1", requestingIdentity: "Jo" },
        payload: { patch: "*** synthetic probe only; must never execute ***" }
      })
    }
  }));

  assert.equal(res.policy_decision, "ESCALATE");
  assert.equal(res.domain, "C5");
  assert.equal(res.reason, "effect_radius_unknown_requires_human_review");
  assert.equal(await readCounter(scratchRoot), undefined, "C5 escalation must not execute any scratch mutation");

  const raw = await readFile(join(dataDir, "audit.log.jsonl"), "utf8");
  const events = raw.trim().split("\n").map((l) => JSON.parse(l));
  const event = events.find((e) =>
    e.tool === "nyxa_propose_action" &&
    e.gamma_outcome === "ESCALATE" &&
    e.gamma_domain === "C5" &&
    e.gamma_reason === "effect_radius_unknown_requires_human_review"
  );
  assert.ok(event, "the C5 Effect Radius escalation must be present in the audit log");
  assert.equal(event.result, "blocked");
});

test("10: audit correlation -- ALLOW, replay-DENY and ESCALATE each produce one correctly-chained, valid audit entry", async (context) => {
  const { client, dataDir } = await spawnServer({ mode: "draft" });
  context.after(async () => client.close());

  await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } });
  await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: baseProposal() } }); // replay
  await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        action: "nyxa_e2e_escalate_scratch",
        target: "scratch:/escalate-counter.txt",
        provenance: { taskId: "gov-e2e-escalate", runId: "run-1", requestingIdentity: "Jo" }
      })
    }
  });

  const { AuditLog } = await import("../dist/audit/AuditLog.js");
  const audit = new AuditLog(dataDir);
  await audit.init();
  const integrity = await audit.verifyIntegrity();
  assert.equal(integrity.valid, true);

  const raw = await readFile(join(dataDir, "audit.log.jsonl"), "utf8");
  const lines = raw.trim().split("\n").map((l) => JSON.parse(l));
  const proposeEvents = lines.filter((e) => e.tool === "nyxa_propose_action");
  assert.ok(proposeEvents.some((e) => e.gamma_outcome === "ALLOW" && e.result === "allowed"));
  assert.ok(proposeEvents.some((e) => e.result_status?.startsWith("REPLAY:") && e.result === "blocked"));
  assert.ok(proposeEvents.some((e) => e.gamma_outcome === "ESCALATE" && e.gamma_domain === "C2"));
});
