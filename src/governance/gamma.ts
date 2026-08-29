import type { NyxaAgentMode } from "../policy/modes.js";
import { modeSatisfiesMinimum } from "../policy/modes.js";
import type { ToolPolicy } from "../policy/toolPolicy.js";
import type { CapabilityClass } from "../connector/types.js";
import { isProtectedDevPath, splitVirtualPath } from "../connector/pathGuard.js";
import { ConnectorError } from "../connector/errors.js";
import { posix } from "node:path";
import type { ValidatedProposal } from "./proposal.js";

export type GammaOutcome = "ALLOW" | "DENY" | "ESCALATE" | "DEGRADE" | "UNKNOWN";
export type GammaDomain = "C1" | "C2" | "C3" | "C4" | "C5" | null;

export type GammaDecision = {
  outcome: GammaOutcome;
  domain: GammaDomain;
  reason: string;
};

export type GammaContext = {
  /** undefined means the proposed action does not correspond to any known tool -> C1 UNKNOWN. */
  toolPolicy: ToolPolicy | undefined;
  mode: NyxaAgentMode;
  /** Injectable clock (ms since epoch). Never call Date.now() inside this module — keeps
   *  evaluateProposal pure/deterministic and the staleness check testable. */
  now: number;
  /** Reserved infra-failure signal. Never derived from proposal fields, so a proposer cannot
   *  set this themselves — it exists for future backend-health wiring, not attacker control. */
  backendDegraded?: boolean;
};

const STALE_EVIDENCE_MS = 24 * 60 * 60 * 1000;
const CAPABILITY_RANK: Record<CapabilityClass, number> = { I0: 0, I1: 1, I2: 2, I3: 3 };

function deny(domain: GammaDomain, reason: string): GammaDecision {
  return { outcome: "DENY", domain, reason };
}
function escalate(domain: GammaDomain, reason: string): GammaDecision {
  return { outcome: "ESCALATE", domain, reason };
}

/**
 * Strips an optional "root-id:/" virtual-path prefix and checks the remainder against the same
 * PROTECTED_DEV_PREFIXES PathGuard uses to refuse writes to the governance control plane. This
 * is checked here too (not only inside PathGuard) so a proposal targeting its own governance
 * surface is denied at the envelope layer before any connector method is ever invoked — defense
 * in depth against self-authorization, not a replacement for PathGuard's own enforcement.
 *
 * Note this is intentionally stricter than PathGuard: PathGuard only blocks WRITES to these
 * paths (resolveDevTarget), while this blocks any proposed action — including reads — against
 * them. The proposal envelope's generic `target` field doesn't yet distinguish read/write intent
 * across heterogeneous tools, so we protect the governance surface conservatively at this layer.
 */
function isProtectedTarget(target: string): boolean {
  // Reuse PathGuard's own logical-namespace parser rather than a second, divergent
  // normalization. Not every proposal.target is path-shaped (e.g. nyxa_run_test's
  // target is a testTargets[] id, not a root-id:/path) -- splitVirtualPath throwing
  // "path_invalid" just means "this was never a virtual path", so fall through as
  // not-protected, matching this check's original lenient pass-through for such
  // targets. splitVirtualPath throwing "path_traversal_denied" is the genuinely
  // suspicious case (it DID look like root-id:/... but contains ".." or is
  // absolute) -- that is a real attack attempt against a resource this check exists
  // to guard, so it fails closed (protected/denied), not silently falls through. For
  // targets that parse cleanly, posix.normalize collapses "./" and repeated
  // separators -- pure string canonicalization, no fs access, no premature mapping
  // onto a real OS path (that mapping stays inside PathGuard).
  let relativePath: string;
  try {
    ({ relativePath } = splitVirtualPath(target));
  } catch (error) {
    return error instanceof ConnectorError && error.code === "path_traversal_denied";
  }
  return isProtectedDevPath(posix.normalize(relativePath));
}

/**
 * Deterministic reference monitor (gamma). Pure and synchronous by design: given the same
 * proposal and context it always returns the same decision, and it never executes anything
 * itself. `proposal.rationale` (alpha) and `proposal.opposition` (beta) are NEVER read here —
 * advisory LLM-authored argument-for/argument-against text must not influence enforcement.
 *
 * Checks run in fixed order C1 -> C5; the first failing/non-ALLOW domain wins and no later
 * domain can override an earlier DENY/ESCALATE/UNKNOWN.
 */
export function evaluateProposal(proposal: ValidatedProposal, context: GammaContext): GammaDecision {
  if (context.backendDegraded) {
    return { outcome: "DEGRADE", domain: null, reason: "backend_degraded" };
  }

  // C1 — Constraints: is this a real, currently-permitted tool, and is the target itself
  // structurally off-limits (the governance/connector control plane)?
  if (!context.toolPolicy) {
    return { outcome: "UNKNOWN", domain: "C1", reason: "unknown_tool" };
  }
  if (!context.toolPolicy.allowedInV01) {
    return deny("C1", "tool_not_allowed_in_v01");
  }
  if (isProtectedTarget(proposal.target)) {
    return deny("C1", "target_is_protected_governance_surface");
  }

  // C2 — Authority: does the caller's mode meet the tool's minimum, and does this tool require
  // an explicit human sign-off regardless of mode?
  if (!modeSatisfiesMinimum(context.mode, context.toolPolicy.minimumMode)) {
    return deny("C2", "mode_below_minimum");
  }
  if (context.toolPolicy.requiresHumanApproval) {
    return escalate("C2", "human_approval_required");
  }

  // C3 — Irreversibility: ground truth is the tool's real capabilityClass, never the proposer's
  // self-reported estimate. I2/I3 can never be authorized through a proposal at all.
  const trueClass = context.toolPolicy.capabilityClass;
  if (trueClass === "I2" || trueClass === "I3") {
    return deny("C3", `capability_class_${trueClass}_not_authorizable`);
  }
  if (CAPABILITY_RANK[proposal.estimatedIrreversibility] < CAPABILITY_RANK[trueClass]) {
    return deny("C3", "irreversibility_underestimated");
  }

  // C4 — Provenance validity: every claim must carry a real (non-blank) source, and any claim
  // sourced from external evidence must not be stale.
  for (const [index, claim] of proposal.claims.entries()) {
    if (claim.source.trim().length === 0) {
      return deny("C4", `missing_source_claim_${index}`);
    }
    if (claim.tag === "EXTERNAL_EVIDENCE") {
      if (!claim.asOf) {
        return deny("C4", `stale_evidence_claim_${index}_no_timestamp`);
      }
      const age = context.now - Date.parse(claim.asOf);
      if (!Number.isFinite(age) || age > STALE_EVIDENCE_MS || age < 0) {
        return deny("C4", `stale_evidence_claim_${index}`);
      }
    }
  }

  // C5 — Escalation reachability: high-risk tools always route to a human, even once everything
  // else checks out. No current tool is "high" risk, but the check must exist so one added later
  // isn't silently reachable via ALLOW.
  if (context.toolPolicy.executionRisk === "high") {
    return escalate("C5", "high_execution_risk_requires_human_review");
  }

  return { outcome: "ALLOW", domain: null, reason: "allowed" };
}
