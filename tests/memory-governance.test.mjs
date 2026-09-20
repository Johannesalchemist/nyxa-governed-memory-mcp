import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Phase C: Governed Memory + Dreaming vertical slice -- governance tests A/B/C/E from the task
// spec. Mirrors mcp.integration.test.mjs's real-stdio-client pattern: each test spawns its own
// isolated instance (temp NYXA_DATA_DIR) of the actual compiled server, so these exercise the
// real dispatch path end to end, not mocks. C0 is checked against the real, unmodified
// /etc/server-identity.json (server_id "nixa-01" on this host) -- the same file Phase 1's tests
// use, not a per-test fixture, since C0 intentionally has no test-only override.
//
// Tests D (temporary draft ALLOW against the real running service) and F (restart persistence)
// are deliberately NOT here: they require touching the real production data directory and
// systemd unit, exactly like Phase 1/2A, and are run as one-off live verification instead of
// permanent automated tests that would otherwise need to mutate real service state on every
// `npm test` run.

const cwd = resolve(".");

function parseResult(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.equal(typeof text, "string");
  return JSON.parse(text);
}

async function spawnServer(extraEnv = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-memory-governance-test-"));
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd,
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: cwd,
      LANG: "C.UTF-8",
      NYXA_DATA_DIR: dataDir,
      NYXA_CONNECTOR_CONFIG: join(cwd, "config", "connector.dev.example.json"),
      ...extraEnv
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "memory-governance-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, dataDir };
}

function candidateProposal(overrides = {}) {
  return {
    actor: "test",
    action: "nyxa_memory_store_candidate",
    target: "self-model:memory-candidates",
    scope: "Phase C memory governance test",
    claims: [{ tag: "FACT", statement: "test candidate", source: "memory-governance.test.mjs" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "t-memory-governance", runId: "r1", requestingIdentity: "tester" },
    payload: {
      content: "TEST candidate -- automated governance test, safe to ignore.",
      candidate_type: "observation",
      source: "tool",
      scope: "project",
      purpose: "automated governance test",
      confidence: 0.5,
      importance: 0.5
    },
    ...overrides
  };
}

for (const action of ["nyxa_memory_store_candidate", "nyxa_dream_trigger"]) {
  test(`${action}: correct target and draft still require known effect radius`, async context => {
    const { client } = await spawnServer({ NYXA_AGENT_MODE: "draft" });
    context.after(() => client.close());
    const res = parseResult(await client.callTool({ name: "nyxa_propose_action", arguments: {
      proposal: candidateProposal({ action, expected_target: "nixa-01" })
    }}));
    assert.equal(res.policy_decision, "ESCALATE");
    assert.equal(res.domain, "C5");
    assert.equal(res.reason, "effect_radius_unknown_requires_human_review");
    assert.equal(res.result, undefined);
    const recall = parseResult(await client.callTool({ name: "nyxa_memory_recall_candidates", arguments: { limit: 10 } }));
    assert.equal(recall.candidates.length, 0);
  });
}

test("TEST B: wrong target, even in draft mode -> C0 DENY, gamma never runs, nothing written", async (context) => {
  const { client } = await spawnServer({ NYXA_AGENT_MODE: "draft" });
  context.after(async () => client.close());

  const res = parseResult(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: candidateProposal({ expected_target: "factory-01" }) }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C0");
  assert.equal(res.reason, "target_mismatch");
  assert.equal(res.result, undefined);

  const recall = parseResult(await client.callTool({
    name: "nyxa_memory_recall_candidates",
    arguments: { limit: 10 }
  }));
  assert.equal(recall.candidates.length, 0);
});

test("TEST C: correct target, observe_only (default) -> C0 PASS, gamma DENY at C2, nothing written", async (context) => {
  const { client } = await spawnServer(); // no NYXA_AGENT_MODE set -> observe_only default
  context.after(async () => client.close());

  const res = parseResult(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: candidateProposal({ expected_target: "nixa-01" }) }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "mode_below_minimum");
  assert.equal(res.result, undefined);

  const recall = parseResult(await client.callTool({
    name: "nyxa_memory_recall_candidates",
    arguments: { limit: 10 }
  }));
  assert.equal(recall.candidates.length, 0);
});

test("candidate persistence and MCP recall filters use isolated pre-seeded data", async context => {
  const { client, dataDir } = await spawnServer();
  context.after(() => client.close());
  // Direct store fixture verifies persistence/recall, not MCP mutation authorization.
  const { CandidateStore } = await import("../dist/memory/candidateStore.js");
  const store = new CandidateStore(dataDir);
  await store.init();
  const record = await store.writeCandidate({ ...candidateProposal().payload, candidate_type: "risk" },
    { writtenBy: "tester", taskId: "fixture", runId: "fixture" },
    { outcome: "ALLOW", domain: null, reason: "isolated test fixture" });
  const restarted = new CandidateStore(dataDir);
  await restarted.init();
  assert.equal((await restarted.getLatestCandidate(record.id)).status, "pending");
  const risk = parseResult(await client.callTool({ name: "nyxa_memory_recall_candidates", arguments: { candidate_type: "risk", limit: 10 } }));
  assert.equal(risk.candidates.length, 1);
  assert.equal(risk.candidates[0].id, record.id);
  const other = parseResult(await client.callTool({ name: "nyxa_memory_recall_candidates", arguments: { candidate_type: "decision", limit: 10 } }));
  assert.equal(other.candidates.length, 0);
  const promoted = parseResult(await client.callTool({ name: "nyxa_memory_recall_candidates", arguments: { status: "promoted", limit: 10 } }));
  assert.equal(promoted.candidates.length, 0);
});

test("dream derivation and candidate hash chain remain valid across store restart", async () => {
  const { CandidateStore } = await import("../dist/memory/candidateStore.js");
  const { deriveDreamCandidate } = await import("../dist/memory/dreamTrigger.js");
  const { safeJsonStringify } = await import("../dist/utils/safeJson.js");
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-candidate-chain-test-"));
  const store = new CandidateStore(dataDir);
  await store.init();
  const meta = { writtenBy: "fixture", taskId: "chain", runId: "one" };
  const allowed = { outcome: "ALLOW", domain: null, reason: "isolated module test" };
  await assert.rejects(() => store.writeCandidate(candidateProposal().payload, meta,
    { outcome: "DENY", domain: "C2", reason: "test" }));
  await store.writeCandidate(candidateProposal().payload, meta, allowed);
  const restarted = new CandidateStore(dataDir);
  await restarted.init();
  const dream = await deriveDreamCandidate(
    { recentAutobiographical: async () => [] }, { recent: async () => [] });
  assert.equal(dream.candidate_type, "dream_summary");
  await restarted.writeCandidate(dream, { ...meta, runId: "two" }, allowed);
  const lines = (await readFile(join(dataDir, "memory", "candidates.jsonl"), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.length, 2);
  let previous = "GENESIS";
  for (const { eventHash, ...record } of lines) {
    assert.equal(record.previousEventHash, previous);
    assert.equal(eventHash, createHash("sha256").update(safeJsonStringify(record)).digest("hex"));
    previous = eventHash;
  }
});
