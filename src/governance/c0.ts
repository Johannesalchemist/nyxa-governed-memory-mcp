import { readFileSync } from "node:fs";

/**
 * C0 -- Target Safety. Runs BEFORE gamma's C1-C5 evaluation (governance/gamma.ts), never after
 * and never merged into it. Answers a narrower, logically prior question than gamma does: not
 * "is this action allowed under policy" but "is this MCP instance even the intended target of
 * this proposal". A proposal that names the wrong server must never reach C1-C5 at all -- see
 * server.ts's handleProposeAction, which short-circuits on C0 DENY before calling
 * evaluateProposal().
 *
 * Reads /etc/server-identity.json fresh on every call (no caching): this file is meant to be
 * static per-host and only changes when a host is deliberately re-provisioned, at which point a
 * service restart is the correct way to pick that up anyway -- caching would only add a
 * staleness risk with no real benefit.
 */

export type C0Outcome = "PASS" | "DENY";

export type C0Decision = {
  outcome: C0Outcome;
  reason: string;
  localServerId: string | null;
  expectedTarget: string | null;
};

type ServerIdentity = {
  server_id: string;
  server_role: string;
};

const IDENTITY_PATH = "/etc/server-identity.json";

function readServerIdentity(identityPath: string): ServerIdentity | null {
  let raw: string;
  try {
    raw = readFileSync(identityPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  const serverId = candidate["server_id"];
  const serverRole = candidate["server_role"];
  if (typeof serverId !== "string" || serverId.trim().length === 0) return null;
  if (typeof serverRole !== "string" || serverRole.trim().length === 0) return null;
  return { server_id: serverId, server_role: serverRole };
}

/**
 * expectedTarget is the proposer's optional, self-declared claim about which server this
 * proposal is meant for (proposal.expected_target). Absent expectedTarget: compatibility PASS
 * -- existing callers that don't yet set it must not break -- but the reason
 * ("target_not_specified") is always distinguishable in the audit trail from a verified match,
 * per the Phase 1 requirement that every C0 decision be auditable, not just denials.
 *
 * An expectedTarget that cannot be verified against a readable, valid local identity file fails
 * CLOSED (DENY, reason "local_identity_unavailable") exactly like a real mismatch -- an
 * unverifiable target claim is treated as untrusted, never as an automatic pass. This is a
 * deliberate design choice beyond the two cases spelled out in the task: it is not optional
 * that a corrupted or missing identity file plus an explicit target silently proceeds.
 */
// identityPath defaults to the real production path; the parameter exists solely so
// tests/c0.test.mjs can exercise missing/corrupt-identity DENY behavior against temp files
// instead of ever touching the real /etc/server-identity.json.
export function evaluateC0(
  expectedTarget: string | undefined | null,
  identityPath: string = IDENTITY_PATH
): C0Decision {
  const identity = readServerIdentity(identityPath);
  const localServerId = identity?.server_id ?? null;

  if (expectedTarget === undefined || expectedTarget === null || expectedTarget.length === 0) {
    return { outcome: "PASS", reason: "target_not_specified", localServerId, expectedTarget: null };
  }
  if (!identity) {
    return {
      outcome: "DENY",
      reason: "local_identity_unavailable",
      localServerId: null,
      expectedTarget
    };
  }
  if (expectedTarget !== identity.server_id) {
    return { outcome: "DENY", reason: "target_mismatch", localServerId, expectedTarget };
  }
  return { outcome: "PASS", reason: "target_match", localServerId, expectedTarget };
}
