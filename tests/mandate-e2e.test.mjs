import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome } from "./helpers/isolated-e2e-env.mjs";

const TOKEN = "mandate-test-secret";
const parse = (r) => JSON.parse(r.content[0].text);
async function maybe(path) { try { return await readFile(path, "utf8"); } catch { return undefined; } }

async function spawn() {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-mandate-data-"));
  const scratch = await mkdtemp(join(tmpdir(), "nyxa-mandate-scratch-"));
  const home = await createIsolatedE2EHome();
  const transport = new StdioClientTransport({ command: "/usr/bin/node", args: [".tmp-mandate-dist/index.js"], cwd: resolve("."),
    env: { PATH: process.env.PATH, HOME: home.homeDir, LANG: "C.UTF-8", NYXA_DATA_DIR: dataDir, NYXA_E2E_SCRATCH_ROOT: scratch, NYXA_AGENT_MODE: "draft", NYXA_HUMAN_AUTHORITY_TOKEN: TOKEN }, stderr: "pipe" });
  const client = new Client({ name: "mandate-e2e", version: "0.1.0" });
  await client.connect(transport);
  return { client, scratch };
}
function proposal(runId, target) {
  return { actor: "mail-agent", action: "nyxa_e2e_write_scratch", target, scope: "crm/campaign-42",
    claims: [{ tag: "FACT", statement: "mandate probe", source: "mandate-e2e" }], uncertainty: 0,
    requestedCapabilityClass: "I1", estimatedIrreversibility: "I1",
    provenance: { taskId: "mandate-e2e", runId, requestingIdentity: "Jo" } };
}

test("mandate allows bounded effect, revocation immediately stops later effects", async (t) => {
  const { client, scratch } = await spawn();
  t.after(async () => client.close());
  const issued = parse(await client.callTool({ name: "nyxa_mandate_issue", arguments: {
    token: TOKEN, actor: "mail-agent", action: "nyxa_e2e_write_scratch", scope_prefix: "crm/",
    target_prefix: "email:", ttl_seconds: 3600, max_executions_per_window: 5, max_effect_units_per_window: 5
  }}));
  const mandateId = issued.mandate.mandateId;
  assert.ok(mandateId);

  const allowed = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: proposal("1", "email:first@example.invalid") } }));
  assert.equal(allowed.policy_decision, "ALLOW");
  assert.equal(await maybe(join(scratch, "email:first@example.invalid")), "1");
  const revoked = parse(await client.callTool({ name: "nyxa_mandate_revoke", arguments: { token: TOKEN, mandate_id: mandateId, reason: "test_revocation" } }));
  assert.equal(revoked.revoked, true);

  const stopped = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: proposal("2", "email:second@example.invalid") } }));
  assert.equal(stopped.policy_decision, "ESCALATE");
  assert.equal(stopped.domain, "EXECUTION_GATE");
  assert.equal(stopped.reason, "external_authority_required");
  assert.equal(await maybe(join(scratch, "email:second@example.invalid")), undefined);

  const listed = parse(await client.callTool({ name: "nyxa_mandate_list", arguments: {} }));
  const item = listed.mandates.find((m) => m.mandateId === mandateId);
  assert.equal(item.revoked, true);
  assert.equal(item.active, false);
});

function i2Proposal(runId) {
  return { actor: "identity-admin", action: "nyxa_self_model_write_identity", target: "self-model:/identity", scope: "self-model/identity",
    claims: [{ tag: "FACT", statement: "operator delegated identity update", source: "mandate-e2e" }], uncertainty: 0,
    requestedCapabilityClass: "I2", estimatedIrreversibility: "I2",
    provenance: { taskId: "mandate-i2", runId, requestingIdentity: "Jo" }, payload: { name: "NYXA Mandate Probe", version: "test", purpose: "prove governed I2 reachability", deployment: "isolated-e2e" } };
}

test("I2 capability is preserved: no mandate escalates, exact mandate reaches executor", async (t) => {
  const { client } = await spawn(); t.after(async () => client.close());
  const before = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: i2Proposal("before") } }));
  assert.equal(before.policy_decision, "ESCALATE");
  assert.equal(before.reason, "capability_class_I2_requires_mandate");
  const issued = parse(await client.callTool({ name: "nyxa_mandate_issue", arguments: { token: TOKEN, actor: "identity-admin", action: "nyxa_self_model_write_identity", scope_prefix: "self-model/identity", target_prefix: "self-model:/identity", ttl_seconds: 3600, max_executions_per_window: 1, max_effect_units_per_window: 1 } }));
  assert.ok(issued.mandate.mandateId);
  const after = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal: i2Proposal("after") } }));
  assert.equal(after.policy_decision, "ALLOW");
  assert.equal(after.proposed_action, "nyxa_self_model_write_identity");
});
