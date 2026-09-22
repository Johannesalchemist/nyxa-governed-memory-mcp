import { createHash } from "node:crypto";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";
import { SrmClaimSchema } from "../srm/types.js";
import {
  assessLearningPromotionEligibility,
  type CoCogitationContribution,
  type HumanAiDriftSignal,
  type LearningPromotionGate
} from "./coCogitation.js";

const ContributionSchema = z.object({
  id: z.string().min(1).max(200),
  role: z.enum(["EXPLORE", "CHALLENGE", "INDEPENDENT_ALTERNATIVE"]),
  origin: z.enum(["HUMAN", "AI"]).optional(),
  claims: z.array(SrmClaimSchema),
  modelId: z.string().min(1).max(500),
  promptHash: z.string().min(1).max(200),
  parentIds: z.array(z.string().min(1).max(200))
}).strict();

const HumanAiDriftSignalSchema = z.object({
  agreementDelta: z.number(),
  independentEvidenceDelta: z.number()
}).strict();

const LearningEvidenceRecordSchema = z.object({
  candidateId: z.string().min(1).max(200),
  contributions: z.array(ContributionSchema).min(1).max(64),
  humanAiSignal: HumanAiDriftSignalSchema.optional(),
  createdAt: z.string().datetime(),
  writtenBy: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200)
}).strict();

export type LearningEvidenceRecord = z.infer<typeof LearningEvidenceRecordSchema>;

type StoredLine = LearningEvidenceRecord & {
  previousEventHash: string;
  eventHash: string;
};

export class LearningEvidenceStore {
  private readonly dir: string;
  private readonly path: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "memory");
    this.path = join(this.dir, "learning-evidence.jsonl");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    const handle = await this.openVerifiedAppend();

    try {
      const lines = await this.verifyHandle(handle);
      this.previousEventHash = lines.at(-1)?.eventHash ?? "GENESIS";
    } finally {
      await handle.close();
    }
  }

  private async openVerifiedAppend(): Promise<FileHandle> {
    if (await realpath(this.dir) !== resolve(this.dir)) {
      throw new Error("learning_evidence_directory_alias");
    }

    const handle = await open(
      this.path,
      constants.O_RDWR |
        constants.O_APPEND |
        constants.O_CREAT |
        constants.O_NOFOLLOW,
      0o600
    );

    try {
      const stat = await handle.stat();
      const named = await lstat(this.path);

      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        named.ino !== stat.ino ||
        named.dev !== stat.dev ||
        stat.size > 8 * 1024 * 1024
      ) {
        throw new Error("learning_evidence_store_not_bounded");
      }

      await this.verifyHandle(handle);
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  private async verifyHandle(handle: FileHandle): Promise<StoredLine[]> {
    // Read positionally from offset zero. This verification may run more than
    // once on the same FileHandle; relying on the mutable handle cursor could
    // otherwise make a non-empty chain appear as GENESIS on the second read.
    const before = await handle.stat();

    if (!before.isFile() || before.size > 8 * 1024 * 1024) {
      throw new Error("learning_evidence_store_not_bounded");
    }

    const buffer = Buffer.alloc(before.size);
    let offset = 0;

    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset
      );

      if (bytesRead === 0) break;
      offset += bytesRead;
    }

    const after = await handle.stat();

    if (offset !== buffer.length || after.size !== before.size) {
      throw new Error("learning_evidence_store_changed_during_verify");
    }

    const raw = buffer.toString("utf8");

    if (raw && !raw.endsWith("\n")) {
      throw new Error("learning_evidence_chain_truncated");
    }

    const result: StoredLine[] = [];
    let previous = "GENESIS";

    for (const line of raw.split("\n").filter(Boolean)) {
      const parsed = JSON.parse(line) as StoredLine;
      const { eventHash, previousEventHash, ...record } = parsed;

      LearningEvidenceRecordSchema.parse(record);

      const actual = createHash("sha256")
        .update(safeJsonStringify({ ...record, previousEventHash }))
        .digest("hex");

      if (previousEventHash !== previous || eventHash !== actual) {
        throw new Error("learning_evidence_chain_invalid");
      }

      result.push(parsed);
      previous = eventHash;
    }

    return result;
  }

  private async readVerifiedLines(): Promise<StoredLine[]> {
    let handle: FileHandle;

    try {
      if (await realpath(this.dir) !== resolve(this.dir)) {
        throw new Error("learning_evidence_directory_alias");
      }

      handle = await open(
        this.path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    try {
      const stat = await handle.stat();
      const named = await lstat(this.path);

      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        named.ino !== stat.ino ||
        named.dev !== stat.dev ||
        stat.size > 8 * 1024 * 1024
      ) {
        throw new Error("learning_evidence_store_not_bounded");
      }

      return await this.verifyHandle(handle);
    } finally {
      await handle.close();
    }
  }

  public async append(
    input: {
      candidateId: string;
      contributions: readonly CoCogitationContribution[];
      humanAiSignal?: HumanAiDriftSignal;
    },
    meta: {
      writtenBy: string;
      taskId: string;
      runId: string;
    }
  ): Promise<LearningEvidenceRecord> {
    let result!: LearningEvidenceRecord;

    const operation = this.appendQueue.then(async () => {
      const record = LearningEvidenceRecordSchema.parse({
        candidateId: input.candidateId,
        contributions: input.contributions,
        ...(input.humanAiSignal ? { humanAiSignal: input.humanAiSignal } : {}),
        createdAt: new Date().toISOString(),
        ...meta
      });

      const handle = await this.openVerifiedAppend();

      try {
        const verified = await this.verifyHandle(handle);
        const currentTip = verified.at(-1)?.eventHash ?? "GENESIS";

        if (currentTip !== this.previousEventHash) {
          throw new Error("learning_evidence_chain_tip_changed");
        }

        const chained = {
          ...record,
          previousEventHash: currentTip
        };

        const eventHash = createHash("sha256")
          .update(safeJsonStringify(chained))
          .digest("hex");

        const stored: StoredLine = {
          ...chained,
          eventHash
        };

        await handle.appendFile(
          `${safeJsonStringify(stored)}\n`,
          "utf8"
        );

        this.previousEventHash = eventHash;
        result = record;
      } finally {
        await handle.close();
      }
    });

    this.appendQueue = operation.catch(() => undefined);
    await operation;

    return result;
  }

  public async latestForCandidate(
    candidateId: string
  ): Promise<LearningEvidenceRecord | undefined> {
    const lines = await this.readVerifiedLines();

    const found = lines
      .filter(line => line.candidateId === candidateId)
      .at(-1);

    if (!found) return undefined;

    const { previousEventHash, eventHash, ...record } = found;
    return record;
  }

  public async assessCandidate(
    candidateId: string
  ): Promise<LearningPromotionGate> {
    const record = await this.latestForCandidate(candidateId);

    if (!record) {
      return {
        eligible: false,
        authorityEffect: "NONE",
        reason: "co_cogitation_hold",
        assessment: {
          driftScore: 1,
          humanAiDriftScore: 0,
          independentLineages: 0,
          sharedSourceRatio: 1,
          epistemicResetRequired: true,
          learningEligible: false,
          reasons: ["learning_evidence_missing"]
        }
      };
    }

    const contributions: CoCogitationContribution[] =
      record.contributions.map(c => ({
        id: c.id,
        role: c.role,
        ...(c.origin !== undefined ? { origin: c.origin } : {}),
        claims: c.claims,
        modelId: c.modelId,
        promptHash: c.promptHash,
        parentIds: c.parentIds
      }));

    return assessLearningPromotionEligibility(
      contributions,
      ...(record.humanAiSignal !== undefined
        ? [record.humanAiSignal]
        : [])
    );
  }
}
