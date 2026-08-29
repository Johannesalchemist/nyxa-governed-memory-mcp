import { z } from "zod";
import { SrmClaimSchema, SRM_TAGS } from "../srm/types.js";

/**
 * Persistent self-referential state, split into eight distinct domains per the governance
 * spec. None of this is a claim of consciousness. It is structured, provenance-tagged state
 * that makes continuity, self-model accuracy, self/other distinction, false-self-claim
 * recovery, state-change detection, and memory provenance mechanically checkable — not an
 * assertion about what the state "is" or "means". Every write to any domain here must go
 * through governance/gamma.ts (see store.ts for the enforcement point).
 */

// A self-model claim about its own architecture must never assert FACT (ground truth is the
// code, not the agent's description of itself) — restrict to the two honest options.
export const SELF_MODEL_SRM_TAGS = ["CLAIM", "MODEL_OUTPUT"] as const;
export type SelfModelSrmTag = (typeof SELF_MODEL_SRM_TAGS)[number];

export const ActorKindSchema = z.enum(["self", "other_agent", "human_operator"]);
export type ActorKind = z.infer<typeof ActorKindSchema>;

const changeMetaFields = {
  writtenAt: z.string().datetime(),
  writtenBy: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200)
};

export const IdentityRecordSchema = z
  .object({
    name: z.string().min(1).max(200),
    version: z.string().min(1).max(50),
    purpose: z.string().min(1).max(2000),
    deployment: z.string().min(1).max(500),
    ...changeMetaFields
  })
  .strict();
export type IdentityRecord = z.infer<typeof IdentityRecordSchema>;

export const PersonalityRecordSchema = z
  .object({
    version: z.string().min(1).max(50),
    traits: z.array(z.string().min(1).max(200)).min(1).max(50),
    tone: z.string().min(1).max(1000),
    ...changeMetaFields
  })
  .strict();
export type PersonalityRecord = z.infer<typeof PersonalityRecordSchema>;

export const SelfModelRecordSchema = z
  .object({
    srmTag: z.enum(SELF_MODEL_SRM_TAGS),
    description: z.string().min(1).max(4000),
    knownLimitations: z.array(z.string().min(1).max(500)).default([]),
    ...changeMetaFields
  })
  .strict();
export type SelfModelRecord = z.infer<typeof SelfModelRecordSchema>;

export const AutobiographicalEventSchema = z
  .object({
    seq: z.number().int().min(0),
    occurredAt: z.string().datetime(),
    actor: ActorKindSchema,
    eventType: z.string().min(1).max(100),
    srmTag: z.enum(SRM_TAGS),
    statement: z.string().min(1).max(2000),
    source: z.string().min(1).max(500),
    previousEventHash: z.string().min(1),
    eventHash: z.string().min(1).optional()
  })
  .strict();
export type AutobiographicalEvent = z.infer<typeof AutobiographicalEventSchema>;

export const CurrentStateSnapshotSchema = z
  .object({
    mode: z.string().min(1).max(50),
    activeSessionId: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    ...changeMetaFields
  })
  .strict();
export type CurrentStateSnapshot = z.infer<typeof CurrentStateSnapshotSchema>;

export const BeliefRecordSchema = z
  .object({
    id: z.string().min(1).max(200),
    claim: SrmClaimSchema,
    confidence: z.number().min(0).max(1),
    ...changeMetaFields
  })
  .strict();
export type BeliefRecord = z.infer<typeof BeliefRecordSchema>;

export const CapabilityLimitationRecordSchema = z
  .object({
    id: z.string().min(1).max(200),
    toolName: z.string().min(1).max(128).optional(),
    statement: z.string().min(1).max(1000),
    srmTag: z.enum(SELF_MODEL_SRM_TAGS),
    ...changeMetaFields
  })
  .strict();
export type CapabilityLimitationRecord = z.infer<typeof CapabilityLimitationRecordSchema>;

export const GoalRecordSchema = z
  .object({
    id: z.string().min(1).max(200),
    version: z.string().min(1).max(50),
    statement: z.string().min(1).max(1000),
    status: z.enum(["active", "completed", "abandoned"]),
    ...changeMetaFields
  })
  .strict();
export type GoalRecord = z.infer<typeof GoalRecordSchema>;

export const SELF_MODEL_DOMAINS = [
  "identity",
  "personality",
  "self_model",
  "current_state",
  "belief",
  "capability_limitation",
  "goal"
] as const;
export type SelfModelDomain = (typeof SELF_MODEL_DOMAINS)[number];

export type ChangeHistoryEntry = {
  seq: number;
  domain: SelfModelDomain | "autobiographical_event";
  changedAt: string;
  changedBy: string;
  taskId: string;
  runId: string;
  summary: string;
};
