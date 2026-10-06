import { createHash } from "node:crypto";

export type SyncState = "IN_SYNC" | "LOCAL_AHEAD" | "CENTRAL_AHEAD" | "DIVERGED" | "MISSING_LOCAL" | "MISSING_CENTRAL";

export function stableWorkflowHash(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !["updatedAt", "createdAt", "versionId"].includes(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, normalize(x)]));
    }
    return v;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function classifyWorkflowSync(args: {
  central?: unknown;
  local?: unknown;
  lastSyncedHash?: string;
}): { state: SyncState; centralHash?: string; localHash?: string; applyAllowed: boolean } {
  if (args.central === undefined) return { state: "MISSING_CENTRAL", localHash: stableWorkflowHash(args.local), applyAllowed: false };
  if (args.local === undefined) return { state: "MISSING_LOCAL", centralHash: stableWorkflowHash(args.central), applyAllowed: false };
  const centralHash = stableWorkflowHash(args.central);
  const localHash = stableWorkflowHash(args.local);
  if (centralHash === localHash) return { state: "IN_SYNC", centralHash, localHash, applyAllowed: false };
  if (args.lastSyncedHash && localHash === args.lastSyncedHash) return { state: "CENTRAL_AHEAD", centralHash, localHash, applyAllowed: true };
  if (args.lastSyncedHash && centralHash === args.lastSyncedHash) return { state: "LOCAL_AHEAD", centralHash, localHash, applyAllowed: true };
  return { state: "DIVERGED", centralHash, localHash, applyAllowed: false };
}
