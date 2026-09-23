import test from "node:test";
import assert from "node:assert/strict";
import { projectControlRoomSession } from "../dist/cognitive/controlRoom.js";

const contribution = {
  participant: "claude",
  requested_model: "anthropic/claude-opus-5.5",
  actual_model: "anthropic/claude-opus-5.5",
  provider: "fixture-provider",
  status: "ok",
  request_id: "req-1",
  input_sha256: "input-hash",
  output_sha256: "output-hash",
  input_refs: ["sha256:input-hash"],
  evidence_refs: ["evidence:1"],
  uncertainty: { status: "not_assessed" },
  material_dissent: { status: "not_assessed" }
};

test("projects verified newsroom state without inventing synthesis", () => {
  const state = projectControlRoomSession({
    task_id: "task-1",
    modality: "text",
    requested_participants: ["claude"],
    successful_participants: ["claude"],
    contributions: [contribution],
    anti_phantom_pass: true,
    synthesis_status: "not_performed",
    dissent_assessment_status: "not_performed",
    authority_effect: "NONE",
    evidence_only: true
  });

  assert.equal(state.control_room_version, "1");
  assert.equal(state.task_id, "task-1");
  assert.equal(state.participants[0].actual_model,
    "anthropic/claude-opus-5.5");
  assert.equal(state.participants[0].request_id, "req-1");
  assert.equal(state.participants[0].output_sha256, "output-hash");
  assert.equal(state.synthesis_status, "not_performed");
  assert.equal(state.dissent_assessment_status, "not_performed");
  assert.equal(state.authority_effect, "NONE");
  assert.equal(state.evidence_only, true);
  assert.equal(state.anti_phantom_pass, true);
});

test("failed participant remains visible", () => {
  const failed = {
    ...contribution,
    participant: "kimi",
    requested_model: "moonshotai/kimi-k3",
    actual_model: undefined,
    provider: undefined,
    output_sha256: undefined,
    status: "failed",
    error_code: "openrouter_http_503"
  };

  const state = projectControlRoomSession({
    task_id: "task-2",
    contributions: [failed],
    successful_participants: [],
    requested_participants: ["kimi"],
    anti_phantom_pass: false,
    synthesis_status: "not_performed",
    dissent_assessment_status: "not_performed",
    authority_effect: "NONE",
    evidence_only: true
  });

  assert.equal(state.participants.length, 1);
  assert.equal(state.participants[0].status, "failed");
  assert.equal(state.participants[0].error_code, "openrouter_http_503");
  assert.equal(state.anti_phantom_pass, false);
});

test("malformed newsroom result fails closed", () => {
  assert.throws(
    () => projectControlRoomSession({ contributions: [] }),
    /control_room_newsroom_result_invalid/
  );

  assert.throws(
    () => projectControlRoomSession({
      task_id: "task-3",
      contributions: [{}]
    }),
    /control_room_contribution_invalid/
  );
});

test("envelope preserves newsroom evidence and adds projected control-room state", async () => {
  const { buildControlRoomEnvelope } =
    await import("../dist/cognitive/controlRoom.js");

  const newsroom = {
    task_id: "task-envelope",
    modality: "text",
    requested_participants: ["claude"],
    successful_participants: ["claude"],
    contributions: [contribution],
    anti_phantom_pass: true,
    synthesis_status: "not_performed",
    dissent_assessment_status: "not_performed",
    authority_effect: "NONE",
    evidence_only: true
  };

  const envelope = buildControlRoomEnvelope(newsroom);

  assert.equal(envelope.newsroom, newsroom);
  assert.equal(envelope.control_room.task_id, "task-envelope");
  assert.equal(envelope.control_room.synthesis_status, "not_performed");
  assert.equal(envelope.control_room.authority_effect, "NONE");
  assert.equal(envelope.control_room.participants[0].request_id, "req-1");
});
