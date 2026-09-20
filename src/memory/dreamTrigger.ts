import type { SelfModelStore } from "../self-model/store.js";
import type { AuditLog } from "../audit/AuditLog.js";
import type { StoreCandidateInput } from "../schema/candidates.js";

const DREAM_WINDOW = 10;

/**
 * Deterministic dream-cycle candidate derivation for this slice: no model call, no randomness,
 * no background scheduling -- only ever invoked from the explicitly-proposed nyxa_dream_trigger
 * action (see server.ts's executeAllowedProposal), which itself must still clear C0 and gamma
 * C1-C5 like any other mutation before this function's output is ever persisted.
 *
 * Reads the last DREAM_WINDOW autobiographical events (self-model/store.ts, already on disk)
 * and the last DREAM_WINDOW audit entries (audit/AuditLog.ts, already on disk) and composes one
 * compressed summary candidate -- counts and groupings of what already happened, not
 * interpretation or synthesis. This is intentionally the smallest real "Observed Experience ->
 * Memory -> Dream Processing -> Candidate" pass for this first slice: genuine compression of
 * real data, not a placeholder. A later version adding model-based interpretation is a
 * separate, later decision (see this task's explicit Gamma/model separation).
 *
 * The returned candidate always has confidence/importance in the low-to-moderate range and
 * status "pending" once stored -- a dream candidate is a summary to review, never a claim to
 * trust automatically.
 */
export async function deriveDreamCandidate(
  selfModel: SelfModelStore,
  auditLog: AuditLog
): Promise<StoreCandidateInput> {
  const events = await selfModel.recentAutobiographical(DREAM_WINDOW);
  const auditEntries = await auditLog.recent(DREAM_WINDOW);

  const eventTypeCounts = new Map<string, number>();
  for (const event of events) {
    eventTypeCounts.set(event.eventType, (eventTypeCounts.get(event.eventType) ?? 0) + 1);
  }
  const eventSummary = [...eventTypeCounts.entries()]
    .map(([type, count]) => `${type}=${count}`)
    .join(", ");

  const decisionCounts = new Map<string, number>();
  for (const entry of auditEntries) {
    const key = entry.policy_decision ?? "unknown";
    decisionCounts.set(key, (decisionCounts.get(key) ?? 0) + 1);
  }
  const decisionSummary = [...decisionCounts.entries()]
    .map(([decision, count]) => `${decision}=${count}`)
    .join(", ");

  const earliestEvent = events[0]?.occurredAt ?? null;
  const latestEvent = events[events.length - 1]?.occurredAt ?? null;

  const content =
    `Dream cycle summary over last ${events.length} autobiographical event(s) and ` +
    `${auditEntries.length} audit entr${auditEntries.length === 1 ? "y" : "ies"}. ` +
    `Event types: ${eventSummary || "none"}. ` +
    `Governance decisions: ${decisionSummary || "none"}. ` +
    `Window: ${earliestEvent ?? "n/a"} to ${latestEvent ?? "n/a"}.`;

  return {
    content,
    candidate_type: "dream_summary",
    source: "dream",
    scope: "project",
    purpose: "dream-cycle compression of recent self-model and audit activity",
    confidence: 0.5,
    importance: 0.3
  };
}
