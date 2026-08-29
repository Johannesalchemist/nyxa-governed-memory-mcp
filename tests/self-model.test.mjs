import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SelfModelStore,
  GovernanceRequiredError,
  verifyAutobiographicalClaim,
  checkSelfModelClaim
} from "../dist/self-model/store.js";
import { evaluateProposal } from "../dist/governance/gamma.js";
import { TOOL_POLICIES } from "../dist/policy/toolPolicy.js";

const NOW = Date.parse("2026-08-29T12:00:00.000Z");

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-self-model-"));
  const store = new SelfModelStore(dir);
  await store.init();
  return { store, dir };
}

function baseMeta() {
  return {
    writtenAt: "2026-08-29T12:00:00.000Z",
    writtenBy: "tester",
    taskId: "t1",
    runId: "r1"
  };
}

const ALLOW = { outcome: "ALLOW", domain: null, reason: "allowed" };
const DENY = { outcome: "DENY", domain: "C3", reason: "irreversibility_underestimated" };

test("self-model write is rejected without going through governance (no ungoverned write path exists)", async () => {
  const { store, dir } = await freshStore();
  try {
    await assert.rejects(
      () =>
        store.writePersonality(
          { version: "1", traits: ["curious"], tone: "direct", ...baseMeta() },
          DENY
        ),
      GovernanceRequiredError
    );
    await assert.rejects(
      () =>
        store.writePersonality(
          { version: "1", traits: ["curious"], tone: "direct", ...baseMeta() },
          undefined
        ),
      GovernanceRequiredError
    );
    assert.equal(await store.readPersonality(), null, "rejected write must not persist anything");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("identity write at I2 is unconditionally denied by gamma C3", () => {
  const proposal = {
    actor: "test-actor",
    action: "nyxa_self_model_write_identity",
    target: "self-model:/identity",
    scope: "update identity",
    claims: [{ tag: "CLAIM", statement: "renaming", source: "operator-request" }],
    uncertainty: 0.1,
    requestedCapabilityClass: "I2",
    estimatedIrreversibility: "I2",
    provenance: { taskId: "t1", runId: "r1", requestingIdentity: "tester" }
  };
  const decision = evaluateProposal(proposal, {
    toolPolicy: TOOL_POLICIES["nyxa_self_model_write_identity"],
    mode: "supervised_execute",
    now: NOW
  });
  assert.equal(decision.outcome, "DENY");
  assert.equal(decision.domain, "C3");
  assert.equal(TOOL_POLICIES["nyxa_self_model_write_identity"].capabilityClass, "I2");
});

test("autobiographical event chain links session_start to prior session's last event", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-self-model-continuity-"));
  try {
    const storeA = new SelfModelStore(dir);
    await storeA.init();
    const first = await storeA.recordSystemEvent({
      occurredAt: "2026-08-29T10:00:00.000Z",
      actor: "self",
      eventType: "session_start",
      srmTag: "FACT",
      statement: "process started (session A)",
      source: "server_boot"
    });
    assert.equal(first.previousEventHash, "GENESIS");

    // Simulate a full restart: a brand-new SelfModelStore instance over the same data dir.
    const storeB = new SelfModelStore(dir);
    await storeB.init();
    const second = await storeB.recordSystemEvent({
      occurredAt: "2026-08-29T11:00:00.000Z",
      actor: "self",
      eventType: "session_start",
      srmTag: "FACT",
      statement: "process started (session B)",
      source: "server_boot"
    });
    assert.equal(second.previousEventHash, first.eventHash, "restart must chain onto the prior process's last event");
    assert.equal(second.seq, first.seq + 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyAutobiographicalClaim confirms a real logged event", async () => {
  const { store, dir } = await freshStore();
  try {
    await store.recordSystemEvent({
      occurredAt: "2026-08-29T10:00:00.000Z",
      actor: "self",
      eventType: "session_start",
      srmTag: "FACT",
      statement: "process started (session A)",
      source: "server_boot"
    });
    const log = await store.recentAutobiographical(10);
    const result = verifyAutobiographicalClaim(
      { actor: "self", eventType: "session_start", statement: "process started (session A)" },
      log
    );
    assert.equal(result.status, "SUPPORTED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyAutobiographicalClaim flags a fabricated/absent event as unsupported", async () => {
  const { store, dir } = await freshStore();
  try {
    await store.recordSystemEvent({
      occurredAt: "2026-08-29T10:00:00.000Z",
      actor: "self",
      eventType: "session_start",
      srmTag: "FACT",
      statement: "process started (session A)",
      source: "server_boot"
    });
    const log = await store.recentAutobiographical(10);
    const result = verifyAutobiographicalClaim(
      { actor: "self", eventType: "deployed_to_production", statement: "I deployed myself to production yesterday" },
      log
    );
    assert.equal(result.status, "UNSUPPORTED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("verifyAutobiographicalClaim flags a contradicted event distinctly from an absent one", async () => {
  const { store, dir } = await freshStore();
  try {
    await store.recordSystemEvent({
      occurredAt: "2026-08-29T10:00:00.000Z",
      actor: "human_operator",
      eventType: "config_change",
      srmTag: "FACT",
      statement: "connector config enabled",
      source: "server_boot"
    });
    const log = await store.recentAutobiographical(10);
    // Same event content, but the claim misattributes the actor to "self" instead of the human.
    const misattributed = verifyAutobiographicalClaim(
      { actor: "self", eventType: "config_change", statement: "connector config enabled" },
      log
    );
    assert.equal(misattributed.status, "CONTRADICTED");

    const absent = verifyAutobiographicalClaim(
      { actor: "self", eventType: "config_change", statement: "something that never happened" },
      log
    );
    assert.equal(absent.status, "UNSUPPORTED");
    assert.notEqual(misattributed.status, absent.status, "contradicted and absent must be distinguishable");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("checkSelfModelClaim flags a false capability claim against real TOOL_POLICIES", () => {
  const result = checkSelfModelClaim(
    { toolName: "nyxa_apply_patch", assertedCapabilityClass: "I0" },
    TOOL_POLICIES
  );
  assert.equal(result.consistent, false);
  assert.match(result.reason, /claimed_capability_class_I0_but_actual_is_I1/);
});

test("checkSelfModelClaim confirms a true capability claim", () => {
  const result = checkSelfModelClaim(
    { toolName: "nyxa_read_file", assertedCapabilityClass: "I0", assertedExecutable: true },
    TOOL_POLICIES
  );
  assert.equal(result.consistent, true);
});

test("checkSelfModelClaim rejects a claim that no I2/I3 tool is executable, when correctly claimed non-executable", () => {
  // nyxa_self_model_write_identity is I2 -> never executable through the governed path.
  const result = checkSelfModelClaim(
    { toolName: "nyxa_self_model_write_identity", assertedExecutable: false },
    TOOL_POLICIES
  );
  assert.equal(result.consistent, true);
});

test("current_state write is I1-governed and produces a change-history record distinct from the autobiographical log", async () => {
  const { store, dir } = await freshStore();
  try {
    await store.writeCurrentState(
      { mode: "observe_only", activeSessionId: "s1", ...baseMeta() },
      ALLOW
    );
    const history = await store.readChangeHistory(10);
    const auto = await store.recentAutobiographical(10);
    assert.equal(history.length, 1);
    assert.equal(history[0].domain, "current_state");
    assert.equal(auto.length, 0, "a state write must not itself create an autobiographical entry");
    assert.equal(TOOL_POLICIES["nyxa_self_model_write_current_state"].capabilityClass, "I1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("self-model claim is stored with srmTag CLAIM or MODEL_OUTPUT, never FACT", async () => {
  const { store, dir } = await freshStore();
  try {
    await store.writeSelfModel(
      {
        srmTag: "MODEL_OUTPUT",
        description: "I am the nyxa-governed-memory-mcp server, an MCP-compatible governance layer.",
        knownLimitations: ["cannot execute shell commands"],
        ...baseMeta()
      },
      ALLOW
    );
    const record = await store.readSelfModel();
    assert.ok(record);
    assert.match(record.srmTag, /^(CLAIM|MODEL_OUTPUT)$/);

    // The schema itself must reject FACT for this domain -- not just convention.
    await assert.rejects(() =>
      store.writeSelfModel(
        { srmTag: "FACT", description: "x", knownLimitations: [], ...baseMeta() },
        ALLOW
      )
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
