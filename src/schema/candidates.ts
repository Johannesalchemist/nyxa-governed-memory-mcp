import { z } from "zod";

/**
 * Memory Candidate schema (Phase C: Governed Memory + Dreaming vertical slice).
 *
 * Adapted from the working schema in the frozen /opt/nyxa-meta-memorydream v0.2 reference
 * (content, candidate_type, source, scope, purpose, confidence, importance, status,
 * created_at) -- that repository's real, tested schema, not its dreaming stubs. Two
 * deliberate departures from the reference:
 *
 *  - CandidateSource gains "dream": this runtime's own prior (unused) candidates.ts stub
 *    already anticipated a "dream" source but nothing ever wired it up. This slice does.
 *  - No standalone `provenance` field on the record: this runtime already carries proposal
 *    -level provenance (ValidatedProposal.provenance: taskId/runId/requestingIdentity, see
 *    governance/proposal.ts) and folds it into writtenBy/taskId/runId the same way every
 *    self-model record already does (self-model/types.ts's changeMetaFields pattern) --
 *    duplicating it per-candidate would be a second, parallel provenance concept for the
 *    same information.
 *
 * A candidate is never authoritative on its own: status starts "pending" and nothing ever
 * auto-promotes one. The one exception (Step 11) is CandidateStore.promoteCandidate, reachable
 * only through nyxa_memory_promote_candidate, which itself requires an explicit, scoped,
 * single-use human grant (see governance/humanGrant.ts) -- an ordinary proposal, however
 * capable, cannot promote a candidate on its own.
 */

export const CANDIDATE_TYPES = [
  "observation",
  "documentation_note",
  "decision",
  "risk",
  "process_pattern",
  "preference",
  "open_question",
  "dream_summary"
] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export const CANDIDATE_SOURCES = ["user", "assistant", "agent", "tool", "system", "mcp", "dream"] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const CANDIDATE_SCOPES = ["personal", "project", "team", "organization"] as const;
export type CandidateScope = (typeof CANDIDATE_SCOPES)[number];

// "promoted": written only by CandidateStore.promoteCandidate (Step 11 human-authority
// capability, see governance/humanGrant.ts and server.ts's nyxa_memory_promote_candidate) --
// requires an explicit, scoped, single-use human grant. Never set by the ordinary
// nyxa_memory_store_candidate write path.
export const CANDIDATE_STATUSES = ["pending", "rejected", "superseded", "promoted"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

const changeMetaFields = {
  writtenAt: z.string().datetime(),
  writtenBy: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200)
};

export const MemoryCandidateSchema = z
  .object({
    id: z.string().min(1).max(200),
    content: z.string().min(1).max(4000),
    candidate_type: z.enum(CANDIDATE_TYPES),
    source: z.enum(CANDIDATE_SOURCES),
    scope: z.enum(CANDIDATE_SCOPES),
    purpose: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    importance: z.number().min(0).max(1),
    status: z.enum(CANDIDATE_STATUSES),
    createdAt: z.string().datetime(),
    ...changeMetaFields
  })
  .strict();
export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

/** Input shape for nyxa_memory_store_candidate's proposal.payload -- everything except the
 *  fields the store itself assigns (id, status, createdAt, and the writtenAt/writtenBy/taskId
 *  /runId meta, which comes from proposal.provenance, matching executeSelfModelWrite's pattern). */
export const StoreCandidateInputSchema = z.object({
  content: z.string().min(1).max(4000),
  candidate_type: z.enum(CANDIDATE_TYPES),
  source: z.enum(CANDIDATE_SOURCES),
  scope: z.enum(CANDIDATE_SCOPES),
  purpose: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1)
});
export type StoreCandidateInput = z.infer<typeof StoreCandidateInputSchema>;

export type CandidateRecallFilter = {
  status?: CandidateStatus;
  candidateType?: CandidateType;
  limit: number;
};
