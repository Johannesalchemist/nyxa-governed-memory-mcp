import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  lstat,
  open,
  readFile,
  realpath,
  writeFile,
  type FileHandle
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";
import type { GammaDecision } from "../governance/gamma.js";
import { GovernanceRequiredError } from "../self-model/store.js";
import {
  AuditObservationInputSchema,
  AuditObservationSchema,
  type AuditObservation,
  type AuditObservationInput
} from "../schema/companyAudit.js";

function assertAllowed(decision: GammaDecision | undefined): void {
  if (!decision || decision.outcome !== "ALLOW") {
    throw new GovernanceRequiredError(
      decision ? `${decision.outcome}:${decision.reason}` : "no_decision_provided"
    );
  }
}

type StoredLine = AuditObservation & {
  previousEventHash: string;
  eventHash: string;
};

export class CompanyAuditStore {
  private readonly dir: string;
  private readonly path: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "company-audit");
    this.path = join(this.dir, "observations.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await writeFile(this.path, "", { flag: "a" });
    const lines = await this.readLines();
    const last = lines.at(-1);
    this.previousEventHash = last?.eventHash ?? "GENESIS";
  }

  public async observationAppendRadius(
    target: string,
    payload: unknown
  ): Promise<number | undefined> {
    const parsed = AuditObservationInputSchema.safeParse(payload);
    if (!parsed.success) return undefined;
    if (target !== `company-audit:/${parsed.data.audit_id}`) return undefined;

    try {
      const handle = await this.openVerifiedAppend();
      await handle.close();
      return 1;
    } catch {
      return undefined;
    }
  }

  public async writeObservation(
    target: string,
    payload: unknown,
    meta: { writtenBy: string; taskId: string; runId: string },
    decision: GammaDecision
  ): Promise<AuditObservation> {
    assertAllowed(decision);

    const input = AuditObservationInputSchema.parse(payload);

    if (target !== `company-audit:/${input.audit_id}`) {
      throw new Error("company_audit_target_mismatch");
    }

    let result!: AuditObservation;

    const operation = this.appendQueue.then(async () => {
      const now = new Date().toISOString();

      const record = AuditObservationSchema.parse({
        ...input,
        id: randomUUID(),
        writtenAt: now,
        writtenBy: meta.writtenBy,
        taskId: meta.taskId,
        runId: meta.runId
      });

      const chained = {
        ...record,
        previousEventHash: this.previousEventHash
      };

      const eventHash = createHash("sha256")
        .update(safeJsonStringify(chained))
        .digest("hex");

      const line: StoredLine = {
        ...record,
        previousEventHash: this.previousEventHash,
        eventHash
      };

      const handle = await this.openVerifiedAppend();
      try {
        await handle.appendFile(`${safeJsonStringify(line)}\n`, "utf8");
      } finally {
        await handle.close();
      }

      this.previousEventHash = eventHash;
      result = record;
    });

    this.appendQueue = operation.catch(() => undefined);
    await operation;
    return result;
  }

  public async readAudit(auditId: string): Promise<AuditObservation[]> {
    const lines = await this.readLines();

    return lines
      .filter(line => line.audit_id === auditId)
      .map(({ previousEventHash, eventHash, ...record }) => record);
  }

  private async openVerifiedAppend(): Promise<FileHandle> {
    if (await realpath(this.dir) !== resolve(this.dir)) {
      throw new Error("company_audit_directory_alias");
    }

    const handle = await open(
      this.path,
      constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW
    );

    try {
      const stat = await handle.stat();
      const named = await lstat(this.path);

      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        named.ino !== stat.ino ||
        named.dev !== stat.dev ||
        stat.size > 32 * 1024 * 1024
      ) {
        throw new Error("company_audit_store_not_bounded");
      }

      const raw = await handle.readFile("utf8");

      if (raw && !raw.endsWith("\n")) {
        throw new Error("company_audit_chain_truncated");
      }

      let previous = "GENESIS";

      for (const line of raw.split("\n").filter(Boolean)) {
        const value = JSON.parse(line) as StoredLine;
        const { eventHash, previousEventHash, ...record } = value;

        AuditObservationSchema.parse(record);

        const actual = createHash("sha256")
          .update(
            safeJsonStringify({
              ...record,
              previousEventHash
            })
          )
          .digest("hex");

        if (previousEventHash !== previous || eventHash !== actual) {
          throw new Error("company_audit_chain_invalid");
        }

        previous = eventHash;
      }

      if (previous !== this.previousEventHash) {
        throw new Error("company_audit_chain_changed");
      }

      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
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
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as StoredLine);
  }
}
