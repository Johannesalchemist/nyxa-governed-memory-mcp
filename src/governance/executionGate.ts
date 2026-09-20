import type { ValidatedProposal } from "./proposal.js";
import type { ToolPolicy } from "../policy/toolPolicy.js";

export type ExecutionGateConfig = {
  windowMs: number;
  maxExecutionsPerWindow: number;
  maxPerActorAction: number;
  maxPerTarget: number;
  maxEffectUnitsPerWindow: number;
  externalAuthority: readonly ExternalAuthorityLease[];
};

export type ExternalAuthorityLease = {
  id: string;
  action: string;
  targetPrefix?: string;
  expiresAt?: number;
  maxExecutionsPerWindow?: number;
  maxEffectUnitsPerWindow?: number;
};


export function loadExternalAuthorityLeases(raw = process.env.NYXA_EXTERNAL_AUTHORITY_JSON): ExternalAuthorityLease[] {
  if (!raw || raw.trim() === "") return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid_external_authority_json"); }
  if (!Array.isArray(parsed)) throw new Error("invalid_external_authority_json");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`invalid_external_authority_${index}`);
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || typeof r.action !== "string" || !r.action) throw new Error(`invalid_external_authority_${index}`);
    if (r.targetPrefix !== undefined && typeof r.targetPrefix !== "string") throw new Error(`invalid_external_authority_${index}`);
    if (r.expiresAt !== undefined && (typeof r.expiresAt !== "number" || !Number.isFinite(r.expiresAt))) throw new Error(`invalid_external_authority_${index}`);
    if (r.maxExecutionsPerWindow !== undefined && (typeof r.maxExecutionsPerWindow !== "number" || !Number.isInteger(r.maxExecutionsPerWindow) || r.maxExecutionsPerWindow < 1)) throw new Error(`invalid_external_authority_${index}`);
    if (r.maxEffectUnitsPerWindow !== undefined && (typeof r.maxEffectUnitsPerWindow !== "number" || !Number.isInteger(r.maxEffectUnitsPerWindow) || r.maxEffectUnitsPerWindow < 1)) throw new Error(`invalid_external_authority_${index}`);
    return { id: r.id, action: r.action, ...(r.targetPrefix !== undefined ? { targetPrefix: r.targetPrefix } : {}), ...(r.expiresAt !== undefined ? { expiresAt: r.expiresAt } : {}), ...(r.maxExecutionsPerWindow !== undefined ? { maxExecutionsPerWindow: r.maxExecutionsPerWindow } : {}), ...(r.maxEffectUnitsPerWindow !== undefined ? { maxEffectUnitsPerWindow: r.maxEffectUnitsPerWindow } : {}) };
  });
}

export type ExecutionGateDecision =
  | { allowed: true; effectUnits: number; authorityId?: string }
  | { allowed: false; outcome: "DENY" | "ESCALATE"; reason: string; effectUnits: number };

type Entry = { at: number; actorAction: string; target: string; effectUnits: number; authorityId?: string };

const EXTERNAL_SCHEMES = new Set(["http", "https", "email", "payment", "booking", "message", "sms", "tel"]);

export const DEFAULT_EXECUTION_GATE_CONFIG: ExecutionGateConfig = {
  windowMs: 60_000,
  maxExecutionsPerWindow: 30,
  maxPerActorAction: 10,
  maxPerTarget: 10,
  maxEffectUnitsPerWindow: 20,
  externalAuthority: []
};function targetScheme(target: string): string | undefined {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(target);
  return match?.[1]?.toLowerCase();
}

function effectUnits(policy: ToolPolicy | undefined): number {
  if (!policy) return 1;
  return policy.capabilityClass === "I0" ? 0 : 1;
}

export class ExecutionGate {
  private readonly entries: Entry[] = [];
  public constructor(private readonly config: ExecutionGateConfig = DEFAULT_EXECUTION_GATE_CONFIG) {}

  public evaluateAndReserve(
    proposal: ValidatedProposal,
    policy: ToolPolicy | undefined,
    now = Date.now(),
    mandate?: ExternalAuthorityLease
  ): ExecutionGateDecision {
    const scheme = targetScheme(proposal.target);
    const units = effectUnits(policy);
    let authorityId: string | undefined;
    if (scheme && EXTERNAL_SCHEMES.has(scheme) && policy?.capabilityClass !== "I0") {
      const lease = mandate ?? this.config.externalAuthority.find((candidate) =>
        candidate.action === proposal.action &&
        (!candidate.targetPrefix || proposal.target.startsWith(candidate.targetPrefix)) &&
        (!candidate.expiresAt || now < candidate.expiresAt)
      );
      if (!lease) {
        return { allowed: false, outcome: "ESCALATE", reason: "external_authority_required", effectUnits: units };
      }
      authorityId = lease.id;
      const authorityEntries = this.entries.filter((entry) => entry.authorityId === lease.id);
      if (lease.maxExecutionsPerWindow !== undefined && authorityEntries.length >= lease.maxExecutionsPerWindow) {
        return { allowed: false, outcome: "DENY", reason: "external_authority_rate_exceeded", effectUnits: units };
      }
      if (lease.maxEffectUnitsPerWindow !== undefined && authorityEntries.reduce((sum, entry) => sum + entry.effectUnits, 0) + units > lease.maxEffectUnitsPerWindow) {
        return { allowed: false, outcome: "DENY", reason: "external_authority_budget_exceeded", effectUnits: units };
      }
    }

    const cutoff = now - this.config.windowMs;
    while (this.entries.length > 0 && this.entries[0]!.at <= cutoff) this.entries.shift();
    const actorAction = `${proposal.actor}\u0000${proposal.action}`;
    const actorActionCount = this.entries.filter((entry) => entry.actorAction === actorAction).length;
    const targetCount = this.entries.filter((entry) => entry.target === proposal.target).length;
    const totalUnits = this.entries.reduce((sum, entry) => sum + entry.effectUnits, 0);

    if (this.entries.length >= this.config.maxExecutionsPerWindow) {
      return { allowed: false, outcome: "DENY", reason: "global_execution_rate_exceeded", effectUnits: units };
    }
    if (actorActionCount >= this.config.maxPerActorAction) {
      return { allowed: false, outcome: "DENY", reason: "actor_action_rate_exceeded", effectUnits: units };
    }
    if (targetCount >= this.config.maxPerTarget) {
      return { allowed: false, outcome: "DENY", reason: "target_rate_exceeded", effectUnits: units };
    }
    if (totalUnits + units > this.config.maxEffectUnitsPerWindow) {
      return { allowed: false, outcome: "DENY", reason: "effect_budget_exceeded", effectUnits: units };
    }

    this.entries.push({ at: now, actorAction, target: proposal.target, effectUnits: units, ...(authorityId ? { authorityId } : {}) });
    return { allowed: true, effectUnits: units, ...(authorityId ? { authorityId } : {}) };
  }
}