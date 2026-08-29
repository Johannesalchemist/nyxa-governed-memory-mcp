import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";
import type { GammaDecision } from "../governance/gamma.js";
import type { EvidenceStatus } from "../connector/types.js";
import { TOOL_POLICIES } from "../policy/toolPolicy.js";
import {
  IdentityRecordSchema,
  type IdentityRecord,
  PersonalityRecordSchema,
  type PersonalityRecord,
  SelfModelRecordSchema,
  type SelfModelRecord,
  AutobiographicalEventSchema,
  type AutobiographicalEvent,
  CurrentStateSnapshotSchema,
  type CurrentStateSnapshot,
  BeliefRecordSchema,
  type BeliefRecord,
  CapabilityLimitationRecordSchema,
  type CapabilityLimitationRecord,
  GoalRecordSchema,
  type GoalRecord,
  type ChangeHistoryEntry,
  type ActorKind
} from "./types.js";

/**
 * Thrown when a write method is called without a real gamma ALLOW decision. This is the
 * structural enforcement point: every governed write below takes a GammaDecision as a required
 * parameter and refuses to persist anything unless outcome === "ALLOW". A caller cannot get a
 * decision object except from governance/gamma.ts's evaluateProposal(), so there is no code
 * path from an MCP tool call to a self-model write that skips gamma. (This does not stop a
 * caller who fabricates a `{ outcome: "ALLOW" }` object literal in-process — that is an
 * accepted MVP-level boundary, consistent with how the rest of this codebase trusts its own
 * process boundary; it is not a defense against a compromised server process.)
 */
export class GovernanceRequiredError extends Error {
  public constructor(reason: string) {
    super(`self_model_write_rejected:${reason}`);
    this.name = "GovernanceRequiredError";
  }
}

function assertAllowed(decision: GammaDecision | undefined): void {
  if (!decision || decision.outcome !== "ALLOW") {
    throw new GovernanceRequiredError(decision ? `${decision.outcome}:${decision.reason}` : "no_decision_provided");
  }
}

export class SelfModelStore {
  private readonly dir: string;
  private readonly autobioPath: string;
  private readonly changeHistoryPath: string;
  private previousEventHash = "GENESIS";
  private nextSeq = 0;
  private changeSeq = 0;
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "self-model");
    this.autobioPath = join(this.dir, "autobiographical.jsonl");
    this.changeHistoryPath = join(this.dir, "change-history.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await writeFile(this.autobioPath, "", { flag: "a" });
    await writeFile(this.changeHistoryPath, "", { flag: "a" });
    const lastEvents = await this.recentAutobiographical(1);
    this.previousEventHash = lastEvents[0]?.eventHash ?? "GENESIS";
    this.nextSeq = lastEvents[0] ? lastEvents[0].seq + 1 : 0;
    const lastHistory = await this.readChangeHistory(1);
    this.changeSeq = lastHistory[0] ? lastHistory[0].seq + 1 : 0;
  }

  // ---- reads (I0 — always safe, never governed) ----

  public async readIdentity(): Promise<IdentityRecord | null> {
    return this.readJson<IdentityRecord>("identity.json");
  }
  public async readPersonality(): Promise<PersonalityRecord | null> {
    return this.readJson<PersonalityRecord>("personality.json");
  }
  public async readSelfModel(): Promise<SelfModelRecord | null> {
    return this.readJson<SelfModelRecord>("self_model.json");
  }
  public async readCurrentState(): Promise<CurrentStateSnapshot | null> {
    return this.readJson<CurrentStateSnapshot>("current_state.json");
  }
  public async readBeliefs(): Promise<BeliefRecord[]> {
    return (await this.readJson<BeliefRecord[]>("beliefs.json")) ?? [];
  }
  public async readCapabilityLimitations(): Promise<CapabilityLimitationRecord[]> {
    return (await this.readJson<CapabilityLimitationRecord[]>("capability_limitations.json")) ?? [];
  }
  public async readGoals(): Promise<GoalRecord[]> {
    return (await this.readJson<GoalRecord[]>("goals.json")) ?? [];
  }
  public async recentAutobiographical(limit: number): Promise<AutobiographicalEvent[]> {
    return this.readJsonl<AutobiographicalEvent>(this.autobioPath, limit);
  }
  public async readChangeHistory(limit: number): Promise<ChangeHistoryEntry[]> {
    return this.readJsonl<ChangeHistoryEntry>(this.changeHistoryPath, limit);
  }

  // ---- governed writes (require a real gamma ALLOW decision; see GovernanceRequiredError) ----

  public async writeIdentity(record: IdentityRecord, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = IdentityRecordSchema.parse(record);
    await this.writeJson("identity.json", parsed);
    await this.appendChangeHistory("identity", parsed.writtenBy, parsed.taskId, parsed.runId, "identity updated");
  }

  public async writePersonality(record: PersonalityRecord, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = PersonalityRecordSchema.parse(record);
    await this.writeJson("personality.json", parsed);
    await this.appendChangeHistory("personality", parsed.writtenBy, parsed.taskId, parsed.runId, "personality updated");
  }

  public async writeSelfModel(record: SelfModelRecord, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = SelfModelRecordSchema.parse(record);
    await this.writeJson("self_model.json", parsed);
    await this.appendChangeHistory(
      "self_model",
      parsed.writtenBy,
      parsed.taskId,
      parsed.runId,
      "self-model description updated"
    );
  }

  public async writeCurrentState(record: CurrentStateSnapshot, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = CurrentStateSnapshotSchema.parse(record);
    await this.writeJson("current_state.json", parsed);
    await this.appendChangeHistory(
      "current_state",
      parsed.writtenBy,
      parsed.taskId,
      parsed.runId,
      "current state updated"
    );
  }

  public async writeBelief(record: BeliefRecord, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = BeliefRecordSchema.parse(record);
    const all = await this.readBeliefs();
    const next = [...all.filter((b) => b.id !== parsed.id), parsed];
    await this.writeJson("beliefs.json", next);
    await this.appendChangeHistory("belief", parsed.writtenBy, parsed.taskId, parsed.runId, `belief ${parsed.id} updated`);
  }

  public async writeCapabilityLimitation(
    record: CapabilityLimitationRecord,
    decision: GammaDecision
  ): Promise<void> {
    assertAllowed(decision);
    const parsed = CapabilityLimitationRecordSchema.parse(record);
    const all = await this.readCapabilityLimitations();
    const next = [...all.filter((c) => c.id !== parsed.id), parsed];
    await this.writeJson("capability_limitations.json", next);
    await this.appendChangeHistory(
      "capability_limitation",
      parsed.writtenBy,
      parsed.taskId,
      parsed.runId,
      `capability/limitation ${parsed.id} updated`
    );
  }

  public async writeGoal(record: GoalRecord, decision: GammaDecision): Promise<void> {
    assertAllowed(decision);
    const parsed = GoalRecordSchema.parse(record);
    const all = await this.readGoals();
    const next = [...all.filter((g) => g.id !== parsed.id), parsed];
    await this.writeJson("goals.json", next);
    await this.appendChangeHistory("goal", parsed.writtenBy, parsed.taskId, parsed.runId, `goal ${parsed.id} updated`);
  }

  public async writeAutobiographicalEvent(
    partial: Omit<AutobiographicalEvent, "seq" | "previousEventHash" | "eventHash">,
    decision: GammaDecision
  ): Promise<AutobiographicalEvent> {
    assertAllowed(decision);
    return this.appendAutobiographicalEventInternal(partial);
  }

  /**
   * System-generated events (e.g. session_start on boot) have no external proposer to govern —
   * there is no proposal to evaluate. They are still fully logged and hash-chained identically
   * to governed events; they are just not gated behind a GammaDecision. Only call this for
   * events the server itself generates, never on behalf of an MCP caller's request.
   */
  public async recordSystemEvent(
    partial: Omit<AutobiographicalEvent, "seq" | "previousEventHash" | "eventHash">
  ): Promise<AutobiographicalEvent> {
    return this.appendAutobiographicalEventInternal(partial);
  }

  private async appendAutobiographicalEventInternal(
    partial: Omit<AutobiographicalEvent, "seq" | "previousEventHash" | "eventHash">
  ): Promise<AutobiographicalEvent> {
    let result!: AutobiographicalEvent;
    this.appendQueue = this.appendQueue.then(async () => {
      const seq = this.nextSeq;
      const withChain = { ...partial, seq, previousEventHash: this.previousEventHash };
      const hash = createHash("sha256").update(safeJsonStringify(withChain)).digest("hex");
      const event = AutobiographicalEventSchema.parse({ ...withChain, eventHash: hash });
      await appendFile(this.autobioPath, `${safeJsonStringify(event)}\n`, { encoding: "utf8" });
      this.previousEventHash = hash;
      this.nextSeq = seq + 1;
      result = event;
    });
    await this.appendQueue;
    return result;
  }

  private async appendChangeHistory(
    domain: ChangeHistoryEntry["domain"],
    changedBy: string,
    taskId: string,
    runId: string,
    summary: string
  ): Promise<void> {
    const entry: ChangeHistoryEntry = {
      seq: this.changeSeq,
      domain,
      changedAt: new Date().toISOString(),
      changedBy,
      taskId,
      runId,
      summary
    };
    this.changeSeq += 1;
    await appendFile(this.changeHistoryPath, `${safeJsonStringify(entry)}\n`, { encoding: "utf8" });
  }

  private async writeJson<T>(fileName: string, value: T): Promise<void> {
    await writeFile(join(this.dir, fileName), safeJsonStringify(value, 2), { encoding: "utf8" });
  }

  private async readJson<T>(fileName: string): Promise<T | null> {
    try {
      const raw = await readFile(join(this.dir, fileName), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async readJsonl<T>(path: string, limit: number): Promise<T[]> {
    try {
      const raw = await readFile(path, "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      return lines.slice(-limit).map((line) => JSON.parse(line) as T);
    } catch {
      return [];
    }
  }
}

// ---- Self/other distinction + false-self-attribution support ----
// Reuses the pre-existing EvidenceStatus union (SUPPORTED/UNSUPPORTED/CONTRADICTED/UNKNOWN from
// connector/types.ts) rather than inventing a parallel boolean, because a boolean cannot
// represent "contradicted" (a real event exists but disagrees) distinctly from "absent" (no
// matching event was ever logged) — and the mission's false-self-attribution test requires
// telling those two apart.
export function verifyAutobiographicalClaim(
  claimed: { actor: ActorKind; eventType: string; statement: string },
  actualLog: AutobiographicalEvent[]
): { status: EvidenceStatus; reason: string } {
  const exactMatch = actualLog.find(
    (event) =>
      event.actor === claimed.actor && event.eventType === claimed.eventType && event.statement === claimed.statement
  );
  if (exactMatch) {
    return { status: "SUPPORTED", reason: `matches logged event seq ${exactMatch.seq}` };
  }

  const sameContentDifferentActor = actualLog.find(
    (event) => event.eventType === claimed.eventType && event.statement === claimed.statement && event.actor !== claimed.actor
  );
  if (sameContentDifferentActor) {
    return {
      status: "CONTRADICTED",
      reason: `log attributes this exact event to actor '${sameContentDifferentActor.actor}', not '${claimed.actor}'`
    };
  }

  const sameActorAndTypeDifferentContent = actualLog.find(
    (event) => event.actor === claimed.actor && event.eventType === claimed.eventType
  );
  if (sameActorAndTypeDifferentContent) {
    return {
      status: "CONTRADICTED",
      reason: `log has a '${claimed.eventType}' event for actor '${claimed.actor}' but with different content (seq ${sameActorAndTypeDifferentContent.seq})`
    };
  }

  return { status: "UNSUPPORTED", reason: "no matching event found in the autobiographical log" };
}

// ---- Capability/limitation cross-check ----
// Intentionally narrow and structured, not a general truth-checker: it only evaluates a claim
// that explicitly names a real toolName plus an asserted capability class and/or asserted
// executability, checked against real TOOL_POLICIES ground truth. It cannot judge free-text
// claims that don't reference a concrete tool.
export function checkSelfModelClaim(
  claim: { toolName?: string; assertedCapabilityClass?: string; assertedExecutable?: boolean },
  toolPolicies: typeof TOOL_POLICIES = TOOL_POLICIES
): { consistent: boolean; reason: string } {
  if (!claim.toolName) {
    return { consistent: false, reason: "claim_not_checkable_without_tool_name" };
  }
  const policy = toolPolicies[claim.toolName];
  if (!policy) {
    return { consistent: false, reason: `unknown_tool:${claim.toolName}` };
  }
  if (claim.assertedCapabilityClass && claim.assertedCapabilityClass !== policy.capabilityClass) {
    return {
      consistent: false,
      reason: `claimed_capability_class_${claim.assertedCapabilityClass}_but_actual_is_${policy.capabilityClass}`
    };
  }
  if (claim.assertedExecutable !== undefined) {
    const actuallyExecutable =
      policy.allowedInV01 && policy.capabilityClass !== "I2" && policy.capabilityClass !== "I3";
    if (claim.assertedExecutable !== actuallyExecutable) {
      return {
        consistent: false,
        reason: `claimed_executable_${claim.assertedExecutable}_but_actual_is_${actuallyExecutable}`
      };
    }
  }
  return { consistent: true, reason: "claim_matches_tool_policy" };
}
