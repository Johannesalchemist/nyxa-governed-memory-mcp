import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LearningEvidenceStore } from "../dist/cognitive/learningEvidenceStore.js";

const meta = {
  writtenBy: "test",
  taskId: "task-1",
  runId: "run-1"
};

function contribution(id, role, source, modelId, promptHash) {
  return {
    id,
    role,
    origin: "AI",
    claims: [{
      tag: "EXTERNAL_EVIDENCE",
      statement: `evidence-${id}`,
      source
    }],
    modelId,
    promptHash,
    parentIds: []
  };
}

test("missing evidence fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  const result = await store.assessCandidate("missing");

  assert.equal(result.eligible, false);
  assert.equal(result.authorityEffect, "NONE");
  assert.ok(result.assessment.reasons.includes("learning_evidence_missing"));
});

test("independent evidence can become learning-eligible without authority", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  await store.append({
    candidateId: "candidate-1",
    contributions: [
      contribution("a", "EXPLORE", "source-a", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "source-b", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "source-c", "model-c", "prompt-c")
    ]
  }, meta);

  const result = await store.assessCandidate("candidate-1");

  assert.equal(result.eligible, true);
  assert.equal(result.authorityEffect, "NONE");
});

test("source echo fails closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  await store.append({
    candidateId: "candidate-echo",
    contributions: [
      contribution("a", "EXPLORE", "same-source", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "same-source", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "same-source", "model-c", "prompt-c")
    ]
  }, meta);

  const result = await store.assessCandidate("candidate-echo");

  assert.equal(result.eligible, false);
  assert.equal(result.authorityEffect, "NONE");
  assert.ok(result.assessment.reasons.includes("source_overlap_high"));
});

test("human and AI labels cannot manufacture independent lineage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  const base = {
    claims: [{
      tag: "EXTERNAL_EVIDENCE",
      statement: "same derivation",
      source: "source-a"
    }],
    modelId: "same-model",
    promptHash: "same-prompt",
    parentIds: []
  };

  await store.append({
    candidateId: "candidate-origin",
    contributions: [
      { ...base, id: "a", role: "EXPLORE", origin: "HUMAN" },
      { ...base, id: "b", role: "CHALLENGE", origin: "AI" },
      { ...base, id: "c", role: "INDEPENDENT_ALTERNATIVE", origin: "HUMAN" }
    ]
  }, meta);

  const result = await store.assessCandidate("candidate-origin");

  assert.equal(result.eligible, false);
  assert.equal(result.assessment.independentLineages, 1);
});

test("human-AI agreement growth without evidence forces hold", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  await store.append({
    candidateId: "candidate-drift",
    contributions: [
      contribution("a", "EXPLORE", "source-a", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "source-b", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "source-c", "model-c", "prompt-c")
    ],
    humanAiSignal: {
      agreementDelta: 0.9,
      independentEvidenceDelta: 0.1
    }
  }, meta);

  const result = await store.assessCandidate("candidate-drift");

  assert.equal(result.eligible, false);
  assert.ok(result.assessment.reasons.includes("human_ai_co_drift_high"));
});

test("tampered persisted evidence is rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  await store.append({
    candidateId: "candidate-tamper",
    contributions: [
      contribution("a", "EXPLORE", "source-a", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "source-b", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "source-c", "model-c", "prompt-c")
    ]
  }, meta);

  const path = join(dir, "memory", "learning-evidence.jsonl");
  const raw = await readFile(path, "utf8");
  await writeFile(path, raw.replace("evidence-a", "forged-data"), "utf8");

  await assert.rejects(
    () => store.assessCandidate("candidate-tamper"),
    /learning_evidence_chain_invalid/
  );
});


// ---- LEARNING EVIDENCE STORE HARDENING ADVERSARIAL ----

test("assessment rejects symlinked evidence store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-symlink-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  const path = join(dir, "memory", "learning-evidence.jsonl");
  const real = join(dir, "memory", "real-evidence.jsonl");

  await rename(path, real);
  await symlink(real, path);

  await assert.rejects(
    () => store.assessCandidate("candidate-symlink"),
    error => {
      assert.notEqual(error?.code, "ENOENT");
      return true;
    }
  );
});

test("read failure is not downgraded to missing evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-readfail-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  const path = join(dir, "memory", "learning-evidence.jsonl");

  await unlink(path);
  await writeFile(path, "", { mode: 0o000 });
  await chmod(path, 0o000);

  try {
    await assert.rejects(
      () => store.assessCandidate("candidate-readfail")
    );
  } finally {
    await chmod(path, 0o600);
  }
});

test("external append changes chain tip and blocks stale writer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-tip-"));
  const storeA = new LearningEvidenceStore(dir);
  await storeA.init();

  const storeB = new LearningEvidenceStore(dir);
  await storeB.init();

  await storeA.append({
    candidateId: "candidate-tip-a",
    contributions: [
      contribution("a", "EXPLORE", "source-a", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "source-b", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "source-c", "model-c", "prompt-c")
    ]
  }, meta);

  await assert.rejects(
    () => storeB.append({
      candidateId: "candidate-tip-b",
      contributions: [
        contribution("d", "EXPLORE", "source-d", "model-d", "prompt-d"),
        contribution("e", "CHALLENGE", "source-e", "model-e", "prompt-e"),
        contribution("f", "INDEPENDENT_ALTERNATIVE", "source-f", "model-f", "prompt-f")
      ]
    }, meta),
    /learning_evidence_chain_tip_changed/
  );
});

test("verified assessment rejects post-write chain tampering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nyxa-le-verified-read-"));
  const store = new LearningEvidenceStore(dir);
  await store.init();

  await store.append({
    candidateId: "candidate-verified-read",
    contributions: [
      contribution("a", "EXPLORE", "source-a", "model-a", "prompt-a"),
      contribution("b", "CHALLENGE", "source-b", "model-b", "prompt-b"),
      contribution("c", "INDEPENDENT_ALTERNATIVE", "source-c", "model-c", "prompt-c")
    ]
  }, meta);

  const path = join(dir, "memory", "learning-evidence.jsonl");
  const raw = await readFile(path, "utf8");

  await writeFile(
    path,
    raw.replace("evidence-b", "tampered-evidence"),
    "utf8"
  );

  await assert.rejects(
    () => store.assessCandidate("candidate-verified-read"),
    /learning_evidence_chain_invalid/
  );
});
