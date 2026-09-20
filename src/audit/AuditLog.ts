import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile, open, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEvent } from "../schema/audit.js";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

// A lock older than this is assumed to belong to a crashed/killed holder, never a live
// one: a real critical section here (read last line + hash + append) is sub-millisecond,
// so this window is deliberately generous -- it exists only to bound how long a dead
// process's lock can block everyone else, not to compete with real holders.
const LOCK_STALE_MS = 30_000;
const LOCK_ACQUIRE_TIMEOUT_MS = 10_000;
const LOCK_RETRY_MIN_MS = 15;
const LOCK_RETRY_MAX_MS = 45;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AuditLog {
  private readonly filePath: string;
  private readonly lockPath: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly dataDir: string) {
    this.filePath = join(this.dataDir, "audit.log.jsonl");
    this.lockPath = `${this.filePath}.lock`;
  }

  public async init(): Promise<void> {
    await ensureDir(this.dataDir);

    try {
      await writeFile(this.filePath, "", { flag: "a" });
      const events = await this.recent(1);
      this.previousEventHash = events[0]?.event_hash ?? "GENESIS";
    } catch {
      throw new Error("audit_log_init_failed");
    }
  }

  /**
   * Cross-process exclusive lock. The thing multiple separate `node dist/index.js`
   * processes (systemd instance, per-bridge-session children, ad hoc runs) actually
   * share is the filesystem, never this class's in-memory state -- so the lock itself
   * must be a filesystem object, acquired via an atomic exclusive create (open "wx",
   * which fails with EEXIST if another process already holds it). A stale lock (see
   * LOCK_STALE_MS) is reclaimed instead of blocking forever on a crashed holder.
   */
  private async acquireLock(): Promise<void> {
    const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
    for (;;) {
      try {
        const handle = await open(this.lockPath, "wx", 0o600);
        await handle.writeFile(`${process.pid}:${Date.now()}`);
        await handle.close();
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const info = await stat(this.lockPath);
          if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
            await unlink(this.lockPath).catch(() => {});
            continue;
          }
        } catch {
          continue; // lock vanished between the failed open and this stat -- retry now
        }
        if (Date.now() > deadline) throw new Error("audit_lock_timeout");
        await sleep(LOCK_RETRY_MIN_MS + Math.random() * (LOCK_RETRY_MAX_MS - LOCK_RETRY_MIN_MS));
      }
    }
  }

  private async releaseLock(): Promise<void> {
    await unlink(this.lockPath).catch(() => {});
  }

  public async append(event: AuditEvent): Promise<void> {
    this.appendQueue = this.appendQueue.then(async () => {
      let locked = false;
      try {
        await this.acquireLock();
        locked = true;
        // Authoritative head is whatever is actually on disk right now, read fresh
        // under the cross-process lock -- never the in-memory previousEventHash, which
        // only reflects this process's own last write and goes stale the moment any
        // other process appends. In-process ordering (appendQueue) alone is not enough
        // once more than one process can hold the file open, which is the normal case
        // here (systemd instance + per-session bridge children + ad hoc runs).
        const onDisk = await this.recent(1);
        const head = onDisk[0]?.event_hash ?? "GENESIS";
        const chained: AuditEvent = { ...event, previous_event_hash: head };
        const material = safeJsonStringify(chained);
        chained.event_hash = createHash("sha256").update(material).digest("hex");
        await appendFile(this.filePath, `${safeJsonStringify(chained)}\n`, { encoding: "utf8" });
        this.previousEventHash = chained.event_hash;
      } catch {
        console.error("audit_append_failed");
      } finally {
        if (locked) await this.releaseLock();
      }
    });
    await this.appendQueue;
  }

  public async recent(limit: number): Promise<AuditEvent[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      const recentLines = lines.slice(-limit);

      const events: AuditEvent[] = [];
      for (const line of recentLines) {
        try {
          events.push(JSON.parse(line) as AuditEvent);
        } catch {
          // Skip malformed line, keep deterministic behavior.
        }
      }

      return events;
    } catch {
      return [];
    }
  }

  public async verifyIntegrity(): Promise<{ valid: boolean; checked: number; reason?: string }> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      let previous = "GENESIS";
      for (let index = 0; index < lines.length; index += 1) {
        const event = JSON.parse(lines[index]!) as AuditEvent;
        const eventHash = event.event_hash;
        const previousEventHash = event.previous_event_hash;
        if (!eventHash || !previousEventHash) {
          previous = "GENESIS";
          continue;
        }
        if (previousEventHash !== previous) return { valid: false, checked: index, reason: "previous_hash_mismatch" };
        const withoutHash = { ...event };
        delete withoutHash.event_hash;
        const expected = createHash("sha256").update(safeJsonStringify(withoutHash)).digest("hex");
        if (expected !== eventHash) return { valid: false, checked: index, reason: "event_hash_mismatch" };
        previous = eventHash;
      }
      return { valid: true, checked: lines.length };
    } catch {
      return { valid: false, checked: 0, reason: "audit_read_failed" };
    }
  }
}
