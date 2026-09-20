import { randomUUID, createHash } from "node:crypto";
import { appendFile, readFile, writeFile, open, stat } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir } from "../utils/ensureDir.js";
import { safeJsonStringify } from "../utils/safeJson.js";

/**
 * First real human-authority/grant mechanism in this runtime (Step 11). A grant is a narrowly
 * scoped, single-use, time-bounded credential: it authorizes exactly one capability against
 * exactly one target, issued only by nyxa_human_grant_issue (server.ts), which itself is inert
 * unless NYXA_HUMAN_AUTHORITY_TOKEN is configured with a real secret only an operator with host
 * access can set -- fail-closed by default, matching this codebase's existing
 * NYXA_E2E_SCRATCH_ROOT precedent (inert unless explicitly configured).
 *
 * Deliberately NOT a boolean. grantId is server-generated (randomUUID), never caller-supplied,
 * so nothing a proposer sends can forge or predict one. capability/targetId are checked for
 * an EXACT match, not merely presence, so a grant scoped to one candidate cannot be reused
 * against a different one, and a grant scoped to one tool cannot be reused for another.
 *
 * File-backed, append-only, hash-chained ledger for issuance (same idiom as CandidateStore /
 * AuditLog / self-model/store.ts -- one governed-write shape across this runtime), plus a
 * separate exclusive-create marker directory for one-time consumption, reusing the EXACT same
 * atomic-reservation primitive already proven by governance/replayGuard.js
 * (open(path, "wx") -- EEXIST-on-race, crash-safe: a crash after the real effect can never
 * leave a grant unmarked, so a restart can never let it be replayed).
 */

/**
 * Step 11B.10: structured authenticated-principal model, replacing a bare issuedBy string.
 * Never caller-controlled (same as before) -- governance code must not depend permanently on
 * a literal personal name; authorityPrincipalId/authorityMethod are set by the caller (server.ts)
 * from fixed, non-request-derived values, exactly like issuedBy: "Jo" was before this change.
 */
export type AuthorityPrincipal = {
  /** e.g. "human:jo" -- an identifier, not free text; never taken from request input. */
  authorityPrincipalId: string;
  /** e.g. "operator-token" -- how this principal was authenticated for this grant. */
  authorityMethod: string;
};

export type HumanGrantRecord = {
  grantId: string;
  capability: string;
  targetId: string;
  issuedBy: AuthorityPrincipal;
  issuedAt: string;
  expiresAt: string;
};

type StoredGrantLine = HumanGrantRecord & { previousEventHash: string; eventHash: string };

export type HumanGrantCheckStatus =
  | "not_presented"
  | "invalid_grant_id"
  | "capability_mismatch"
  | "target_mismatch"
  | "expired"
  | "already_consumed"
  | "valid";

export type HumanGrantCheckResult = { status: HumanGrantCheckStatus; grantId?: string };

export class HumanGrantStore {
  private readonly dir: string;
  private readonly ledgerPath: string;
  private readonly consumedDir: string;
  private previousEventHash = "GENESIS";
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "human-grants");
    this.ledgerPath = join(this.dir, "grants.jsonl");
    this.consumedDir = join(this.dir, "consumed");
  }

  public async init(): Promise<void> {
    await ensureDir(this.dir);
    await ensureDir(this.consumedDir);
    await writeFile(this.ledgerPath, "", { flag: "a" });
    const lines = await this.readLines();
    const last = lines.at(-1);
    this.previousEventHash = last ? last.eventHash : "GENESIS";
  }

  public async issueGrant(input: {
    capability: string;
    targetId: string;
    issuedBy: AuthorityPrincipal;
    ttlSeconds: number;
  }): Promise<HumanGrantRecord> {
    let result!: HumanGrantRecord;
    this.appendQueue = this.appendQueue.then(async () => {
      const now = Date.now();
      const record: HumanGrantRecord = {
        grantId: randomUUID(),
        capability: input.capability,
        targetId: input.targetId,
        issuedBy: input.issuedBy,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + input.ttlSeconds * 1000).toISOString()
      };
      const chained = { ...record, previousEventHash: this.previousEventHash };
      const hash = createHash("sha256").update(safeJsonStringify(chained)).digest("hex");
      const line: StoredGrantLine = { ...record, previousEventHash: this.previousEventHash, eventHash: hash };
      await appendFile(this.ledgerPath, `${safeJsonStringify(line)}\n`, { encoding: "utf8" });
      this.previousEventHash = hash;
      result = record;
    });
    await this.appendQueue;
    return result;
  }

  /**
   * Read-only validation: does a presented grantId authorize exactly this capability+target,
   * right now, and has it not already been consumed? Never mutates anything -- actual one-time
   * consumption is the separate reserveConsumption() step below, called only after gamma has
   * ALLOWed and the existing ReplayGuard has already reserved (see server.ts), so a grant that
   * merely checks "valid" here is not yet spent.
   *
   * Distinguishes "no grant presented at all" (not_presented, the ordinary ESCALATE case --
   * gamma.ts maps this to its existing default escalate("C2","human_approval_required") path,
   * unchanged) from every other case, which is presenting SOME credential that turns out to be
   * wrong -- those are real DENYs, not escalations, since a human already made a decision, just
   * not the one being claimed here.
   */
  public async check(
    grantId: string | undefined,
    capability: string,
    targetId: string,
    now: number
  ): Promise<HumanGrantCheckResult> {
    if (!grantId) return { status: "not_presented" };
    const lines = await this.readLines();
    const record = lines.find((line) => line.grantId === grantId);
    if (!record) return { status: "invalid_grant_id", grantId };
    if (record.capability !== capability) return { status: "capability_mismatch", grantId };
    if (record.targetId !== targetId) return { status: "target_mismatch", grantId };
    if (Date.parse(record.expiresAt) <= now) return { status: "expired", grantId };
    if (await this.isConsumed(grantId)) return { status: "already_consumed", grantId };
    return { status: "valid", grantId };
  }

  /**
   * Atomically marks a grant as consumed -- one-time use, enforced by the OS's own atomic
   * exclusive-create guarantee (race-free even across processes), not by an in-memory flag.
   */
  public async reserveConsumption(grantId: string): Promise<{ allowed: true } | { allowed: false }> {
    await ensureDir(this.consumedDir);
    const markerPath = join(this.consumedDir, grantId);
    try {
      const handle = await open(markerPath, "wx", 0o600);
      await handle.writeFile(new Date().toISOString());
      await handle.close();
      return { allowed: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return { allowed: false };
      }
      throw error;
    }
  }

  private async isConsumed(grantId: string): Promise<boolean> {
    try {
      await stat(join(this.consumedDir, grantId));
      return true;
    } catch {
      return false;
    }
  }

  private async readLines(): Promise<StoredGrantLine[]> {
    let raw: string;
    try {
      raw = await readFile(this.ledgerPath, "utf8");
    } catch {
      return [];
    }
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as StoredGrantLine);
  }
}
