import { createHash, randomUUID } from "node:crypto";
import { open, realpath, lstat, type FileHandle } from "node:fs/promises";
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
  private initialized = false;
  private integrityFault: ConnectorError | null = null;

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "memory");
    this.path = join(this.dir, "candidates.jsonl");
  }

  private fault(code: string): ConnectorError {
    return new ConnectorError(code, "Candidate store integrity check failed.", "INVALID");
  }

  /** A rejected operation rejects its caller, never poisons subsequent queue scheduling. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.appendQueue.then(async () => {
      if (!this.initialized) throw this.fault("candidate_store_not_initialized");
      if (this.integrityFault) throw this.integrityFault;
      return task();
    });
    this.appendQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    await ensureDir(this.dir);
    if (await realpath(this.dir) !== resolve(this.dir)) throw this.fault("candidate_directory_alias");
    // Exclusive creation prevents following an existing symlink on initialization.
    try {
      const fresh = await open(
        this.path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
      await fresh.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const lines = await this.readLines();
    this.previousEventHash = lines.at(-1)?.eventHash ?? "GENESIS";
    this.initialized = true;
  }

  private async openCheckedHandle(flags: number): Promise<FileHandle> {
    if (await realpath(this.dir) !== resolve(this.dir)) throw this.fault("candidate_directory_alias");
    let handle: FileHandle;
    try {
      handle = await open(this.path, flags | constants.O_NOFOLLOW);
    } catch {
      throw this.fault("candidate_store_unreadable");
    }
    try {
      const stat = await handle.stat();
      const named = await lstat(this.path);
      if (!stat.isFile() || stat.nlink !== 1 || stat.ino !== named.ino ||
          stat.dev !== named.dev || stat.size > 8 * 1024 * 1024) {
        throw this.fault("candidate_store_not_bounded");
      }
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /** Read from fixed offsets, not the mutable FileHandle cursor. Never accept truncated JSONL. */
  private async verifyHandle(handle: FileHandle, expectCurrentTip: boolean): Promise<{
    lines: StoredLine[]; tip: string; size: number
  }> {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 8 * 1024 * 1024) {
      throw this.fault("candidate_store_not_bounded");
    }
    const buffer = Buffer.alloc(before.size);
    let position = 0;
    try {
      while (position < buffer.length) {
        const { bytesRead } = await handle.read(buffer, position, buffer.length - position, position);
        if (bytesRead === 0) throw this.fault("candidate_store_changed_during_verify");
        position += bytesRead;
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw this.fault("candidate_store_unreadable");
    }
    const after = await handle.stat();
    const namedAfter = await lstat(this.path);
    if (after.size !== before.size || after.ino !== before.ino || after.dev !== before.dev ||
        namedAfter.ino !== after.ino || namedAfter.dev !== after.dev || after.nlink !== 1) {
      throw this.fault("candidate_store_changed_during_verify");
    }
    const raw = buffer.toString("utf8");
    if (raw && !raw.endsWith("\n")) throw this.fault("candidate_chain_truncated");
    const lines: StoredLine[] = [];
    let previous = "GENESIS";
    for (const text of raw.split("\n").filter(Boolean)) {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw this.fault("candidate_chain_invalid"); }
      if (!parsed || typeof parsed !== "object") throw this.fault("candidate_chain_invalid");
      const value = parsed as StoredLine;
      const { eventHash, previousEventHash, ...record } = value;
      if (!MemoryCandidateSchema.safeParse(record).success ||
          typeof eventHash !== "string" || typeof previousEventHash !== "string") {
        throw this.fault("candidate_chain_invalid");
      }
      const actual = createHash("sha256")
        .update(safeJsonStringify({ ...record, previousEventHash })).digest("hex");
      if (previousEventHash !== previous || eventHash !== actual) {
        throw this.fault("candidate_chain_invalid");
      }
      lines.push(value);
      previous = eventHash;
    }
    if (expectCurrentTip && previous !== this.previousEventHash) {
      throw this.fault("candidate_chain_changed");
    }
    return { lines, tip: previous, size: before.size };
  }

  private async readLines(): Promise<StoredLine[]> {
    const handle = await this.openCheckedHandle(constants.O_RDONLY);
    try {
      return (await this.verifyHandle(handle, this.initialized)).lines;
    } finally {
      await handle.close();
    }
  }

  private async openVerifiedAppend(): Promise<FileHandle> {
    const handle = await this.openCheckedHandle(constants.O_RDWR | constants.O_APPEND);
    try {
      await this.verifyHandle(handle, this.initialized);
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  /**
   * A failed append can be retried only when disk state is verified unchanged.
   * Partial or ambiguous commits permanently hold this instance fail-closed.
   * Recovery requires an explicit inspection/restart, never automatic replay.
   */
  private async appendVerified(line: StoredLine): Promise<void> {
    const handle = await this.openVerifiedAppend();
    const before = await handle.stat();
    const previousTip = this.previousEventHash;
    try {
      try {
        await handle.appendFile(safeJsonStringify(line) + "\n", "utf8");
        await handle.sync();
        // Positive effect check: the opened inode must still be the named store,
        // and the fully persisted chain must end in the just-written event.
        const committed = await this.verifyHandle(handle, false);
        if (committed.tip !== line.eventHash) {
          throw this.fault("candidate_commit_uncertain");
        }
        this.previousEventHash = line.eventHash;
      } catch (error) {
        let unchanged = false;
        try {
          const current = await this.verifyHandle(handle, false);
          unchanged = current.size === before.size && current.tip === previousTip;
        } catch {
          // Verification itself failed: the append outcome is unknowable.
        }
        if (!unchanged) {
          this.integrityFault = this.fault("candidate_commit_uncertain");
          throw this.integrityFault;
        }
        throw error;
      }
    } finally {
      try {
        await handle.close();
      } catch {
        this.integrityFault = this.fault("candidate_commit_uncertain");
        throw this.integrityFault;
      }
    }
  }

  /** Server-owned contract for one pending PROJECT candidate, never authority. */
  public async pendingAppendRadius(target: string, payload: unknown): Promise<number | undefined> {
    if (target !== "memory:/candidate") return undefined;
    const parsed = StoreCandidateInputSchema.strict().safeParse(payload);
    if (!parsed.success || parsed.data.scope !== "project") return undefined;
    try {
      return await this.enqueue(async () => {
        const handle = await this.openVerifiedAppend();
        await handle.close();
        return 1;
      });
    } catch {
      return undefined;
    }
  }

  public async writePendingProjectCandidate(
    target: string, payload: unknown,
    meta: { writtenBy: string; taskId: string; runId: string }, decision: GammaDecision
  ): Promise<MemoryCandidate> {
    const input = StoreCandidateInputSchema.strict().parse(payload);
    if (target !== "memory:/candidate" || input.scope !== "project") {
      throw new ConnectorError("candidate_append_out_of_scope",
        "Only a pending project candidate is supported.", "DENIED");
    }
    return this.writeCandidate(input, meta, decision, true);
  }

  public async writeCandidate(
    input: StoreCandidateInput,
    meta: { writtenBy: string; taskId: string; runId: string },
    decision: GammaDecision,
    _verifyBoundedAppend = false
  ): Promise<MemoryCandidate> {
    assertAllowed(decision);
    return this.enqueue(async () => {
      const now = new Date().toISOString();
      const record = MemoryCandidateSchema.parse({
        id: randomUUID(), content: input.content, candidate_type: input.candidate_type,
        source: input.source, scope: input.scope, purpose: input.purpose,
        confidence: input.confidence, importance: input.importance, status: "pending",
        createdAt: now, writtenAt: now, writtenBy: meta.writtenBy,
        taskId: meta.taskId, runId: meta.runId
      });
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const eventHash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      await this.appendVerified({ ...chained, eventHash });
      return record;
    });
  }

  public async promoteCandidate(
    id: string,
    meta: { writtenBy: string; taskId: string; runId: string },
    decision: GammaDecision
  ): Promise<MemoryCandidate> {
    assertAllowed(decision);
    return this.enqueue(async () => {
      const lines = await this.readLines();
      const current = lines.filter(line => line.id === id).at(-1);
      if (!current) throw new ConnectorError("candidate_not_found", "No candidate exists with this id.", "DENIED");
      if (current.status !== "pending") {
        throw new ConnectorError("candidate_not_promotable",
          "Candidate status is '" + current.status + "', not 'pending'.", "DENIED");
      }
      const record = MemoryCandidateSchema.parse({
        id: current.id, content: current.content, candidate_type: current.candidate_type,
        source: current.source, scope: current.scope, purpose: current.purpose,
        confidence: current.confidence, importance: current.importance, status: "promoted",
        createdAt: current.createdAt, writtenAt: new Date().toISOString(),
        writtenBy: meta.writtenBy, taskId: meta.taskId, runId: meta.runId
      });
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const eventHash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      await this.appendVerified({ ...chained, eventHash });
      return record;
    });
  }

  public async getLatestCandidate(id: string): Promise<MemoryCandidate | undefined> {
    return this.enqueue(async () => {
      const last = (await this.readLines()).filter(line => line.id === id).at(-1);
      if (!last) return undefined;
      const { previousEventHash, eventHash, ...record } = last;
      return record;
    });
  }

  public async recallCandidates(filter: CandidateRecallFilter): Promise<MemoryCandidate[]> {
    return this.enqueue(async () => {
      const lines = await this.readLines();
      const seen = new Set<string>();
      const result: MemoryCandidate[] = [];
      // Select current state per ID first; status filter must not surface historical PENDING.
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!;
        if (seen.has(line.id)) continue;
        seen.add(line.id);
        if (filter.status && line.status !== filter.status) continue;
        if (filter.candidateType && line.candidate_type !== filter.candidateType) continue;
        const { previousEventHash, eventHash, ...record } = line;
        result.push(record);
        if (result.length >= filter.limit) break;
      }
      return result;
    });
  }
}
