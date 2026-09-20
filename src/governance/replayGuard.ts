import { open } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ensureDir } from "../utils/ensureDir.js";
import type { ValidatedProposal } from "./proposal.js";

export type ReplayCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Prevents the same effectful proposal from executing twice. Scoped per data directory, same
 * convention as AuditLog/WriterLock -- a dedup key is only ever meaningful within one
 * NYXA_DATA_DIR's history.
 *
 * Dedup key: action + target + provenance.taskId + provenance.runId. Reuses fields the
 * envelope already requires (ProposalSchema.provenance) rather than introducing a new field --
 * a caller who mints a fresh taskId/runId per distinct real task gets no friction; a caller who
 * resends the identical envelope collides on purpose. action+target are folded in too so two
 * genuinely different actions that happen to share an ID by caller error don't collide with
 * each other.
 *
 * Marks BEFORE execution, via the same atomic-exclusive-create primitive already proven for
 * the arbeitsbahnhof nonce file and the cross-process WriterLock (open(path, "wx") -- fails
 * with EEXIST if the marker already exists, which the OS guarantees is race-free even across
 * processes). This ordering is a deliberate tradeoff:
 *   - a crash between reservation and execution strands that reservation with no real effect
 *     ever having happened -- a legitimate retry then needs a fresh taskId/runId. Accepted.
 *   - a crash AFTER execution can never produce an unprotected double-write, because the mark
 *     already exists on disk before execution starts. This is the property that matters most:
 *     favor an occasional lost legitimate retry over ever allowing a silent double effect.
 *
 * Concurrent requests with the identical key: exactly one reservation wins the atomic create;
 * the other observes EEXIST and is denied immediately, same as a real concurrent race against
 * the WriterLock or the arbeitsbahnhof nonce file.
 *
 * Only ever called for proposals gamma has already ALLOWed (see server.ts) -- DENY / ESCALATE /
 * UNKNOWN / DEGRADE never reserve anything, so a caller can freely retry a denied proposal
 * (e.g. after mode or provenance is fixed) without this guard getting in the way.
 */
export class ReplayGuard {
  private readonly dir: string;

  public constructor(dataDir: string) {
    this.dir = join(dataDir, "replay-guard");
  }

  public dedupKey(proposal: ValidatedProposal): string {
    const material = [proposal.action, proposal.target, proposal.provenance.taskId, proposal.provenance.runId].join(
      "\u0000"
    );
    return createHash("sha256").update(material).digest("hex");
  }

  public async reserve(proposal: ValidatedProposal): Promise<ReplayCheck> {
    await ensureDir(this.dir);
    const markerPath = join(this.dir, this.dedupKey(proposal));
    try {
      const handle = await open(markerPath, "wx", 0o600);
      await handle.writeFile(new Date().toISOString());
      await handle.close();
      return { allowed: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return { allowed: false, reason: "already_executed" };
      }
      throw error;
    }
  }
}
