import { createHash, randomUUID } from "node:crypto";
import { AUTO_FAMILIES, isModelFamily, selectModel, type CatalogModel, type ModelFamily } from "./modelRegistry.js";

export type NewsroomParticipant = ModelFamily;
export type NewsroomModality = "text" | "code" | "research" | "image" | "video";

export type NewsroomInput = {
  prompt: string;
  participants: NewsroomParticipant[];
  modality?: NewsroomModality;
  input_refs?: string[];
  evidence_refs?: string[];
};

export type NewsroomContribution = {
  participant: NewsroomParticipant;
  requested_model: string;
  actual_model?: string;
  provider?: string;
  task_id?: string;
  transport?: "openrouter";
  modality?: NewsroomModality;
  input_refs?: string[];
  evidence_refs?: string[];
  input_sha256?: string;
  output_ref?: string;
  uncertainty?: { status: "not_assessed" };
  material_dissent?: { status: "not_assessed" };
  request_id: string;
  started_at: string;
  completed_at: string;
  status: "ok" | "failed";
  output?: string;
  output_sha256?: string;
  error_code?: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseNewsroomInput(payload: Record<string, unknown> | undefined): NewsroomInput {
  const prompt = payload?.["prompt"];
  const rawParticipants = payload?.["participants"];
  const modality = payload?.["modality"];
  if (typeof prompt !== "string" || prompt.trim().length < 1 || prompt.length > 50_000) {
    throw new Error("newsroom_prompt_invalid");
  }
  const allowedModalities = new Set<NewsroomModality>(["text", "code", "research", "image", "video"]);
  if (modality !== undefined && (typeof modality !== "string" || !allowedModalities.has(modality as NewsroomModality))) {
    throw new Error("newsroom_modality_invalid");
  }
  const resolvedModality = (modality as NewsroomModality | undefined) ?? "text";
  const requested = rawParticipants === undefined ? AUTO_FAMILIES[resolvedModality] : rawParticipants;
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 5) {
    throw new Error("newsroom_participants_invalid");
  }
  const participants: NewsroomParticipant[] = [];
  for (const value of requested) {
    if (!isModelFamily(value)) {
      throw new Error("newsroom_participant_not_allowlisted");
    }
    const participant = value as NewsroomParticipant;
    if (!participants.includes(participant)) participants.push(participant);
  }
  const refs = (key: string): string[] => {
    const value = payload?.[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 1000 || value.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 2048)) {
      throw new Error(`newsroom_${key}_invalid`);
    }
    return [...new Set(value as string[])];
  };
  return { prompt: prompt.trim(), participants, modality: resolvedModality, input_refs: refs("input_refs"), evidence_refs: refs("evidence_refs") };
}

async function callOpenRouter(
  apiKey: string,
  participant: NewsroomParticipant,
  prompt: string,
  requestedModel: string
): Promise<NewsroomContribution> {
  const requestId = randomUUID();
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      return { participant, requested_model: requestedModel, request_id: requestId, started_at: startedAt, completed_at: new Date().toISOString(), status: "failed", error_code: `openrouter_http_${response.status}` };
    }
    const body = await response.json() as Record<string, unknown>;
    const choices = Array.isArray(body["choices"]) ? body["choices"] as Array<Record<string, unknown>> : [];
    const message = choices[0]?.["message"] as Record<string, unknown> | undefined;
    const content = message?.["content"];
    if (typeof content !== "string" || content.length === 0) {
      return { participant, requested_model: requestedModel, request_id: requestId, started_at: startedAt, completed_at: new Date().toISOString(), status: "failed", error_code: "openrouter_empty_response" };
    }
    const actualModel = typeof body["model"] === "string" ? body["model"] : undefined;
    const provider = typeof body["provider"] === "string" ? body["provider"] : undefined;
    // A successful HTTP response alone cannot establish participant identity.
    // Fail closed on missing provenance or an unrequested model substitution.
    if (!actualModel || actualModel !== requestedModel || typeof body["id"] !== "string" || !body["id"].trim()) {
      return { participant, requested_model: requestedModel, request_id: requestId, started_at: startedAt, completed_at: new Date().toISOString(), status: "failed", error_code: "openrouter_provenance_incomplete_or_model_mismatch" };
    }
    return {
      participant,
      requested_model: requestedModel,
      ...(actualModel ? { actual_model: actualModel } : {}),
      ...(provider ? { provider } : {}),
      request_id: typeof body["id"] === "string" ? body["id"] : requestId,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: "ok",
      output: content,
      output_sha256: sha256(content)
    };
  } catch (error) {
    return { participant, requested_model: requestedModel, request_id: requestId, started_at: startedAt, completed_at: new Date().toISOString(), status: "failed", error_code: error instanceof Error && error.name === "AbortError" ? "openrouter_completion_timeout" : "openrouter_request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCatalog(): Promise<CatalogModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/models", { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("openrouter_catalog_timeout");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`openrouter_models_http_${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  const rows = Array.isArray(body["data"]) ? body["data"] : [];
  return rows.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row["id"] !== "string") return [];
    const architecture = row["architecture"] && typeof row["architecture"] === "object"
      ? row["architecture"] as Record<string, unknown> : {};
    const inputModalities = Array.isArray(architecture["input_modalities"])
      ? architecture["input_modalities"].filter((value): value is string => typeof value === "string")
      : [];
    return [{ id: row["id"], inputModalities }];
  });
}

export async function consultNewsroom(input: NewsroomInput): Promise<Record<string, unknown>> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) throw new Error("openrouter_api_key_not_configured");
  const modality = input.modality ?? "text";
    const catalog = await loadCatalog();
    const contributions = await Promise.all(input.participants.map((participant) => {
      const model = selectModel(catalog, participant, modality);
      if (!model) {
        const now = new Date().toISOString();
        return Promise.resolve<NewsroomContribution>({
          participant, requested_model: "UNAVAILABLE", request_id: randomUUID(), started_at: now, completed_at: now, status: "failed", error_code: "no_capable_model_available"
        });
      }
      return callOpenRouter(apiKey, participant, input.prompt, model);
    }));
    const taskId = randomUUID();
    const inputHash = sha256(input.prompt);
    for (const item of contributions) {
      item.task_id = taskId;
      item.transport = "openrouter";
      item.modality = modality;
      item.input_sha256 = inputHash;
      item.input_refs = [`sha256:${inputHash}`, ...(input.input_refs ?? [])];
      item.evidence_refs = [...(input.evidence_refs ?? [])];
      item.uncertainty = { status: "not_assessed" };
      item.material_dissent = { status: "not_assessed" };
      if (item.output_sha256) item.output_ref = `sha256:${item.output_sha256}`;
    }
    const successful = contributions.filter((item) => item.status === "ok");
    const antiPhantomPass = successful.length > 0
      && successful.every((item) => Boolean(item.actual_model && item.transport === "openrouter" && item.request_id && item.output_sha256))
      && successful.every((item) => input.participants.includes(item.participant));
    return {
      newsroom_version: "2",
      task_id: taskId,
      reference_trust: "caller_supplied_unverified",
      synthesis_status: "not_performed",
      dissent_assessment_status: "not_performed",
      routing: "capability_registry",
      modality,
      requested_participants: input.participants,
      contributions,
      successful_participants: successful.map((item) => item.participant),
      anti_phantom_pass: antiPhantomPass,
      authority_effect: "NONE",
      evidence_only: true
    };
}
