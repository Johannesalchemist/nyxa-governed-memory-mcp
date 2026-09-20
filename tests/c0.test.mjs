import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluateC0 } from "../dist/governance/c0.js";

// This suite exercises governance/c0.ts entirely against temp files via the injectable
// identityPath parameter -- it never reads or writes the real /etc/server-identity.json.

async function withIdentityFile(content, run) {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-c0-test-"));
  const path = join(dir, "server-identity.json");
  if (content !== undefined) {
    await writeFile(path, content, "utf8");
  }
  try {
    await run(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("no expected_target: PASS in compatibility mode, reason target_not_specified", async () => {
  await withIdentityFile(JSON.stringify({ server_id: "nixa-01", server_role: "governance" }), (path) => {
    const decision = evaluateC0(undefined, path);
    assert.equal(decision.outcome, "PASS");
    assert.equal(decision.reason, "target_not_specified");
    assert.equal(decision.expectedTarget, null);
    assert.equal(decision.localServerId, "nixa-01");
  });
});

test("expected_target matches local server_id: PASS, reason target_match", async () => {
  await withIdentityFile(JSON.stringify({ server_id: "nixa-01", server_role: "governance" }), (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "PASS");
    assert.equal(decision.reason, "target_match");
    assert.equal(decision.localServerId, "nixa-01");
    assert.equal(decision.expectedTarget, "nixa-01");
  });
});

test("expected_target mismatches local server_id: DENY, reason target_mismatch", async () => {
  await withIdentityFile(JSON.stringify({ server_id: "nixa-01", server_role: "governance" }), (path) => {
    const decision = evaluateC0("factory-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "target_mismatch");
    assert.equal(decision.localServerId, "nixa-01");
    assert.equal(decision.expectedTarget, "factory-01");
  });
});

// --- TEST 6: identity corruption / invalid identity must never be silently treated as valid ---

test("TEST 6a: identity file does not exist + explicit target -> DENY, not a silent PASS", async () => {
  await withIdentityFile(undefined, (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "local_identity_unavailable");
    assert.equal(decision.localServerId, null);
  });
});

test("TEST 6b: identity file is invalid JSON + explicit target -> DENY, not a silent PASS", async () => {
  await withIdentityFile("{ this is not valid json", (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "local_identity_unavailable");
    assert.equal(decision.localServerId, null);
  });
});

test("TEST 6c: identity file is valid JSON but missing server_id + explicit target -> DENY", async () => {
  await withIdentityFile(JSON.stringify({ server_role: "governance" }), (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "local_identity_unavailable");
    assert.equal(decision.localServerId, null);
  });
});

test("TEST 6d: identity file has empty-string server_id + explicit target -> DENY", async () => {
  await withIdentityFile(JSON.stringify({ server_id: "", server_role: "governance" }), (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "local_identity_unavailable");
  });
});

test("TEST 6e: identity file is a JSON array, not an object + explicit target -> DENY", async () => {
  await withIdentityFile(JSON.stringify(["nixa-01"]), (path) => {
    const decision = evaluateC0("nixa-01", path);
    assert.equal(decision.outcome, "DENY");
    assert.equal(decision.reason, "local_identity_unavailable");
  });
});

test("corrupt identity file, but NO expected_target given -> still PASS (compatibility path is independent of identity validity)", async () => {
  await withIdentityFile("{ not json", (path) => {
    const decision = evaluateC0(undefined, path);
    assert.equal(decision.outcome, "PASS");
    assert.equal(decision.reason, "target_not_specified");
    assert.equal(decision.localServerId, null);
  });
});
