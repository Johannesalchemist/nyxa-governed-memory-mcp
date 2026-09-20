// Step 11: isolated E2E proof for the first real human-authority/grant production-shaped
// capability (nyxa_memory_promote_candidate, gated by governance/humanGrant.ts). Every case
// spawns the REAL compiled dist/index.js -- no reimplemented governance, no mocked gamma, no
// mocked grant store. Uses the isolated-HOME helper fixed in Step 9 for every spawned instance.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createIsolatedE2EHome, cleanupAll } from "./helpers/isolated-e2e-env.mjs";

const RUNTIME = resolve(".");
const TOKEN = "step11-test-token-do-not-use-in-production";
const isolatedHomes = [];
after(() => cleanupAll(isolatedHomes));

async function spawnServer({ mode = "draft", token = TOKEN } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-step11-data-"));
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
  const client = new Client({ name: "nyxa-step11-human-authority-test", version: "0.1.0" });
  await client.connect(transport);
  return { client, dataDir, transport };
}

function parse(result) { return JSON.parse(result.content[0].text); }

function baseProposal(overrides = {}) {
  return {
    actor: "step11-test",
    action: "nyxa_memory_promote_candidate",
    target: "memory-candidate:/PLACEHOLDER",
    scope: "step11 human-authority E2E",
    claims: [{ tag: "FACT", statement: "step11 probe", source: "step11-test" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "step11", runId: "run-1", requestingIdentity: "Jo" },
    ...overrides
  };
}

async function storeCandidate(client, overrides = {}) {
  const proposal = {
    actor: "step11-test",
    action: "nyxa_memory_store_candidate",
    target: "memory:/candidate",
    scope: "step11 fixture setup",
    claims: [{ tag: "FACT", statement: "fixture", source: "step11-test" }],
    uncertainty: 0,
    requestedCapabilityClass: "I1",
    estimatedIrreversibility: "I1",
    provenance: { taskId: "step11-setup", runId: `run-${Math.random()}`, requestingIdentity: "Jo" },
    payload: {
      content: "step11 candidate fixture",
      candidate_type: "observation",
      source: "agent",
      scope: "project",
      purpose: "step11 human-authority E2E fixture",
      confidence: 0.9,
      importance: 0.5
    },
    ...overrides
  };
  const res = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal } }));
  assert.equal(res.policy_decision, "ALLOW", "fixture candidate creation must succeed");
  return res.result.id;
}

async function issueGrant(client, { capability = "nyxa_memory_promote_candidate", targetId, token = TOKEN, ttlSeconds } = {}) {
  const args = { token, capability, target_id: targetId };
  if (ttlSeconds !== undefined) args.ttl_seconds = ttlSeconds;
  const res = await client.callTool({ name: "nyxa_human_grant_issue", arguments: args });
  return { raw: res, parsed: JSON.parse(res.content[0].text) };
}

async function readCandidatesJsonl(dataDir) {
  const raw = await readFile(join(dataDir, "memory", "candidates.jsonl"), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ---- A. NO APPROVAL ----
test("A: no approval presented -> ESCALATE, no effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ target: `memory-candidate:/${candidateId}` }) }
  }));
  assert.equal(res.policy_decision, "ESCALATE");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_approval_required");

  const lines = await readCandidatesJsonl(dataDir);
  const latest = lines.filter((l) => l.id === candidateId).at(-1);
  assert.equal(latest.status, "pending", "no effect: candidate must remain pending");
});

// ---- B. VALID HUMAN APPROVAL ----
test("B: valid human approval -> ALLOW, real effect exactly once", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  const grant = await issueGrant(client, { targetId: candidateId });
  assert.ok(!grant.raw.isError, "grant issuance with a correct token must succeed");
  assert.ok(grant.parsed.grant_id, "issuance must return a real grantId");
  assert.deepEqual(grant.parsed.issued_by, { authorityPrincipalId: "human:jo", authorityMethod: "operator-token" });

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } }
      })
    }
  }));
  assert.equal(res.policy_decision, "ALLOW");
  assert.equal(res.result.status, "promoted");

  // Independently inspect the resulting authoritative object/state directly on disk.
  const lines = await readCandidatesJsonl(dataDir);
  const forThisId = lines.filter((l) => l.id === candidateId);
  assert.equal(forThisId.length, 2, "exactly one new line appended: original pending + one promoted");
  assert.equal(forThisId.at(-1).status, "promoted");
  assert.equal(forThisId[0].status, "pending", "original pending line must still exist, untouched -- reversible/recoverable");
});

// ---- C. REPLAY ----
test("C: replay of the exact same approved execution -> DENY/REPLAY, no second effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);
  const grant = await issueGrant(client, { targetId: candidateId });

  const proposal = baseProposal({
    target: `memory-candidate:/${candidateId}`,
    payload: { humanGrant: { grantId: grant.parsed.grant_id } }
  });
  const first = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal } }));
  assert.equal(first.policy_decision, "ALLOW");

  // Exact same proposal (same taskId/runId AND same grantId) replayed. Caught by the
  // grant-level check (already_consumed) inside gamma's own C2 evaluation, one step earlier in
  // the pipeline than the pre-existing taskId/runId ReplayGuard (which only runs after gamma
  // has already ALLOWed) -- proven separately, deliberately, in C2 below with a genuinely
  // different taskId/runId so the two protections are shown to be independent, not the same
  // mechanism catching this by coincidence.
  const replay = parse(await client.callTool({ name: "nyxa_propose_action", arguments: { proposal } }));
  assert.equal(replay.policy_decision, "DENY");
  assert.equal(replay.domain, "C2");
  assert.equal(replay.reason, "human_grant_already_consumed");

  const lines = await readCandidatesJsonl(dataDir);
  const forThisId = lines.filter((l) => l.id === candidateId);
  assert.equal(forThisId.length, 2, "still exactly one promotion -- no second effect");
});

test("C2: replay via a genuinely new taskId/runId but the SAME already-consumed grantId -> DENY, no second effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);
  const grant = await issueGrant(client, { targetId: candidateId });

  const first = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } }
      })
    }
  }));
  assert.equal(first.policy_decision, "ALLOW");

  // Different taskId/runId -- the pre-existing ReplayGuard alone would NOT catch this. The
  // grant-level replay protection (already_consumed) must catch it independently.
  const second = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } },
        provenance: { taskId: "step11-c2", runId: "run-2", requestingIdentity: "Jo" }
      })
    }
  }));
  assert.equal(second.policy_decision, "DENY");
  assert.equal(second.domain, "C2");
  assert.equal(second.reason, "human_grant_already_consumed", "grant-level replay protection, independent of taskId/runId");

  const lines = await readCandidatesJsonl(dataDir);
  const forThisId = lines.filter((l) => l.id === candidateId);
  assert.equal(forThisId.length, 2, "still exactly one promotion -- no second effect from the grant-level replay attempt");
});

// ---- D. WRONG TARGET ----
test("D: valid grant for candidate A used against candidate B -> DENY, no effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateA = await storeCandidate(client);
  const candidateB = await storeCandidate(client);
  const grantForA = await issueGrant(client, { targetId: candidateA });

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateB}`,
        payload: { humanGrant: { grantId: grantForA.parsed.grant_id } }
      })
    }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_grant_target_mismatch");

  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.filter((l) => l.id === candidateB).at(-1).status, "pending");
  assert.equal(lines.filter((l) => l.id === candidateA).at(-1).status, "pending", "the grant's own real target must also remain untouched");
});

// ---- E. WRONG CAPABILITY ----
test("E: grant scoped to the promote capability reused for a different capability -> DENY, no effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);
  const grant = await issueGrant(client, { targetId: candidateId });

  // Reuse the SAME grantId, but for the pre-existing E2E escalate fixture (a different
  // requiresHumanApproval tool) targeting the same underlying id shape.
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        action: "nyxa_e2e_escalate_scratch",
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } }
      })
    }
  }));
  // nyxa_e2e_escalate_scratch never reads proposal.payload.humanGrant at all (only
  // nyxa_memory_promote_candidate's dispatch path in server.ts computes a humanGrant context),
  // so this must fall through to the ordinary, unconditional ESCALATE every other
  // requiresHumanApproval tool has always had -- proving the grant mechanism is genuinely
  // scoped to the one capability it was built for, not a generic bypass.
  assert.equal(res.policy_decision, "ESCALATE");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_approval_required");

  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.filter((l) => l.id === candidateId).at(-1).status, "pending");
});

test("E2: an INVALID/forged grantId presented against the real capability+target -> DENY (capability mismatch path proven separately below)", async (context) => {
  // Direct proof of the capability_mismatch branch itself: issue a grant, then reuse it with a
  // deliberately wrong `capability` field is not possible from outside (issuance always records
  // the true capability string from the request) -- so this proves the adjacent, symmetric
  // case: a syntactically-shaped but never-issued grantId is rejected as invalid, not silently
  // treated as valid.
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: "00000000-0000-0000-0000-000000000000" } }
      })
    }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_grant_invalid");
  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.filter((l) => l.id === candidateId).at(-1).status, "pending");
});

// ---- F. EXPIRED / INVALID GRANT ----
test("F: expired grant -> DENY (fail-closed), no effect", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);
  const grant = await issueGrant(client, { targetId: candidateId, ttlSeconds: 1 });

  await new Promise((r) => setTimeout(r, 1500));

  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } }
      })
    }
  }));
  assert.equal(res.policy_decision, "DENY");
  assert.equal(res.domain, "C2");
  assert.equal(res.reason, "human_grant_expired");
  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.filter((l) => l.id === candidateId).at(-1).status, "pending");
});

test("F2: grant issuance itself fails closed without the correct token", async (context) => {
  const { client } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  const wrongToken = await client.callTool({
    name: "nyxa_human_grant_issue",
    arguments: { token: "wrong-token", capability: "nyxa_memory_promote_candidate", target_id: candidateId }
  });
  const wrongParsed = JSON.parse(wrongToken.content[0].text);
  assert.equal(wrongParsed.error, "invalid_token");
});

test("F3: grant issuance is unconditionally inert with no token configured at all (default production posture)", async (context) => {
  const { client } = await spawnServer({ token: null }); // null, not undefined -- a default param only applies on undefined
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  const res = await client.callTool({
    name: "nyxa_human_grant_issue",
    arguments: { token: "anything-at-all", capability: "nyxa_memory_promote_candidate", target_id: candidateId }
  });
  const parsed = JSON.parse(res.content[0].text);
  assert.equal(parsed.error, "human_authority_token_not_configured");
});

// ---- G. BYPASS ----
test("G: direct call to the underlying promote tool, bypassing proposal/approval -> unreachable", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);

  let reached = true;
  let errorMessage = "";
  try {
    await client.callTool({ name: "nyxa_memory_promote_candidate", arguments: { target_id: candidateId } });
  } catch (error) {
    reached = false;
    errorMessage = String(error?.message ?? error);
  }
  assert.equal(reached, false, "nyxa_memory_promote_candidate must not be a directly-callable tool");
  assert.match(errorMessage, /Unknown tool/i);

  const lines = await readCandidatesJsonl(dataDir);
  assert.equal(lines.filter((l) => l.id === candidateId).at(-1).status, "pending");
});

// ---- H. CRASH/RESTART ----
test("H: grant consumption and candidate promotion both survive a process restart -- cannot be replayed after restart", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nyxa-step11-restart-data-"));
  const home1 = await createIsolatedE2EHome();
  isolatedHomes.push(home1);
  const transport1 = new StdioClientTransport({
    command: "/usr/bin/node", args: ["dist/index.js"], cwd: RUNTIME,
    env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: home1.homeDir, LANG: "C.UTF-8", NYXA_DATA_DIR: dataDir, NYXA_AGENT_MODE: "draft", NYXA_HUMAN_AUTHORITY_TOKEN: TOKEN },
    stderr: "pipe"
  });
  const client1 = new Client({ name: "nyxa-step11-restart-1", version: "0.1.0" });
  await client1.connect(transport1);

  const candidateId = await storeCandidate(client1);
  const grant = await issueGrant(client1, { targetId: candidateId });
  const first = parse(await client1.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ target: `memory-candidate:/${candidateId}`, payload: { humanGrant: { grantId: grant.parsed.grant_id } } }) }
  }));
  assert.equal(first.policy_decision, "ALLOW");
  await client1.close();

  // Fresh process, same NYXA_DATA_DIR -- simulates a crash/restart.
  const home2 = await createIsolatedE2EHome();
  isolatedHomes.push(home2);
  const transport2 = new StdioClientTransport({
    command: "/usr/bin/node", args: ["dist/index.js"], cwd: RUNTIME,
    env: { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", HOME: home2.homeDir, LANG: "C.UTF-8", NYXA_DATA_DIR: dataDir, NYXA_AGENT_MODE: "draft", NYXA_HUMAN_AUTHORITY_TOKEN: TOKEN },
    stderr: "pipe"
  });
  const client2 = new Client({ name: "nyxa-step11-restart-2", version: "0.1.0" });
  await client2.connect(transport2);

  const replay = parse(await client2.callTool({
    name: "nyxa_propose_action",
    arguments: {
      proposal: baseProposal({
        target: `memory-candidate:/${candidateId}`,
        payload: { humanGrant: { grantId: grant.parsed.grant_id } },
        provenance: { taskId: "step11-h-restart", runId: "run-2", requestingIdentity: "Jo" }
      })
    }
  }));
  assert.equal(replay.policy_decision, "DENY");
  assert.equal(replay.reason, "human_grant_already_consumed", "grant consumption marker survived the restart on disk");

  const lines = await readCandidatesJsonl(dataDir);
  const forThisId = lines.filter((l) => l.id === candidateId);
  assert.equal(forThisId.length, 2, "still exactly one promotion across the restart");
  await client2.close();
});

// ---- Phase 11.6: audit ----
test("AUDIT: chain integrity + every distinct layer present and correlated for the ALLOW case", async (context) => {
  const { client, dataDir } = await spawnServer();
  context.after(async () => client.close());
  const candidateId = await storeCandidate(client);
  const grant = await issueGrant(client, { targetId: candidateId });
  const res = parse(await client.callTool({
    name: "nyxa_propose_action",
    arguments: { proposal: baseProposal({ target: `memory-candidate:/${candidateId}`, payload: { humanGrant: { grantId: grant.parsed.grant_id } } }) }
  }));
  assert.equal(res.policy_decision, "ALLOW");

  const { AuditLog } = await import("../dist/audit/AuditLog.js");
  const audit = new AuditLog(dataDir);
  await audit.init();
  const integrity = await audit.verifyIntegrity();
  assert.equal(integrity.valid, true);

  const raw = await readFile(join(dataDir, "audit.log.jsonl"), "utf8");
  const events = raw.trim().split("\n").map((l) => JSON.parse(l));
  const promoteEvent = events.find((e) => e.affected_resource?.includes(candidateId) && e.result === "allowed");
  assert.ok(promoteEvent, "the ALLOW event for this candidate must be present in the audit chain");
  assert.equal(promoteEvent.gamma_outcome, "ALLOW");
  assert.equal(promoteEvent.policy_decision, "ALLOWED");
  assert.equal(promoteEvent.human_grant_status, "valid");
  assert.equal(promoteEvent.human_grant_id, grant.parsed.grant_id);
  assert.equal(promoteEvent.result, "allowed");
  assert.equal(promoteEvent.result_status, "success");

  const grantIssueEvent = events.find((e) => e.tool === "nyxa_human_grant_issue" && e.result === "allowed");
  assert.ok(grantIssueEvent, "the grant issuance itself must be present in the audit chain");
});
