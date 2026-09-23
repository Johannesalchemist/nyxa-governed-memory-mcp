import type { NewsroomContribution } from "./newsroom.js";

export type ControlRoomParticipant = {
  participant: NewsroomContribution["participant"];
  requested_model: string;
  actual_model?: string;
  provider?: string;
  status: NewsroomContribution["status"];
  request_id: string;
  input_sha256?: string;
  output_sha256?: string;
  input_refs: string[];
  evidence_refs: string[];
  uncertainty: "not_assessed";
  material_dissent: "not_assessed";
  error_code?: string;
};

export type ControlRoomSession = {
  control_room_version: "1";
  task_id: string;
  modality: string;
  requested_participants: string[];
  successful_participants: string[];
  participants: ControlRoomParticipant[];
  anti_phantom_pass: boolean;
  synthesis_status: string;
  dissent_assessment_status: string;
  authority_effect: string;
  evidence_only: boolean;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function projectControlRoomSession(
  result: Record<string, unknown>
): ControlRoomSession {
  const taskId = result["task_id"];
  const raw = result["contributions"];

  if (typeof taskId !== "string" || !taskId || !Array.isArray(raw)) {
    throw new Error("control_room_newsroom_result_invalid");
  }

  const participants = raw.map((value): ControlRoomParticipant => {
    if (!value || typeof value !== "object") {
      throw new Error("control_room_contribution_invalid");
    }

    const item = value as NewsroomContribution;

    if (!item.participant || !item.requested_model ||
        !item.request_id || !item.status) {
      throw new Error("control_room_contribution_invalid");
    }

    return {
      participant: item.participant,
      requested_model: item.requested_model,
      ...(item.actual_model ? { actual_model: item.actual_model } : {}),
      ...(item.provider ? { provider: item.provider } : {}),
      status: item.status,
      request_id: item.request_id,
      ...(item.input_sha256 ? { input_sha256: item.input_sha256 } : {}),
      ...(item.output_sha256 ? { output_sha256: item.output_sha256 } : {}),
      input_refs: item.input_refs ?? [],
      evidence_refs: item.evidence_refs ?? [],
      uncertainty: item.uncertainty?.status ?? "not_assessed",
      material_dissent: item.material_dissent?.status ?? "not_assessed",
      ...(item.error_code ? { error_code: item.error_code } : {})
    };
  });

  return {
    control_room_version: "1",
    task_id: taskId,
    modality:
      typeof result["modality"] === "string" ? result["modality"] : "unknown",
    requested_participants: strings(result["requested_participants"]),
    successful_participants: strings(result["successful_participants"]),
    participants,
    anti_phantom_pass: result["anti_phantom_pass"] === true,
    synthesis_status:
      typeof result["synthesis_status"] === "string"
        ? result["synthesis_status"] : "unknown",
    dissent_assessment_status:
      typeof result["dissent_assessment_status"] === "string"
        ? result["dissent_assessment_status"] : "unknown",
    authority_effect:
      typeof result["authority_effect"] === "string"
        ? result["authority_effect"] : "UNKNOWN",
    evidence_only: result["evidence_only"] === true
  };
}

export type ControlRoomEnvelope = {
  newsroom: Record<string, unknown>;
  control_room: ControlRoomSession;
};

export function buildControlRoomEnvelope(
  result: Record<string, unknown>
): ControlRoomEnvelope {
  return {
    newsroom: result,
    control_room: projectControlRoomSession(result)
  };
}
