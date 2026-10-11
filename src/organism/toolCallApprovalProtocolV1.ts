/** Tool Call is an approval request, not a password, signature, or authorization. */
export type ToolCallApprovalRequest = Readonly<{
  requestId: string;
  actor: string;
  action: string;
  scopePrefix: string;
  targetPrefix: string;
  tenantId: string;
  issuedAtMs: number;
  expiresAtMs: number;
  maxExecutions: number;
  maxEffectUnits: number;
}>;
export type ToolCallApprovalAttestation = Readonly<{
  requestId: string;
  approved: boolean;
  authenticatedPrincipalId: string;
  verifierId: string;
  verifiedAtMs: number;
  expiresAtMs: number;
  oneTimeNonce: string;
}>;
export type ToolCallApprovalDecision = Readonly<{
  eligible: boolean;
  reason: string;
  authorityEffect: 'NONE';
}>;

/** Pure validation. Trusted verifier, nonce consumption and ledger persistence are external obligations. */
export function assessToolCallApproval(
  request: ToolCallApprovalRequest,
  attestation: ToolCallApprovalAttestation | undefined,
  nowMs: number,
  expectedHumanPrincipalId: string
): ToolCallApprovalDecision {
  const deny = (reason: string): ToolCallApprovalDecision => ({ eligible: false, reason, authorityEffect: 'NONE' });
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return deny('invalid_clock');
  if (!request.requestId || !request.actor || !request.action || !request.tenantId ||
      !request.scopePrefix || !request.targetPrefix) return deny('incomplete_request');
  if (!Number.isSafeInteger(request.issuedAtMs) || !Number.isSafeInteger(request.expiresAtMs) ||
      request.issuedAtMs > nowMs || request.expiresAtMs <= nowMs ||
      request.expiresAtMs <= request.issuedAtMs) return deny('request_expired');
  if (!Number.isSafeInteger(request.maxExecutions) || request.maxExecutions < 1 ||
      !Number.isSafeInteger(request.maxEffectUnits) || request.maxEffectUnits < 1) return deny('invalid_budget');
  if (!attestation) return deny('authenticated_approval_missing');
  if (attestation.requestId !== request.requestId) return deny('approval_request_mismatch');
  if (!attestation.approved) return deny('approval_rejected');
  if (!expectedHumanPrincipalId || attestation.authenticatedPrincipalId !== expectedHumanPrincipalId) {
    return deny('human_principal_mismatch');
  }
  if (!attestation.verifierId || !attestation.oneTimeNonce) return deny('verifier_or_nonce_missing');
  if (!Number.isSafeInteger(attestation.verifiedAtMs) || !Number.isSafeInteger(attestation.expiresAtMs) ||
      attestation.verifiedAtMs < request.issuedAtMs || attestation.verifiedAtMs > nowMs ||
      attestation.expiresAtMs <= nowMs || attestation.expiresAtMs > request.expiresAtMs) {
    return deny('approval_expired');
  }
  return { eligible: true, reason: 'requires_trusted_verifier_and_atomic_nonce_consumption', authorityEffect: 'NONE' };
}
