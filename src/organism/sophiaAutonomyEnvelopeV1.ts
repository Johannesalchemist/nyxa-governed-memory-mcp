/** Proposed autonomy envelope. This document is not an authority credential. */
export type SophiaAutonomyDomain =
  | 'research' | 'reflection' | 'simulation' | 'dialogue' | 'learning_candidate'
  | 'workflow' | 'external_communication' | 'physical_effect';

export type SophiaAutonomyRequest = Readonly<{
  domain: SophiaAutonomyDomain;
  tenantId: string;
  targetTenantId: string;
  involvesPersonalData: boolean;
  consentVerified: boolean;
  hasVerifiedMandate: boolean;
  governanceApproved: boolean;
  requestedExternalEffect: boolean;
}>;

export type SophiaAutonomyDecision = Readonly<{
  eligible: boolean;
  reason: string;
  authorityEffect: 'NONE';
  requiresGovernedDispatch: boolean;
}>;

/** Conservative eligibility classification; NEVER sufficient to execute an action. */
export function assessSophiaAutonomy(request: SophiaAutonomyRequest): SophiaAutonomyDecision {
  const deny = (reason: string): SophiaAutonomyDecision => ({
    eligible: false, reason, authorityEffect: 'NONE', requiresGovernedDispatch: true
  });
  if (!request.tenantId || !request.targetTenantId) return deny('tenant_missing');
  if (request.tenantId !== request.targetTenantId) return deny('cross_tenant_requires_separate_authorization');
  if (request.involvesPersonalData && !request.consentVerified) return deny('consent_required');
  const internal = request.domain === 'research' || request.domain === 'reflection' ||
    request.domain === 'simulation' || request.domain === 'dialogue' ||
    request.domain === 'learning_candidate';
  if (internal && !request.requestedExternalEffect) {
    return { eligible: true, reason: 'internal_exploration_candidate', authorityEffect: 'NONE',
      requiresGovernedDispatch: true };
  }
  if (!request.hasVerifiedMandate) return deny('verified_mandate_required');
  if (!request.governanceApproved) return deny('governance_approval_required');
  return { eligible: true, reason: 'candidate_for_governed_dispatch',
    authorityEffect: 'NONE', requiresGovernedDispatch: true };
}
