/** Fail-closed planning boundary. This module does NOT dispatch remote effects. */
import { validateRemoteJob, type RemoteJobRequest } from './remoteJobContract.js';
export type RemoteDecision = Readonly<{allowed: boolean; reason: string; request?: RemoteJobRequest}>;
export type RemoteAuthorization = Readonly<{
  decision: 'ALLOW' | 'DENY' | 'ESCALATE' | 'DEGRADE' | 'UNKNOWN';
  mandateId: string;
  actorId: string;
  target: 'server-c';
  kind: string;
  evidenceId: string;
  expiresAtMs: number;
}>;
export function assessRemoteJob(
  untrusted: unknown, authorization: RemoteAuthorization | null,
  nowMs: number, replaySeen: (jobId: string) => boolean,
): RemoteDecision {
  let request: RemoteJobRequest;
  try { request = validateRemoteJob(untrusted); }
  catch { return { allowed: false, reason: 'invalid_envelope' }; }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return {allowed:false,reason:'invalid_clock'};
  if (!authorization || authorization.decision !== 'ALLOW') return {allowed:false,reason:'governance_not_allowed'};
  if (authorization.mandateId !== request.mandateId ||
      authorization.actorId !== request.actorId ||
      authorization.target !== request.target ||
      authorization.kind !== request.kind ||
      authorization.evidenceId !== request.evidenceId) return {allowed:false,reason:'authorization_mismatch'};
  if (!Number.isSafeInteger(authorization.expiresAtMs) ||
      authorization.expiresAtMs <= nowMs) return {allowed:false,reason:'authorization_expired'};
  if (replaySeen(request.jobId)) return {allowed:false,reason:'replay_detected'};
  return {allowed:true,reason:'eligible_for_separate_governed_dispatch',request};
}
