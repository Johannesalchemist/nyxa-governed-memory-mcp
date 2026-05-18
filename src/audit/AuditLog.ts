import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditEvent } from "../schema/audit.js";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

export class AuditLog {
  private readonly filePath: string;

  public constructor(private readonly dataDir: string) {
    this.filePath = join(this.dataDir, "audit.log.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dataDir);

    try {
      await writeFile(this.filePath, "", { flag: "a" });
    } catch {
      throw new Error("audit_log_init_failed");
    }
  }

  public async append(event: AuditEvent): Promise<void> {
    try {
      const line = `${safeJsonStringify(event)}\n`;
      await appendFile(this.filePath, line, { encoding: "utf8" });
    } catch {
      // Never leak raw append failures to tool output.
      console.error("audit_append_failed");
    }
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
}
