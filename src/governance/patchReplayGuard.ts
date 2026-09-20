import { createHash } from "node:crypto";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

/**
 * Declarative, effect-level replay protection for nyxa_apply_patch. Distinct from
 * ReplayGuard (governance/replayGuard.ts) in one deliberate way: ReplayGuard marks BEFORE
 * execution and never un-marks, which is correct for propose_action (an occasional lost
 * legitimate retry after a crash is acceptable there) but wrong here -- a failed or
 * rolled-back patch attempt must remain retryable under the SAME effect id (a
 * failed-then-corrected legitimate retry must not be falsely blocked), while an actually
 * SUCCEEDED effect must never be re-mutated by a later identical request.
 *
 * Reuses the same proven primitive as ReplayGuard/WriterLock/the arbeitsbahnhof nonce file:
 * atomic exclusive file creation (open(path, "wx")), which the OS guarantees is race-free
 * across processes -- no new event system, just the same marker-file pattern applied with
 * a commit-only-on-success rule.
 *
 * Two marker kinds per effect id, both scoped under one data directory (never shared across
 * NYXA_DATA_DIR values, same convention as every other per-data-dir guard):
 *   - "<id>.inflight"  -- claimed via open(wx) before the real git apply/test runs; acts as a
 *     mutex. Exactly one concurrent identical request can hold it; a second, truly parallel,
 *     identical request is denied outright (no queueing) rather than silently allowed to wait
 *     and reuse someone else's result -- "at most one mutation" is enforced by construction,
 *     not by hoping the loser gives up. See STALE RECLAIM below for what happens if the
 *     holder crashes instead of releasing normally.
 *   - "<id>.completed" -- written ONLY after the real mutation is confirmed successful (never
 *     for a failed/rolled-back attempt). Its presence is the sole source of truth for "this
 *     exact effect already happened"; a later identical request short-circuits entirely
 *     before touching git, returning the stored result instead of re-mutating.
 *
 * Full design rationale, state machine and threat model: docs/PATCH_REPLAY_GUARD.md.
 */

// How long an .inflight marker must be untouched, AND its recorded owner pid must be
// confirmed dead, before it may be reclaimed. Deliberately NOT copied from AuditLog's
// 30-second lock-staleness window: that lock guards a sub-millisecond in-memory critical
// section (read one line, hash, append), so 30s is already generous. A patch effect is a
// full git status + git apply --check + git apply + a full nyxa_run_test post-patch run,
// each individually boundable up to the connector config's own schema maxima (toolTimeoutMs
// up to 300_000ms, used three times across status/apply/diff; the post-patch test's own
// timeoutMs up to 300_000ms) -- a theoretical worst case near 20 minutes with a maximally
// permissive config. 30 minutes is set with headroom above that theoretical ceiling, not
// against an assumed typical duration.
const INFLIGHT_STALE_MS = 30 * 60 * 1000;

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 sends nothing; it only checks existence + permission. Both this process and
    // every other nyxa_apply_patch caller always run as the same service account, so a
    // still-alive owner always resolves true and a dead one always resolves ESRCH -- there is
    // no cross-user ambiguity in this deployment's single-account model.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM would mean "exists, but a different user" -- cannot happen in this single-account
    // deployment, but treated conservatively as "alive" rather than assumed away.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

type InflightMarker = {
  effectId: string;
  claimedAt: string;
  pid: number;
};

function isWellFormedInflightMarker(value: unknown, expectedEffectId: string): value is InflightMarker {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.effectId !== expectedEffectId) return false;
  if (typeof candidate.claimedAt !== "string" || Number.isNaN(Date.parse(candidate.claimedAt))) return false;
  if (typeof candidate.pid !== "number" || !Number.isInteger(candidate.pid) || candidate.pid <= 0) return false;
  return true;
}

export type PatchEffectRecord = {
  effectId: string;
  completedAt: string;
  result: unknown;
};

export class PatchReplayGuardStorageError extends Error {
  public readonly detail: unknown;

  public constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "PatchReplayGuardStorageError";
    this.detail = detail;
  }
}

export class PatchReplayGuard {
  private readonly dir: string;

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "patch-replay-guard");
  }

  /**
   * Canonical, structurally unambiguous effect identity. A prior implementation built the
   * hash input via `[repositoryId, relativePath, patch].join(" ")`, a plain space-joined
   * concatenation of three variable-length, partially attacker-influenceable strings: two
   * different (relativePath, patch) tuples can concatenate to the identical byte string
   * (e.g. relativePath="a", patch="b c" vs relativePath="a b", patch="c" both join to
   * "a b c"), which could make an unrelated patch effect be misidentified as an
   * already-completed one. JSON-encoding the three fields as named object properties before
   * hashing eliminates this: JSON string escaping makes field boundaries unambiguous, so two
   * different tuples can only ever collide via an actual SHA-256 collision, never via a
   * concatenation ambiguity. repositoryId is additionally charset-restricted upstream
   * (config.ts identifier regex, no spaces or quotes possible), so only relativePath and
   * patch needed this fix -- but all three are encoded the same way for one uniform,
   * reviewable construction rather than mixing safe and unsafe cases.
   */
  public effectId(repositoryId: string, relativePath: string, patch: string): string {
    const material = safeJsonStringify({ repositoryId, relativePath, patch });
    return createHash("sha256").update(material).digest("hex");
  }

  private inflightPath(effectId: string): string {
    return join(this.dir, `${effectId}.inflight`);
  }

  private completedPath(effectId: string): string {
    return join(this.dir, `${effectId}.completed`);
  }

  public async checkCompleted(effectId: string): Promise<PatchEffectRecord | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.completedPath(effectId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new PatchReplayGuardStorageError("patch_replay_completed_read_failed", error);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      // A malformed completed marker is ambiguous evidence: it might mean the effect
      // genuinely succeeded (and re-running would double-mutate) or that storage is
      // corrupted. Fail closed by refusing to proceed either way, rather than guessing
      // "not completed" and risking a second real mutation.
      throw new PatchReplayGuardStorageError("patch_replay_completed_marker_malformed", error);
    }
    const record = parsed as Partial<PatchEffectRecord>;
    if (record.effectId !== effectId || typeof record.completedAt !== "string" || !("result" in record)) {
      throw new PatchReplayGuardStorageError("patch_replay_completed_marker_malformed");
    }
    return record as PatchEffectRecord;
  }

  /**
   * Returns true if this call claimed the in-flight lock; false if another request already
   * holds it (a genuinely concurrent duplicate, or one not yet recognized as stale).
   *
   * Reclaim (STALE RECLAIM): if the existing marker's age exceeds INFLIGHT_STALE_MS AND its
   * recorded owner pid is confirmed dead, the marker is treated as an orphan left by a
   * process that crashed between claiming and releasing (the only case that could otherwise
   * cause a permanent denial-of-service on legitimate future retries). Both conditions are
   * required, not either alone: pid-liveness alone is vulnerable to pid reuse (this host runs
   * many short-lived subprocesses, so pid recycling within minutes is plausible); age alone
   * would risk reclaiming a still-running, merely slow effect out from under its real owner.
   * Requiring both narrows the reclaim window to "almost certainly a real crash, and long
   * enough that no legitimate effect could still be genuinely running."
   *
   * The reclaim itself is race-safe against a second process reaching the same conclusion at
   * the same time: unlink the verified-stale marker, then retry the atomic create exactly
   * once. Atomic O_EXCL creation is race-free at the OS level, so if two processes both judge
   * the same marker stale and both try to reclaim it, only one retry-create can win; the
   * loser sees EEXIST again and fails closed (denied) rather than looping or guessing --
   * mirroring the same verify-then-retry-once-then-fail-closed shape WriterLock uses for its
   * own reclaim, adapted here to a file-content staleness signal instead of a live socket
   * probe, since this guards a bounded operation inside a long-lived process rather than the
   * process's own entire lifetime.
   *
   * Fails closed (denies, without reclaiming) on: a marker that fails to parse as JSON, a
   * marker missing or mistyping any required field, or a marker whose effectId does not match
   * the one being claimed (path/content inconsistency) -- ambiguous on-disk state is never
   * silently overwritten.
   */
  public async claimInFlight(effectId: string): Promise<boolean> {
    await ensureDir(this.dir);
    if (await this.tryCreateInflightMarker(effectId)) return true;

    const path = this.inflightPath(effectId);
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Vanished between our failed create and this read (the holder released it, or a
        // concurrent reclaim already ran). Do not loop indefinitely chasing a moving target;
        // one bounded retry is enough to pick up the now-clear (or freshly re-claimed) state.
        return await this.tryCreateInflightMarker(effectId);
      }
      throw new PatchReplayGuardStorageError("patch_replay_inflight_read_failed", error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false; // malformed marker: fail closed, never reclaim ambiguous state
    }
    if (!isWellFormedInflightMarker(parsed, effectId)) return false; // fail closed, same reason

    const ageMs = Date.now() - Date.parse(parsed.claimedAt);
    const ownerAlive = isPidAlive(parsed.pid);
    if (ageMs <= INFLIGHT_STALE_MS || ownerAlive) return false; // still live or not yet stale

    await unlink(path).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new PatchReplayGuardStorageError("patch_replay_inflight_reclaim_unlink_failed", error);
      }
    });
    return await this.tryCreateInflightMarker(effectId);
  }

  private async tryCreateInflightMarker(effectId: string): Promise<boolean> {
    const marker: InflightMarker = { effectId, claimedAt: new Date().toISOString(), pid: process.pid };
    try {
      const handle = await open(this.inflightPath(effectId), "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(marker));
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw new PatchReplayGuardStorageError("patch_replay_inflight_claim_failed", error);
    }
  }

  public async releaseInFlight(effectId: string): Promise<void> {
    await unlink(this.inflightPath(effectId)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new PatchReplayGuardStorageError("patch_replay_inflight_release_failed", error);
      }
    });
  }

  /** Called only after the real mutation is confirmed successful. Atomic write-then-rename so a reader never observes a partial file. */
  public async commitCompleted(effectId: string, result: unknown): Promise<void> {
    await ensureDir(this.dir);
    const record: PatchEffectRecord = { effectId, completedAt: new Date().toISOString(), result };
    const finalPath = this.completedPath(effectId);
    const tmpPath = join(this.dir, `.${effectId}.${randomUUID()}.tmp`);
    try {
      await writeFile(tmpPath, JSON.stringify(record), { mode: 0o600 });
      await rename(tmpPath, finalPath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw new PatchReplayGuardStorageError("patch_replay_completed_commit_failed", error);
    }
  }
}
