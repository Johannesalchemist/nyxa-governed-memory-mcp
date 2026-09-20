// Dedicated regression coverage for src/governance/patchReplayGuard.ts.
// Every test uses its own mkdtemp() scratch dataDir -- never a production data directory.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PatchReplayGuard, PatchReplayGuardStorageError } from "../dist/governance/patchReplayGuard.js";

async function freshDataDir() {
  return await mkdtemp(join(tmpdir(), "nyxa-replay-guard-"));
}

/** A pid guaranteed to no longer exist: spawn a real process and let it exit. */
function deadPid() {
  const result = spawnSync("/bin/true", [], {});
  return result.pid;
}

async function writeRawInflight(dataDir, effectId, content) {
  const dir = join(dataDir, "patch-replay-guard");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${effectId}.inflight`), content, "utf8");
}

async function writeRawCompleted(dataDir, effectId, content) {
  const dir = join(dataDir, "patch-replay-guard");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${effectId}.completed`), content, "utf8");
}

test("1. first claim succeeds", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  assert.equal(await guard.claimInFlight(id), true);
});

test("2. concurrent second claim on the same effect id is denied", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  assert.equal(await guard.claimInFlight(id), true);
  assert.equal(await guard.claimInFlight(id), false, "a second, still-fresh, still-live claim must be denied");
});

test("3. successful completion blocks replay", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  assert.equal(await guard.claimInFlight(id), true);
  await guard.commitCompleted(id, { policy_decision: "ALLOWED", data: { marker: "first-run" } });
  await guard.releaseInFlight(id);
  const stored = await guard.checkCompleted(id);
  assert.ok(stored, "a completed effect must be visible to a later check");
});

test("4. stored completed result is returned deterministically", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  await guard.claimInFlight(id);
  const original = { policy_decision: "ALLOWED", data: { backup_id: "xyz", diff: "some diff text" } };
  await guard.commitCompleted(id, original);
  await guard.releaseInFlight(id);
  const first = await guard.checkCompleted(id);
  const second = await guard.checkCompleted(id);
  assert.deepEqual(first.result, original);
  assert.deepEqual(second.result, original);
  assert.equal(first.completedAt, second.completedAt, "repeated reads of the same completed marker must be identical, not re-derived");
});

test("5. failed attempt (release without commit) permits a legitimate retry", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  assert.equal(await guard.claimInFlight(id), true);
  // Simulate applyPatchEffect throwing: no commitCompleted call, just release (the SecureConnector `finally`).
  await guard.releaseInFlight(id);
  assert.equal(await guard.checkCompleted(id), undefined, "a failed attempt must never be recorded as completed");
  assert.equal(await guard.claimInFlight(id), true, "the same effect id must be claimable again after a failed-then-released attempt");
});

test("6. a stale inflight marker (old timestamp + confirmed-dead pid) can be safely reclaimed", async () => {
  const dataDir = await freshDataDir();
  const guard = new PatchReplayGuard(dataDir);
  const id = guard.effectId("repo", "a.txt", "patch-body");
  const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago, well past the 30m staleness window
  await writeRawInflight(dataDir, id, JSON.stringify({ effectId: id, claimedAt: oldTimestamp, pid: deadPid() }));
  assert.equal(await guard.claimInFlight(id), true, "an orphaned, stale, dead-owner marker must be reclaimable -- this is the crash-recovery path");
});

test("7. a fresh inflight marker cannot be reclaimed even if its recorded pid happens to be dead", async () => {
  const dataDir = await freshDataDir();
  const guard = new PatchReplayGuard(dataDir);
  const id = guard.effectId("repo", "a.txt", "patch-body");
  const recentTimestamp = new Date().toISOString();
  await writeRawInflight(dataDir, id, JSON.stringify({ effectId: id, claimedAt: recentTimestamp, pid: deadPid() }));
  assert.equal(
    await guard.claimInFlight(id),
    false,
    "age alone must not be sufficient to reclaim -- a recent marker stays blocking regardless of pid liveness, protecting against races immediately after a legitimate claim"
  );
});

test("8. a malformed inflight marker fails closed and is never reclaimed", async () => {
  const dataDir = await freshDataDir();
  const guard = new PatchReplayGuard(dataDir);
  const id = guard.effectId("repo", "a.txt", "patch-body");
  await writeRawInflight(dataDir, id, "{not valid json");
  assert.equal(await guard.claimInFlight(id), false, "malformed on-disk state must block, never be silently adopted");
  const stillThere = await readFile(join(dataDir, "patch-replay-guard", `${id}.inflight`), "utf8");
  assert.equal(stillThere, "{not valid json", "the malformed marker must be left untouched, not deleted or overwritten");
});

test("9. different path produces a different effect id (no false replay)", () => {
  const guard = new PatchReplayGuard("/unused");
  const a = guard.effectId("repo", "path/one.txt", "same-patch-body");
  const b = guard.effectId("repo", "path/two.txt", "same-patch-body");
  assert.notEqual(a, b);
});

test("10. different patch content produces a different effect id (no false replay)", () => {
  const guard = new PatchReplayGuard("/unused");
  const a = guard.effectId("repo", "same/path.txt", "patch-A");
  const b = guard.effectId("repo", "same/path.txt", "patch-B");
  assert.notEqual(a, b);
});

test("11. crafted delimiter-ambiguity regression: the exact join(' ') collision shape must not collide", () => {
  const guard = new PatchReplayGuard("/unused");
  // Under the old `[repositoryId, relativePath, patch].join(" ")` scheme, both of these
  // produced the identical string "repo a b c".
  const first = guard.effectId("repo", "a", "b c");
  const second = guard.effectId("repo", "a b", "c");
  assert.notEqual(first, second, "structurally different (relativePath, patch) tuples must never share an effect id merely because a naive join happens to concatenate identically");
});

test("12. persistent marker behavior across a fresh instance (process-restart simulation)", async () => {
  const dataDir = await freshDataDir();
  const first = new PatchReplayGuard(dataDir);
  const id = first.effectId("repo", "a.txt", "patch-body");
  await first.claimInFlight(id);
  await first.commitCompleted(id, { policy_decision: "ALLOWED" });
  await first.releaseInFlight(id);

  // A brand-new instance against the SAME dataDir must see exactly the same on-disk state --
  // markers are files, not in-memory state, so this is what "survives a process restart" means.
  const second = new PatchReplayGuard(dataDir);
  const stored = await second.checkCompleted(id);
  assert.ok(stored, "a completed effect must remain visible to a newly constructed guard instance against the same dataDir");
  assert.equal(await second.claimInFlight(id), true, "claiming after a completed effect is not itself blocked -- SecureConnector's own checkCompleted-first short-circuit is what prevents re-mutation, not claimInFlight");
});

test("13. a malformed completed marker fails closed (throws, never silently allows replay or re-mutation)", async () => {
  const dataDir = await freshDataDir();
  const guard = new PatchReplayGuard(dataDir);
  const id = guard.effectId("repo", "a.txt", "patch-body");
  await writeRawCompleted(dataDir, id, "{not valid json");
  await assert.rejects(() => guard.checkCompleted(id), PatchReplayGuardStorageError);
});

test("14. concurrent race using real parallel claims: exactly one winner", async () => {
  const guard = new PatchReplayGuard(await freshDataDir());
  const id = guard.effectId("repo", "a.txt", "patch-body");
  const attempts = await Promise.all(Array.from({ length: 20 }, () => guard.claimInFlight(id)));
  const winners = attempts.filter(Boolean).length;
  assert.equal(winners, 1, `exactly one of 20 truly concurrent identical claims must win, got ${winners}`);
});
