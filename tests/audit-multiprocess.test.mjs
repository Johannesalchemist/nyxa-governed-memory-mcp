// Real multi-process regression test for the cross-process AuditLog lock. Runs against
// the compiled ../dist/audit/AuditLog.js exclusively via genuinely separate OS processes
// (tests/helpers/audit-concurrency-worker.mjs) -- the race this guards against only
// exists across process boundaries, so a same-process/mocked test would not catch a
// regression here.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER = fileURLToPath(new URL("./helpers/audit-concurrency-worker.mjs", import.meta.url));

function runWorker(dataDir, processId, count) {
  // spawn() itself is synchronous (the child starts immediately); only the returned
  // Promise resolves later. Callers that invoke runWorker() in a tight loop and only
  // then await Promise.all(...) get genuinely concurrent process starts, not a
  // serialized await-one-then-the-next sequence.
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, dataDir, String(processId), String(count)], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`worker ${processId} exited with code ${code}: ${stderr}`));
    });
  });
}

test("multi-process: N independent OS processes appending concurrently to the same audit file produce a complete, valid chain", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "nyxa-audit-mp-"));
  const PROCESS_COUNT = 5;
  const EVENTS_PER_PROCESS = 15;
  const TOTAL_EVENTS = PROCESS_COUNT * EVENTS_PER_PROCESS;

  try {
    const runs = [];
    for (let p = 0; p < PROCESS_COUNT; p += 1) {
      runs.push(runWorker(dataDir, p, EVENTS_PER_PROCESS));
    }
    await Promise.all(runs);

    const { AuditLog } = await import("../dist/audit/AuditLog.js");
    const audit = new AuditLog(dataDir);
    await audit.init();
    const integrity = await audit.verifyIntegrity();

    assert.equal(integrity.valid, true, `chain must be valid after concurrent writers, got: ${JSON.stringify(integrity)}`);
    assert.equal(integrity.checked, TOTAL_EVENTS, "verifyIntegrity must have checked exactly every written event");

    const raw = readFileSync(join(dataDir, "audit.log.jsonl"), "utf8");
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    assert.equal(lines.length, TOTAL_EVENTS, "no lost and no extra lines in the file");
    assert.equal(existsSync(join(dataDir, "audit.log.jsonl.lock")), false, "lock file must not be left behind after all writers finish");

    const seenIds = new Set();
    for (const line of lines) {
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(line);
      }, "every line must be well-formed JSON, not malformed/truncated by an interleaved write");
      assert.equal(seenIds.has(parsed.id), false, `event id ${parsed.id} must appear exactly once, not duplicated`);
      seenIds.add(parsed.id);
    }
    assert.equal(seenIds.size, TOTAL_EVENTS, "every one of the events written by every process must be present exactly once");

    for (let p = 0; p < PROCESS_COUNT; p += 1) {
      for (let i = 0; i < EVENTS_PER_PROCESS; i += 1) {
        assert.equal(seenIds.has(`p${p}-e${i}`), true, `event p${p}-e${i} must not have been lost`);
      }
    }
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("adversarial: a stale lock file (simulated crashed holder) is reclaimed, not blocked on forever", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "nyxa-audit-stale-"));
  try {
    const { AuditLog } = await import("../dist/audit/AuditLog.js");
    const seed = new AuditLog(dataDir);
    await seed.init();
    await seed.append({
      id: "seed-1",
      timestamp: new Date().toISOString(),
      actor: "test",
      action: "seed",
      tool: "seed",
      mode: "observe_only",
      backend: "test",
      result: "allowed"
    });

    const lockPath = join(dataDir, "audit.log.jsonl.lock");
    const { writeFileSync, utimesSync } = await import("node:fs");
    writeFileSync(lockPath, "999999:0", { mode: 0o600 });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lockPath, old, old);

    const writer = new AuditLog(dataDir);
    await writer.init();
    const start = Date.now();
    await writer.append({
      id: "after-stale-lock",
      timestamp: new Date().toISOString(),
      actor: "test",
      action: "after-stale-lock",
      tool: "after-stale-lock",
      mode: "observe_only",
      backend: "test",
      result: "allowed"
    });
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 10_000, `stale-lock reclaim must not wait for the full acquire timeout, took ${elapsedMs}ms`);

    const integrity = await writer.verifyIntegrity();
    assert.equal(integrity.valid, true);
    assert.equal(integrity.checked, 2);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("adversarial: a valid pre-existing chain stays valid after a fresh append following heavy concurrent writes", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "nyxa-audit-postmp-"));
  try {
    const runs = [runWorker(dataDir, 0, 5), runWorker(dataDir, 1, 5), runWorker(dataDir, 2, 5)];
    await Promise.all(runs);

    const { AuditLog } = await import("../dist/audit/AuditLog.js");
    const audit = new AuditLog(dataDir);
    await audit.init();
    await audit.append({
      id: "final-after-stress",
      timestamp: new Date().toISOString(),
      actor: "test",
      action: "final-after-stress",
      tool: "final-after-stress",
      mode: "observe_only",
      backend: "test",
      result: "allowed"
    });
    const integrity = await audit.verifyIntegrity();
    assert.equal(integrity.valid, true);
    assert.equal(integrity.checked, 16);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
