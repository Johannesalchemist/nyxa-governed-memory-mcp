import { createHash, randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile, open, realpath, lstat, type FileHandle } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";
import type { GammaDecision } from "../governance/gamma.js";
import { GovernanceRequiredError } from "../self-model/store.js";
import { ConnectorError } from "../connector/errors.js";
import { MemoryCandidateSchema, StoreCandidateInputSchema, type MemoryCandidate, type StoreCandidateInput, type CandidateRecallFilter } from "../schema/candidates.js";

/**
 * Same structural guard as self-model/store.ts's assertAllowed: every governed write below
 * takes a GammaDecision as a required parameter and refuses to persist anything unless
 * outcome === "ALLOW". Re-implemented here (3 lines) rather than exporting self-model's
 * private helper, to avoid coupling two otherwise-independent stores over an internal function
 * -- GovernanceRequiredError itself IS reused (see import above) so both stores raise the same
 * error type for the same failure.
 */
function assertAllowed(decision: GammaDecision | undefined): void {
  if (!decision || decision.outcome !== "ALLOW") {
    throw new GovernanceRequiredError(decision ? `${decision.outcome}:${decision.reason}` : "no_decision_provided");
  }
}

type StoredLine = MemoryCandidate & { previousEventHash: string; eventHash: string };

/**
 * File-backed, append-only memory-candidate store. Deliberately mirrors self-model/store.ts's
 * shape (single JSONL file, sha256 hash chain seeded from disk on init so a process restart
 * doesn't reset chain continuity, serialized append queue) rather than inventing a second
 * persistence idiom -- one governed write path, one audit shape, one storage pattern across
 * this runtime.
 *
 * A candidate is written once via writeCandidate; the one status transition this store
 * implements (Step 11) is promoteCandidate, pending -> promoted only, gated by the SAME
 * assertAllowed(decision) guard plus its caller's own human-grant check (server.ts /
 * governance/humanGrant.ts) -- this store has no idea a grant exists, it only ever sees the
 * final GammaDecision, exactly like every other governed write here.
 */
export class CandidateStore {
  private readonly dir: string;
  private readonly path: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "memory");
    this.path = join(this.dir, "candidates.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await writeFile(this.path, "", { flag: "a" });
    const last = await this.readLines();
    const lastLine = last.at(-1);
    this.previousEventHash = lastLine ? lastLine.eventHash : "GENESIS";
  }

  /** Server-owned contract for ONE pending project candidate. No promotion, callback,
   * external dispatch or caller-supplied radius is part of this operation. */
  public async pendingAppendRadius(target: string, payload: unknown): Promise<number | undefined> {
    if (target !== "memory:/candidate") return undefined;
    const parsed = StoreCandidateInputSchema.strict().safeParse(payload);
    if (!parsed.success || parsed.data.scope !== "project") return undefined;
    try {
      const handle = await this.openVerifiedAppend();
      await handle.close();
      return 1;
    } catch { return undefined; }
  }

  private async openVerifiedAppend(): Promise<FileHandle> {
    // Never follow an alias out of the configured store. Refuse oversized/invalid chains
    // instead of treating a read failure as an empty store (readLines has legacy semantics).
    if (await realpath(this.dir) !== resolve(this.dir)) throw new Error("candidate_directory_alias");
    const handle = await open(this.path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      const named = await lstat(this.path);
      if (!stat.isFile() || stat.nlink !== 1 || named.ino !== stat.ino || named.dev !== stat.dev ||
          stat.size > 8 * 1024 * 1024) throw new Error("candidate_store_not_bounded");
      const raw = await handle.readFile("utf8");
      if (raw && !raw.endsWith("\n")) throw new Error("candidate_chain_truncated");
      let previous = "GENESIS";
      for (const line of raw.split("\n").filter(line => line.length > 0)) {
        const value = JSON.parse(line) as StoredLine;
        const { eventHash, previousEventHash, ...record } = value;
        MemoryCandidateSchema.parse(record);
        const actual = createHash("sha256").update(safeJsonStringify({ ...record, previousEventHash })).digest("hex");
        if (previousEventHash !== previous || eventHash !== actual) throw new Error("candidate_chain_invalid");
        previous = eventHash;
      }
      if (previous !== this.previousEventHash) throw new Error("candidate_chain_changed");
      return handle;
    } catch (error) { await handle.close(); throw error; }
  }

  public async writePendingProjectCandidate(
    target: string, payload: unknown,
    meta: { writtenBy: string; taskId: string; runId: string }, decision: GammaDecision
  ): Promise<MemoryCandidate> {
    const input = StoreCandidateInputSchema.strict().parse(payload);
    if (target !== "memory:/candidate" || input.scope !== "project") {
      throw new ConnectorError("candidate_append_out_of_scope", "Only a pending project candidate is supported.", "DENIED");
    }
    return this.writeCandidate(input, meta, decision, true);
  }

  public async writeCandidate(
    input: StoreCandidateInput,
    meta: { writtenBy: string; taskId: string; runId: string },
    decision: GammaDecision,
    verifyBoundedAppend = false
  ): Promise<MemoryCandidate> {
    assertAllowed(decision);
    let result!: MemoryCandidate;
    const operation = this.appendQueue.then(async () => {
      const now = new Date().toISOString();
      const record = MemoryCandidateSchema.parse({
        id: randomUUID(),
        content: input.content,
        candidate_type: input.candidate_type,
        source: input.source,
        scope: input.scope,
        purpose: input.purpose,
        confidence: input.confidence,
        importance: input.importance,
        status: "pending",
        createdAt: now,
        writtenAt: now,
        writtenBy: meta.writtenBy,
        taskId: meta.taskId,
        runId: meta.runId
      });
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const hash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      const line: StoredLine = { ...record, previousEventHash: this.previousEventHash, eventHash: hash };
      if (verifyBoundedAppend) {
        const handle = await this.openVerifiedAppend();
        try { await handle.appendFile(`${safeJsonStringify(line)}\n`, "utf8"); }
        finally { await handle.close(); }
      } else {
        await appendFile(this.path, `${safeJsonStringify(line)}\n`, { encoding: "utf8" });
      }
      this.previousEventHash = hash;
      result = record;
    });
    this.appendQueue = operation.catch(() => undefined);
    await operation;
    return result;
  }

  /**
   * Promotes an existing "pending" candidate to "promoted" -- the only status transition this
   * store implements. Appends a new chained line (id preserved, content/type/source/scope/
   * purpose/confidence/importance and the original createdAt copied verbatim -- promotion never
   * alters what the candidate says, only its status); nothing is ever overwritten or deleted, so
   * this is reversible/recoverable by construction (the full prior history, including the
   * original "pending" line, stays on disk and readable).
   *
   * The existence-and-pending check and the append itself run inside the SAME appendQueue
   * closure so two concurrent promote attempts for the same id cannot both observe "pending" and
   * both append a second "promoted" line -- the queue serializes them, exactly like every other
   * write this store performs. Cross-process concurrent writers to the same NYXA_DATA_DIR are
   * already excluded by WriterLock (see audit/WriterLock.js), so single-process serialization
   * here is sufficient, matching this store's existing concurrency model.
   *
   * This method has no knowledge of any human-grant mechanism -- it only ever sees the final
   * GammaDecision, identical to writeCandidate. The grant check itself lives one layer up, in the
   * caller (see server.ts's executePromoteCandidate / governance/humanGrant.ts).
   */
  public async promoteCandidate(
    id: string,
    meta: { writtenBy: string; taskId: string; runId: string },
    decision: GammaDecision
  ): Promise<MemoryCandidate> {
    assertAllowed(decision);
    let result: MemoryCandidate | undefined;
    let failure: ConnectorError | undefined;
    this.appendQueue = this.appendQueue.then(async () => {
      const lines = await this.readLines();
      const current = lines.filter((line) => line.id === id).at(-1);
      if (!current) {
        failure = new ConnectorError("candidate_not_found", "No candidate exists with this id.", "DENIED");
        return;
      }
      if (current.status !== "pending") {
        failure = new ConnectorError(
          "candidate_not_promotable",
          `Candidate status is '${current.status}', not 'pending'.`,
          "DENIED"
        );
        return;
      }
      const now = new Date().toISOString();
      const record = MemoryCandidateSchema.parse({
        id: current.id,
        content: current.content,
        candidate_type: current.candidate_type,
        source: current.source,
        scope: current.scope,
        purpose: current.purpose,
        confidence: current.confidence,
        importance: current.importance,
        status: "promoted",
        createdAt: current.createdAt,
        writtenAt: now,
        writtenBy: meta.writtenBy,
        taskId: meta.taskId,
        runId: meta.runId
      });
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const hash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      const line: StoredLine = { ...record, previousEventHash: this.previousEventHash, eventHash: hash };
      await appendFile(this.path, `${safeJsonStringify(line)}\n`, { encoding: "utf8" });
      this.previousEventHash = hash;
      result = record;
    });
    await this.appendQueue;
    if (failure) throw failure;
    return result!;
  }

  /** Latest known state of one candidate by id (the last line with that id), or undefined if
   *  none exists. I0 -- always safe, never governed; used both by nyxa_memory_recall_candidates
   *  -adjacent reads and by the human-grant issuance path to confirm a target candidate is real
   *  and still "pending" before ever issuing a grant for it. */
  public async getLatestCandidate(id: string): Promise<MemoryCandidate | undefined> {
    const lines = await this.readLines();
    const last = lines.filter((line) => line.id === id).at(-1);
    if (!last) return undefined;
    const { previousEventHash, eventHash, ...record } = last;
    return record;
  }

  // ---- reads (I0 -- always safe, never governed) ----

  public async recallCandidates(filter: CandidateRecallFilter): Promise<MemoryCandidate[]> {
    const lines = await this.readLines();
    let filtered = lines;
    if (filter.status) {
      filtered = filtered.filter((c) => c.status === filter.status);
    }
    if (filter.candidateType) {
      filtered = filtered.filter((c) => c.candidate_type === filter.candidateType);
    }
    return filtered
      .slice(-filter.limit)
      .reverse()
      .map(({ previousEventHash, eventHash, ...record }) => record);
  }

  private async readLines(): Promise<StoredLine[]> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StoredLine);
  }
}
