import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  open,
  realpath,
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
    if (await realpath(this.dir) !== resolve(this.dir)) throw new Error("company_audit_directory_alias");
    const initial = await open(this.path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK, 0o600);
    await initial.close();
    const raw = await this.readVerifiedFile();
    const lines = this.parseVerifiedLines(raw);
    const last = lines.at(-1);
    this.previousEventHash = last?.eventHash ?? "GENESIS";
  }

  public async observationAppendRadius(
    target: string,
    payload: unknown
  ): Promise<number | undefined> {
    const parsed = AuditObservationInputSchema.safeParse(payload);
    if (!parsed.success) return undefined;
    if (target !== this.auditTarget(
      parsed.data.tenant_id,
      parsed.data.organization_id,
      parsed.data.audit_id
    )) return undefined;

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

    if (
      target !== this.auditTarget(
        input.tenant_id,
        input.organization_id,
        input.audit_id
      )
    ) {
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

  public async readAudit(
    tenantId: string,
    organizationId: string,
    auditId: string
  ): Promise<AuditObservation[]> {
    const raw = await this.readVerifiedFile();
    const lines = this.parseVerifiedLines(raw);
    if ((lines.at(-1)?.eventHash ?? "GENESIS") !== this.previousEventHash) {
      throw new Error("company_audit_chain_changed");
    }

    return lines
      .filter(
        line =>
          line.tenant_id === tenantId &&
          line.organization_id === organizationId &&
          line.audit_id === auditId
      )
      .map(({ previousEventHash, eventHash, ...record }) => record);
  }

  private auditTarget(
    tenantId: string,
    organizationId: string,
    auditId: string
  ): string {
    return `company-audit:/tenant/${tenantId}/organization/${organizationId}/audit/${auditId}`;
  }

  private async readVerifiedFile(): Promise<string> {
    if (await realpath(this.dir) !== resolve(this.dir)) throw new Error("company_audit_directory_alias");
    const handle = await open(this.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await handle.stat();
      const named = await lstat(this.path);
      if (!before.isFile() || before.nlink !== 1 || before.ino !== named.ino || before.dev !== named.dev || before.size > 32 * 1024 * 1024) {
        throw new Error("company_audit_store_not_bounded");
      }
      // Bounded allocation AND bounded read, including a file that grows after fstat.
      const buffer = Buffer.alloc(before.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const part = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
        if (!part.bytesRead) break;
        bytes += part.bytesRead;
      }
      const after = await handle.stat();
      const finalName = await lstat(this.path);
      if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs || finalName.ino !== before.ino || finalName.dev !== before.dev ||
          await realpath(this.dir) !== resolve(this.dir)) throw new Error("company_audit_store_changed_during_read");
      return buffer.subarray(0, bytes).toString("utf8");
    } finally { await handle.close(); }
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

      const buffer = Buffer.alloc(stat.size + 1);
      let bytes = 0;
      while (bytes < buffer.length) {
        const part = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
        if (!part.bytesRead) break;
        bytes += part.bytesRead;
      }
      const after = await handle.stat();
      if (bytes !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
        throw new Error("company_audit_store_changed_during_read");
      }
      const raw = buffer.subarray(0, bytes).toString("utf8");
      const lines = this.parseVerifiedLines(raw);
      const previous = lines.at(-1)?.eventHash ?? "GENESIS";

      if (previous !== this.previousEventHash) {
        throw new Error("company_audit_chain_changed");
      }

      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  private parseVerifiedLines(raw: string): StoredLine[] {
    if (raw && !raw.endsWith("\n")) {
      throw new Error("company_audit_chain_truncated");
    }

    const lines: StoredLine[] = [];
    let previous = "GENESIS";

    for (const serialized of raw.split("\n").filter(line => line.trim().length > 0)) {
      let value: StoredLine;

      try {
        value = JSON.parse(serialized) as StoredLine;
      } catch {
        throw new Error("company_audit_chain_invalid");
      }

      const { eventHash, previousEventHash, ...record } = value;

      try {
        AuditObservationSchema.parse(record);
      } catch {
        throw new Error("company_audit_chain_invalid");
      }

      if (
        typeof eventHash !== "string" ||
        typeof previousEventHash !== "string"
      ) {
        throw new Error("company_audit_chain_invalid");
      }

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

      lines.push(value);
      previous = eventHash;
    }

    return lines;
  }

}
