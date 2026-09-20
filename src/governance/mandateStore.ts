import { randomUUID, createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

export type MandateRecord = {
  mandateId: string;
  actor: string;
  action: string;
  scopePrefix?: string;
  targetPrefix?: string;
  issuedAt: string;
  expiresAt: string;
  maxExecutionsPerWindow?: number;
  maxEffectUnitsPerWindow?: number;
  issuedBy: { authorityPrincipalId: string; authorityMethod: string };
};

type MandateEvent =
  | { type: "ISSUE"; mandate: MandateRecord; at: string }
  | { type: "REVOKE"; mandateId: string; at: string; reason: string };

type StoredEvent = MandateEvent & { previousEventHash: string; eventHash: string };
export class MandateStore {
  private readonly dir: string;
  private readonly ledgerPath: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "mandates");
    this.ledgerPath = join(this.dir, "mandates.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await writeFile(this.ledgerPath, "", { flag: "a" });
    const events = await this.readEvents();
    this.previousEventHash = events.at(-1)?.eventHash ?? "GENESIS";
  }

  public async issue(input: Omit<MandateRecord, "mandateId" | "issuedAt" | "expiresAt"> & { ttlSeconds: number }): Promise<MandateRecord> {
    const now = Date.now();
    const mandate: MandateRecord = {
      mandateId: randomUUID(), actor: input.actor, action: input.action,
      ...(input.scopePrefix ? { scopePrefix: input.scopePrefix } : {}),
      ...(input.targetPrefix ? { targetPrefix: input.targetPrefix } : {}),
      issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + input.ttlSeconds * 1000).toISOString(),
      ...(input.maxExecutionsPerWindow ? { maxExecutionsPerWindow: input.maxExecutionsPerWindow } : {}),
      ...(input.maxEffectUnitsPerWindow ? { maxEffectUnitsPerWindow: input.maxEffectUnitsPerWindow } : {}),
      issuedBy: input.issuedBy
    };
    await this.append({ type: "ISSUE", mandate, at: mandate.issuedAt });
    return mandate;
  }
  public async revoke(mandateId: string, reason: string): Promise<void> {
    await this.append({ type: "REVOKE", mandateId, reason, at: new Date().toISOString() });
  }

  public async list(now = Date.now()): Promise<Array<MandateRecord & { revoked: boolean; active: boolean }>> {
    const events = await this.readEvents();
    const revoked = new Set(events.filter((e) => e.type === "REVOKE").map((e) => e.mandateId));
    return events.filter((e): e is Extract<StoredEvent, { type: "ISSUE" }> => e.type === "ISSUE").map((e) => ({
      ...e.mandate,
      revoked: revoked.has(e.mandate.mandateId),
      active: !revoked.has(e.mandate.mandateId) && Date.parse(e.mandate.expiresAt) > now
    }));
  }

  public async resolve(actor: string, action: string, scope: string, target: string, now = Date.now()): Promise<MandateRecord | undefined> {
    const all = await this.list(now);
    return all.find((m) => m.active && m.actor === actor && m.action === action &&
      (!m.scopePrefix || scope.startsWith(m.scopePrefix)) && (!m.targetPrefix || target.startsWith(m.targetPrefix)));
  }

  private async append(event: MandateEvent): Promise<void> {
    this.appendQueue = this.appendQueue.then(async () => {
      const chained = { ...event, previousEventHash: this.previousEventHash };
      const eventHash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      await appendFile(this.ledgerPath, `${safeJsonStringify({ ...chained, eventHash })}\n`, "utf8");
      this.previousEventHash = eventHash;
    });
    await this.appendQueue;
  }

  private async readEvents(): Promise<StoredEvent[]> {
    try {
      const raw = await readFile(this.ledgerPath, "utf8");
      return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as StoredEvent);
    } catch { return []; }
  }
}
