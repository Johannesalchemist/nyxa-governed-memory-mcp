import type { ToolPolicy } from "../policy/toolPolicy.js";
export type EffectResolution = { status: "known"; radius: number; source: string } | { status: "unknown"; source: string };
export function resolveEffectRadius(action: string, policy: ToolPolicy | undefined, trustedRadius?: number): EffectResolution {
  if (!policy) return { status: "unknown", source: "unknown_tool" };
  if (trustedRadius !== undefined) {
    if (!Number.isSafeInteger(trustedRadius) || trustedRadius < 0) return { status: "unknown", source: "invalid_trusted_radius" };
    return { status: "known", radius: trustedRadius, source: "server_trusted_radius" };
  }
  if (policy.capabilityClass === "I0" && !policy.writesAuthoritativeMemory) return { status: "known", radius: 0, source: "non_mutating_policy" };
  if (action.startsWith("nyxa_e2e_")) return { status: "known", radius: 1, source: "isolated_e2e_fixture" };
  return { status: "unknown", source: "no_trusted_dependency_evidence" };
}
