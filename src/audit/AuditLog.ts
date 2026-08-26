import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEvent } from "../schema/audit.js";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

export class AuditLog {
  private readonly filePath: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly dataDir: string) {
    this.filePath = join(this.dataDir, "audit.log.jsonl");
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

  public async append(event: AuditEvent): Promise<void> {
    this.appendQueue = this.appendQueue.then(async () => {
      try {
        const chained: AuditEvent = { ...event, previous_event_hash: this.previousEventHash };
        const material = safeJsonStringify(chained);
        chained.event_hash = createHash("sha256").update(material).digest("hex");
        await appendFile(this.filePath, `${safeJsonStringify(chained)}\n`, { encoding: "utf8" });
        this.previousEventHash = chained.event_hash;
      } catch {
        console.error("audit_append_failed");
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
