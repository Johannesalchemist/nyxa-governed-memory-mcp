import { assessToolCallApproval, type ToolCallApprovalRequest, type ToolCallApprovalAttestation } from './toolCallApprovalProtocolV1.js';

export type VerifiedApproval = Readonly<{
  requestId: string;
  humanPrincipalId: string;
  tenantId: string;
  actor: string;
  action: string;
  scopePrefix: string;
  targetPrefix: string;
  expiresAtMs: number;
  maxExecutions: number;
  maxEffectUnits: number;
}>;

/** Implementations must authenticate the human out of band, bind the entire request,
 * atomically consume the nonce, and persist audit evidence before returning. */
export interface TrustedApprovalVerifier {
  verifyAndConsume(request: ToolCallApprovalRequest, attestation: ToolCallApprovalAttestation): Promise<VerifiedApproval | undefined>;
}

/** Only the protected production governance layer may implement this interface. */
export interface GovernedMandateIssuer {
  issueVerifiedApproval(approval: VerifiedApproval): Promise<{ mandateId: string }>;
}

export type BridgeResult = Readonly<{
  status: 'DENIED' | 'ISSUED';
  reason: string;
  mandateId?: string;
}>;

/** This is an integration contract, not a replacement authorization endpoint.
 * No default verifier, token, or issuer is provided intentionally. */
export async function issueFromAuthenticatedToolCall(
  request: ToolCallApprovalRequest,
  attestation: ToolCallApprovalAttestation | undefined,
  expectedHumanPrincipalId: string,
  verifier: TrustedApprovalVerifier,
  issuer: GovernedMandateIssuer,
  nowMs: number
): Promise<BridgeResult> {
  const preflight = assessToolCallApproval(request, attestation, nowMs, expectedHumanPrincipalId);
  if (!preflight.eligible || !attestation) return { status: 'DENIED', reason: preflight.reason };
  const verified = await verifier.verifyAndConsume(request, attestation);
  if (!verified) return { status: 'DENIED', reason: 'trusted_verification_failed' };
  if (verified.requestId !== request.requestId ||
      verified.humanPrincipalId !== expectedHumanPrincipalId ||
      verified.tenantId !== request.tenantId ||
      verified.actor !== request.actor || verified.action !== request.action ||
      verified.scopePrefix !== request.scopePrefix ||
      verified.targetPrefix !== request.targetPrefix ||
      verified.expiresAtMs !== request.expiresAtMs ||
      verified.maxExecutions !== request.maxExecutions ||
      verified.maxEffectUnits !== request.maxEffectUnits ||
      verified.expiresAtMs <= nowMs) {
    return { status: 'DENIED', reason: 'verified_claim_mismatch' };
  }
  const issued = await issuer.issueVerifiedApproval(verified);
  if (!issued?.mandateId) return { status: 'DENIED', reason: 'issuer_did_not_confirm' };
  return { status: 'ISSUED', reason: 'governed_issuer_confirmed', mandateId: issued.mandateId };
}
