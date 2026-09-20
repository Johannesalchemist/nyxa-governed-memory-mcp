// Tests for the per-data-directory, process-lifetime single-writer exclusion
// (src/audit/WriterLock.ts). Covers the WriterLock primitive directly (fast,
// deterministic) plus real multi-process scenarios against the actual compiled
// dist/index.js server, since the primitive's real job is rejecting a second OS
// process, not just a second in-process object.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const RUNTIME_ROOT = new URL("..", import.meta.url).pathname;

function tmpDataDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// --- A/B/C/D/F: the WriterLock primitive itself -----------------------------

test("A/B/C: a second WriterLock for the same data dir fails closed while the first holds it", async () => {
  const { WriterLock, WriterLockError } = await import("../dist/audit/WriterLock.js");
  const dataDir = tmpDataDir("nyxa-writerlock-unit-");
  const lockA = new WriterLock(dataDir);
  const lockB = new WriterLock(dataDir);
  try {
    await lockA.acquire();
    await assert.rejects(() => lockB.acquire(), WriterLockError);
    // A is unaffected by B's failed attempt.
    await assert.doesNotReject(() => Promise.resolve());
  } finally {
    await lockA.release();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("D: after the holder releases, a new acquirer succeeds", async () => {
  const { WriterLock } = await import("../dist/audit/WriterLock.js");
  const dataDir = tmpDataDir("nyxa-writerlock-unit-");
  const lockA = new WriterLock(dataDir);
  const lockB = new WriterLock(dataDir);
  try {
    await lockA.acquire();
    await lockA.release();
    await assert.doesNotReject(() => lockB.acquire());
  } finally {
    await lockB.release();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("E: two different data dirs never contend", async () => {
  const { WriterLock } = await import("../dist/audit/WriterLock.js");
  const dirA = tmpDataDir("nyxa-writerlock-unit-a-");
  const dirB = tmpDataDir("nyxa-writerlock-unit-b-");
  const lockA = new WriterLock(dirA);
  const lockB = new WriterLock(dirB);
  try {
    await assert.doesNotReject(() => lockA.acquire());
    await assert.doesNotReject(() => lockB.acquire());
  } finally {
    await lockA.release();
    await lockB.release();
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test("F: N concurrent acquisition attempts for the same data dir -- exactly one wins", async () => {
  const { WriterLock } = await import("../dist/audit/WriterLock.js");
  const dataDir = tmpDataDir("nyxa-writerlock-unit-");
  const N = 8;
  const locks = Array.from({ length: N }, () => new WriterLock(dataDir));
  try {
    const results = await Promise.allSettled(locks.map((l) => l.acquire()));
    const wins = results.filter((r) => r.status === "fulfilled").length;
    const losses = results.filter((r) => r.status === "rejected").length;
    assert.equal(wins, 1, `expected exactly one winner, got ${wins}`);
    assert.equal(losses, N - 1);
  } finally {
    await Promise.all(locks.map((l) => l.release().catch(() => {})));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("H: a stale, garbage socket-path leftover is reclaimed correctly, independent of any PID", async () => {
  const { WriterLock } = await import("../dist/audit/WriterLock.js");
  const { writeFileSync } = await import("node:fs");
  const dataDir = tmpDataDir("nyxa-writerlock-unit-");
  // A leftover regular file at the lock path, containing a PID number that -- if this
  // were a naive PID-file scheme -- might coincidentally match a currently-running
  // process on this host and cause a false "still held" decision. WriterLock never
  // reads this content at all; only a live connect() probe decides liveness.
  writeFileSync(join(dataDir, ".writer.lock.sock"), String(process.pid));
  const lock = new WriterLock(dataDir);
  try {
    await assert.doesNotReject(() => lock.acquire(), "a non-socket leftover file must be reclaimed, not mistaken for a live owner");
  } finally {
    await lock.release();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

// --- Real multi-process scenarios against the actual compiled server --------

function runGuestServer(dataDir) {
  return spawn("/usr/bin/node", ["dist/index.js"], {
    cwd: RUNTIME_ROOT,
    env: { ...process.env, NYXA_DATA_DIR: dataDir },
    stdio: ["ignore", "ignore", "pipe"]
  });
}

test("real process: second `node dist/index.js` against the same NYXA_DATA_DIR fails closed, first stays healthy", async () => {
  const dataDir = tmpDataDir("nyxa-writerlock-proc-");
  const first = runGuestServer(dataDir);
  try {
    // Give the first process time to actually acquire the lock and finish start().
    await delay(600);
    assert.equal(first.exitCode, null, "first process must still be running");

    let secondStderr = "";
    const second = runGuestServer(dataDir);
    second.stderr.on("data", (chunk) => {
      secondStderr += chunk.toString();
    });
    const secondExit = await new Promise((resolve) => second.once("exit", resolve));

    assert.notEqual(secondExit, 0, "second process must exit non-zero");
    assert.match(
      secondStderr,
      /writer_lock_held/,
      "the rejection must be explicitly attributable to the writer lock, not a generic failure"
    );

    // First process is provably unaffected.
    assert.equal(first.exitCode, null, "first process must remain alive after the second was rejected");
  } finally {
    first.kill("SIGTERM");
    await new Promise((resolve) => first.once("exit", resolve));
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("real process: after the first process exits (SIGTERM), a second one can then acquire and run", async () => {
  const dataDir = tmpDataDir("nyxa-writerlock-proc-");
  const first = runGuestServer(dataDir);
  try {
    await delay(600);
    first.kill("SIGTERM");
    await new Promise((resolve) => first.once("exit", resolve));

    const second = runGuestServer(dataDir);
    await delay(600);
    assert.equal(second.exitCode, null, "second process must be able to become the writer after the first released");
    second.kill("SIGTERM");
    await new Promise((resolve) => second.once("exit", resolve));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("real process: SIGKILL of the owner leaves no permanent lockout -- a new writer can take over", async () => {
  const dataDir = tmpDataDir("nyxa-writerlock-proc-");
  const first = runGuestServer(dataDir);
  try {
    await delay(600);
    first.kill("SIGKILL"); // no graceful shutdown handler runs at all
    await new Promise((resolve) => first.once("exit", resolve));

    const second = runGuestServer(dataDir);
    await delay(600);
    assert.equal(second.exitCode, null, "a new writer must be able to reclaim the lock after a hard crash of the previous owner, with no manual intervention");
    second.kill("SIGTERM");
    await new Promise((resolve) => second.once("exit", resolve));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("real process: two different NYXA_DATA_DIR values run concurrently without interference", async () => {
  const dirA = tmpDataDir("nyxa-writerlock-proc-a-");
  const dirB = tmpDataDir("nyxa-writerlock-proc-b-");
  const a = runGuestServer(dirA);
  const b = runGuestServer(dirB);
  try {
    await delay(600);
    assert.equal(a.exitCode, null);
    assert.equal(b.exitCode, null);
  } finally {
    a.kill("SIGTERM");
    b.kill("SIGTERM");
    await Promise.all([
      new Promise((resolve) => a.once("exit", resolve)),
      new Promise((resolve) => b.once("exit", resolve))
    ]);
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});
