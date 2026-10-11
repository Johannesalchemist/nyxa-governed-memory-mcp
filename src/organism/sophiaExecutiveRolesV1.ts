/** Sophia's proposed operational roles; role labels never create legal or technical authority. */
export type SophiaRole = 'nyxa_operational_ceo' | 'personal_assistant';
export type SophiaResponsibility =
  | 'strategy' | 'research' | 'project_coordination' | 'agent_coordination'
  | 'quality_review' | 'meeting_preparation' | 'calendar_management'
  | 'correspondence_drafting' | 'contact_management' | 'workflow_supervision';
export type SophiaExecutiveAssignment = Readonly<{
  role: SophiaRole;
  principalId: string;
  tenantId: string;
  responsibility: SophiaResponsibility;
  targetTenantId: string;
  externalEffect: boolean;
  personalData: boolean;
  consentVerified: boolean;
  verifiedMandate: boolean;
  governanceApproved: boolean;
  legallyBinding: boolean;
  financialCommitment: boolean;
}>;
export type SophiaExecutiveDecision = Readonly<{
  eligibleForGovernedDispatch: boolean;
  reason: string;
  humanApprovalRequired: boolean;
  authorityEffect: 'NONE';
}>;

const ceoResponsibilities: ReadonlySet<SophiaResponsibility> = new Set([
  'strategy', 'research', 'project_coordination', 'agent_coordination',
  'quality_review', 'meeting_preparation', 'workflow_supervision'
]);
const assistantResponsibilities: ReadonlySet<SophiaResponsibility> = new Set([
  'research', 'meeting_preparation', 'calendar_management',
  'correspondence_drafting', 'contact_management', 'workflow_supervision'
]);

/** Decision-support only: the authenticated mandate and execution gates remain authoritative. */
export function assessSophiaExecutiveAssignment(a: SophiaExecutiveAssignment): SophiaExecutiveDecision {
  const deny = (reason: string, humanApprovalRequired = false): SophiaExecutiveDecision => ({
    eligibleForGovernedDispatch: false, reason, humanApprovalRequired, authorityEffect: 'NONE'
  });
  if (!a.principalId || !a.tenantId || !a.targetTenantId) return deny('identity_or_tenant_missing');
  const responsibilities = a.role === 'nyxa_operational_ceo' ? ceoResponsibilities : assistantResponsibilities;
  if (!responsibilities.has(a.responsibility)) return deny('responsibility_outside_role');
  if (a.tenantId !== a.targetTenantId) return deny('cross_tenant_authority_required', true);
  if (a.personalData && !a.consentVerified) return deny('personal_data_consent_required', true);
  if (a.legallyBinding || a.financialCommitment) return deny('specific_human_authorization_required', true);
  if (a.externalEffect && !a.verifiedMandate) return deny('verified_mandate_required', true);
  if (a.externalEffect && !a.governanceApproved) return deny('governance_approval_required', true);
  return {
    eligibleForGovernedDispatch: true,
    reason: a.externalEffect ? 'eligible_for_governed_dispatch' : 'internal_decision_support_eligible',
    humanApprovalRequired: false,
    authorityEffect: 'NONE'
  };
}
