import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome, cleanupAll } from "./helpers/isolated-e2e-env.mjs";

const RUNTIME = resolve(".");
const homes = [];

async function spawn() {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-gate-data-"));
  const scratchRoot = await mkdtemp(join(tmpdir(), "nyxa-gate-scratch-"));
  const home = await createIsolatedE2EHome();
  homes.push(home);
  const transport = new StdioClientTransport({
    command: "/usr/bin/node",
    args: ["dist/index.js"],
    cwd: RUNTIME,
    env: { PATH: process.env.PATH, HOME: home.homeDir, LANG: "C.UTF-8", NYXA_DATA_DIR: dataDir, NYXA_E2E_SCRATCH_ROOT: scratchRoot, NYXA_AGENT_MODE: "draft" },
    stderr: "pipe"
  });
  const client = new Client({ name: "execution-gate-e2e", version: "0.1.0" });
  await client.connect(transport);
  return { client, scratchRoot };
}function proposal(i, target = `scratch:/burst-${i}.txt`) {
  return {
    actor: "instinct-agent",
    action: "nyxa_e2e_write_scratch",
    target,
    scope: "execution gate e2e",
    claims: [{ tag: "FACT", statement: "probe", source: "execution-gate-e2e" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "gate-e2e", runId: String(i), requestingIdentity: "Jo" }
  };
}

function parse(result) { return JSON.parse(result.content[0].text); }

async function readMaybe(path) {
  try { return await readFile(path, "utf8"); } catch { return undefined; }
}

test("burst: first ten real effects succeed, eleventh is blocked before handler", async (t) => {
  const { client, scratchRoot } = await spawn();
  t.after(async () => { await client.close(); await cleanupAll(homes); });
  for (let i = 0; i < 10; i++) {
    const result = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: proposal(i) } }));
    assert.equal(result.policy_decision, "ALLOW", `effect ${i} should be allowed`);
    assert.equal(await readMaybe(join(scratchRoot, `burst-${i}.txt`)), "1");
  }
  const blocked = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: proposal(10) } }));
  assert.equal(blocked.policy_decision, "DENY");
  assert.equal(blocked.domain, "EXECUTION_GATE");
  assert.equal(blocked.reason, "actor_action_rate_exceeded");
  assert.equal(await readMaybe(join(scratchRoot, "burst-10.txt")), undefined);
});test("external I1 target escalates without authority and cannot reach scratch handler", async (t) => {
  const { client, scratchRoot } = await spawn();
  t.after(async () => { await client.close(); });
  const result = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: proposal("external", "email:alice@example.invalid") }
  }));
  assert.equal(result.policy_decision, "ESCALATE");
  assert.equal(result.domain, "EXECUTION_GATE");
  assert.equal(result.reason, "external_authority_required");
  assert.equal(await readMaybe(join(scratchRoot, "book")), undefined);
});