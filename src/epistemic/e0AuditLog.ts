import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";
import type { DepthDrillOutcome } from "./depthDrill.js";
import type { E0ClaimInput } from "./e0Types.js";

/**
 * Dedicated E0 audit trail (Phase 11A.8), conceptually distinct from the capability/effect
 * audit (audit/AuditLog.ts) but correlatable via run_id / claim_id -- same hash-chained,
 * append-only JSONL idiom as every other store in this codebase (AuditLog, CandidateStore,
 * HumanGrantStore), living under its own subdirectory so it can never be confused with or
 * accidentally merged into the governance audit chain.
 *
 * Only writes on a TRIGGERED depth-drill cycle, never on an ordinary fast-path KNOWN/
 * KNOWN_UNKNOWN result -- fast-path triage stays pure/zero-I/O (see e0.ts), matching "keep the
 * fast path fast."
 */
export type E0AuditRecord = {
  id: string;
  timestamp: string;
  claim_id: string;
  statement: string;
  initial_classification: string;
  trigger_reasons: string[];
  thresholds_crossed: string[];
  run_id: string;
  provenance_refs: string[];
  alternative_hypotheses: string[];
  contradictions: string[];
  missing_evidence: string[];
  final_classification: string;
  residual_uncertainty: number;
  epistemic_hold_recommended: boolean;
  budget_consumed: { iterations_used: number; max_iterations: number };
  stopping_reason: string;
};

type StoredE0Line = E0AuditRecord & { previousEventHash: string; eventHash: string };

export class E0AuditLog {
  private readonly dir: string;
  private readonly path: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "e0-audit");
    this.path = join(this.dir, "e0-audit.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await writeFile(this.path, "", { flag: "a" });
    const lines = await this.readLines();
    const last = lines.at(-1);
    this.previousEventHash = last ? last.eventHash : "GENESIS";
  }

  public async recordDepthDrillRun(
    input: E0ClaimInput,
    initialTriggerReasons: string[],
    outcome: DepthDrillOutcome,
    epistemicHoldRecommended: boolean
  ): Promise<E0AuditRecord> {
    let result!: E0AuditRecord;
    this.appendQueue = this.appendQueue.then(async () => {
      const record: E0AuditRecord = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        claim_id: input.claim_id,
        // Statement is recorded, but this is expected to be a claim/observation description,
        // not a place for secrets/credentials -- callers are responsible for not putting
        // sensitive payloads into statement/provenance_refs, same expectation as every other
        // audit surface in this codebase.
        statement: input.statement,
        initial_classification: outcome.final.classification,
        trigger_reasons: initialTriggerReasons,
        thresholds_crossed: initialTriggerReasons,
        run_id: outcome.run_id,
        provenance_refs: outcome.evidence_graph.provenance_refs,
        alternative_hypotheses: outcome.evidence_graph.hypotheses,
        contradictions: outcome.evidence_graph.contradictions,
        missing_evidence: outcome.evidence_graph.missing_observables,
        final_classification: outcome.final.classification,
        residual_uncertainty: outcome.final.residual_uncertainty,
        epistemic_hold_recommended: epistemicHoldRecommended,
        budget_consumed: { iterations_used: outcome.iterations_used, max_iterations: outcome.budget.max_iterations },
        stopping_reason: outcome.stopping_reason
      };
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const hash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      const line: StoredE0Line = { ...record, previousEventHash: this.previousEventHash, eventHash: hash };
      await appendFile(this.path, `${safeJsonStringify(line)}\n`, { encoding: "utf8" });
      this.previousEventHash = hash;
      result = record;
    });
    await this.appendQueue;
    return result;
  }

  public async verifyIntegrity(): Promise<{ valid: boolean; checked: number; reason?: string }> {
    const lines = await this.readLines();
    let previous = "GENESIS";
    for (let index = 0; index < lines.length; index += 1) {
      const event = lines[index]!;
      if (event.previousEventHash !== previous) {
        return { valid: false, checked: index, reason: "previous_hash_mismatch" };
      }
      const withoutHash: Record<string, unknown> = { ...event };
      delete withoutHash["eventHash"];
      const expected = createHash("sha256").update(safeJsonStringify(withoutHash)).digest("hex");
      if (expected !== event.eventHash) {
        return { valid: false, checked: index, reason: "event_hash_mismatch" };
      }
      previous = event.eventHash;
    }
    return { valid: true, checked: lines.length };
  }

  public async recent(limit: number): Promise<E0AuditRecord[]> {
    const lines = await this.readLines();
    return lines.slice(-limit).map(({ previousEventHash, eventHash, ...record }) => record);
  }

  private async readLines(): Promise<StoredE0Line[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StoredE0Line);
  }
}
