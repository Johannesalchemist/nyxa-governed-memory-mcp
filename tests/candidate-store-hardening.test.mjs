import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, link, symlink, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CandidateStore } from "../dist/memory/candidateStore.js";

const ALLOW = { outcome: "ALLOW", reason: "isolated test fixture" };
const DENY = { outcome: "DENY", reason: "test" };
const META = { writtenBy: "test", taskId: "task-1", runId: "run-1" };
const input = content => ({
  content, candidate_type: "dream_summary", source: "dream", scope: "project",
  purpose: "candidate-store hardening test", confidence: 0.5, importance: 0.3
});
async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-candidate-hardening-"));
  const store = new CandidateStore(dir);
  await store.init();
  return { store, dir, file: join(dir, "memory", "candidates.jsonl") };
}
async function corruptFirst(file) {
  const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
  const obj = JSON.parse(lines[0]);
  obj.content = "tampered";
  lines[0] = JSON.stringify(obj);
  await writeFile(file, lines.join("\n") + "\n");
  return obj;
}

test("A: failed promotion does not poison the queue", async () => {
  const { store } = await freshStore();
  const a = await store.writeCandidate(input("a"), META, ALLOW);
  const original = store.readLines.bind(store);
  store.readLines = async () => { throw new Error("injected_failure"); };
  try {
    await assert.rejects(store.promoteCandidate(a.id, META, ALLOW), /injected_failure/);
  } finally {
    store.readLines = original;
  }
  const b = await store.writeCandidate(input("b"), META, ALLOW);
  assert.equal(b.status, "pending");
  const promoted = await store.promoteCandidate(a.id, META, ALLOW);
  assert.equal(promoted.status, "promoted");
});

test("B: valid JSON with invalid hash fails closed on reads", async () => {
  const { store, file } = await freshStore();
  await store.writeCandidate(input("original"), META, ALLOW);
  await store.writeCandidate(input("second"), META, ALLOW);
  const obj = await corruptFirst(file);
  await assert.rejects(store.recallCandidates({ limit: 10 }), { code: "candidate_chain_invalid" });
  await assert.rejects(store.getLatestCandidate(obj.id), { code: "candidate_chain_invalid" });
});

test("C: truncated-to-empty store cannot masquerade as empty", async () => {
  const { store, file } = await freshStore();
  await store.writeCandidate(input("x"), META, ALLOW);
  await writeFile(file, "");
  await assert.rejects(store.recallCandidates({ limit: 10 }), { code: "candidate_chain_changed" });
});

test("D: 20 concurrent writes form a valid chain across restart", async () => {
  const { store, dir } = await freshStore();
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.writeCandidate(input("c" + i), META, ALLOW)));
  assert.equal((await store.recallCandidates({ limit: 50 })).length, 20);
  const restarted = new CandidateStore(dir);
  await restarted.init();
  assert.equal((await restarted.writeCandidate(input("after-restart"), META, ALLOW)).status, "pending");
});

test("E: init rejects pre-existing manipulated records", async () => {
  const { store, dir, file } = await freshStore();
  await store.writeCandidate(input("intact"), META, ALLOW);
  await corruptFirst(file);
  const restarted = new CandidateStore(dir);
  await assert.rejects(restarted.init(), { code: "candidate_chain_invalid" });
});

test("F: malformed and truncated JSONL fail with explicit errors", async () => {
  const { store, file } = await freshStore();
  await store.writeCandidate(input("x"), META, ALLOW);
  await writeFile(file, "{invalid-json}\n");
  await assert.rejects(store.recallCandidates({ limit: 2 }), { code: "candidate_chain_invalid" });
  await writeFile(file, "{");
  await assert.rejects(store.recallCandidates({ limit: 2 }), { code: "candidate_chain_truncated" });
});

test("G: ALL writing paths verify the disk hash before append", async () => {
  const { store, file } = await freshStore();
  const candidate = await store.writeCandidate(input("x"), META, ALLOW);
  await corruptFirst(file);
  await assert.rejects(store.writeCandidate(input("y"), META, ALLOW), { code: "candidate_chain_invalid" });
  await assert.rejects(store.promoteCandidate(candidate.id, META, ALLOW), { code: "candidate_chain_invalid" });
});

test("H: hardlink and symlink files are refused", async () => {
  for (const variant of ["hardlink", "symlink"]) {
    const { store, file } = await freshStore();
    await store.writeCandidate(input("x"), META, ALLOW);
    if (variant === "hardlink") await link(file, file + ".alias");
    else { await rename(file, file + ".saved"); await symlink(file + ".saved", file); }
    await assert.rejects(store.recallCandidates({ limit: 2 }));
    await assert.rejects(store.writeCandidate(input("y"), META, ALLOW));
  }
});

test("I: append failure before any bytes leaves queue recoverable", async () => {
  const { store } = await freshStore();
  const original = store.openVerifiedAppend.bind(store);
  store.openVerifiedAppend = async () => {
    const handle = await original();
    handle.appendFile = async () => { throw new Error("write_failed_before_append"); };
    return handle;
  };
  await assert.rejects(store.writeCandidate(input("fail"), META, ALLOW), /write_failed_before_append/);
  store.openVerifiedAppend = original;
  const record = await store.writeCandidate(input("retry"), META, ALLOW);
  assert.equal(record.status, "pending");
  assert.equal((await store.recallCandidates({ limit: 10 })).length, 1);
});

test("J: partial append leaves instance fail closed with no automatic retry", async () => {
  const { store } = await freshStore();
  const original = store.openVerifiedAppend.bind(store);
  store.openVerifiedAppend = async () => {
    const handle = await original();
    const append = handle.appendFile.bind(handle);
    handle.appendFile = async (data, encoding) => {
      await append(data.slice(0, 20), encoding);
      throw new Error("injected_partial_append");
    };
    return handle;
  };
  await assert.rejects(store.writeCandidate(input("partial"), META, ALLOW), {
    code: "candidate_commit_uncertain"
  });
  store.openVerifiedAppend = original;
  await assert.rejects(store.writeCandidate(input("next"), META, ALLOW), {
    code: "candidate_commit_uncertain"
  });
  await assert.rejects(store.recallCandidates({ limit: 5 }), {
    code: "candidate_commit_uncertain"
  });
});

test("K: status filter returns latest state, never obsolete pending", async () => {
  const { store } = await freshStore();
  const first = await store.writeCandidate(input("x"), META, ALLOW);
  await store.promoteCandidate(first.id, META, ALLOW);
  assert.equal((await store.recallCandidates({ limit: 10, status: "pending" })).length, 0);
  const current = await store.recallCandidates({ limit: 10, status: "promoted" });
  assert.equal(current.length, 1);
  assert.equal(current[0].id, first.id);
});

test("L: denied governance cannot cause any write or promotion", async () => {
  const { store, file } = await freshStore();
  await assert.rejects(store.writeCandidate(input("denied"), META, DENY));
  const a = await store.writeCandidate(input("allowed"), META, ALLOW);
  const before = await readFile(file, "utf8");
  await assert.rejects(store.promoteCandidate(a.id, META, DENY));
  assert.equal(await readFile(file, "utf8"), before);
});

test("M: missing file after init is not treated as empty", async () => {
  const { store, file } = await freshStore();
  await unlink(file);
  await assert.rejects(store.recallCandidates({ limit: 5 }), { code: "candidate_store_unreadable" });
});

test("N: rejected promote target does not stall subsequent valid write", async () => {
  const { store } = await freshStore();
  await assert.rejects(store.promoteCandidate("non-existent", META, ALLOW), {
    code: "candidate_not_found"
  });
  const saved = await store.writeCandidate(input("new"), META, ALLOW);
  assert.equal(saved.status, "pending");
});
