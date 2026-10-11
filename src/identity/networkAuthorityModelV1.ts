/** Data-only identity and delegation model; does not grant authority. */
import type { MandateRecord } from '../governance/mandateStore.js';
import type { MandateStore } from '../governance/mandateStore.js';
import type { ValidatedProposal } from '../governance/proposal.js';
import { ExecutionGate, type ExecutionGateDecision } from '../governance/executionGate.js';
import type { ToolPolicy } from '../policy/toolPolicy.js';
import type { VerificationDecision } from './unifiedTrustFabric.js';
export type NetworkPrincipal = Readonly<{
  id: string;
  kind: 'human' | 'organization' | 'twin' | 'agent' | 'machine';
  tenantId: string;
  parentId?: string;
  credentialRef?: string;
}>;
export type NetworkMandate = Readonly<{
  id: string;
  principalId: string;
  issuerId: string;
  parentMandateId?: string;
  actions: readonly string[];
  targetPrefix: string;
  expiresAt: number;
  revoked: boolean;
}>;
export function checkDelegation(parent: NetworkMandate, child: NetworkMandate, now: number): boolean {
  return Number.isFinite(now) && Number.isFinite(parent.expiresAt) && Number.isFinite(child.expiresAt) &&
    parent.id.length > 0 && child.id.length > 0 && parent.id !== child.id &&
    parent.principalId === child.issuerId && parent.principalId !== child.principalId &&
    !parent.revoked && !child.revoked && parent.expiresAt > now && child.expiresAt > now &&
    child.expiresAt <= parent.expiresAt && child.parentMandateId === parent.id &&
    parent.targetPrefix.length > 0 && child.targetPrefix.startsWith(parent.targetPrefix) &&
    parent.actions.length > 0 && child.actions.length > 0 &&
    child.actions.every(action => parent.actions.includes(action));
}

/** An adapter from verified ledger records, never a substitute for ledger authentication. */
export function evaluateNetworkMandate(input: Readonly<{
  identity: VerificationDecision;
  principal: NetworkPrincipal;
  mandate: MandateRecord & { active: boolean; revoked: boolean };
  action: string;
  scope: string;
  target: string;
  now: number;
}>): { allowed: boolean; reason: string; mandateId?: string } {
  const { identity, principal, mandate, action, scope, target, now } = input;
  const deny = (reason: string) => ({ allowed: false, reason });
  if (!identity.verified || identity.subjectId !== principal.id) return deny('identity_not_verified');
  if (!principal.tenantId || !principal.id) return deny('principal_invalid');
  if (!Number.isSafeInteger(now) || now < 0) return deny('clock_invalid');
  if (!mandate.active || mandate.revoked) return deny('mandate_inactive');
  if (mandate.actor !== principal.id || mandate.action !== action) return deny('mandate_mismatch');
  if (mandate.scopePrefix && !scope.startsWith(mandate.scopePrefix)) return deny('scope_mismatch');
  if (mandate.targetPrefix && !target.startsWith(mandate.targetPrefix)) return deny('target_mismatch');
  const start = Date.parse(mandate.issuedAt);
  const end = Date.parse(mandate.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now < start || now >= end) return deny('mandate_expired');
  if (!mandate.issuedBy.authorityPrincipalId || !mandate.issuedBy.authorityMethod) return deny('issuer_missing');
  return { allowed: true, reason: 'eligible_for_governed_dispatch', mandateId: mandate.mandateId };
}

/** Read-only bridge to the authoritative mandate ledger; never issues or executes. */
export async function evaluateRegisteredNetworkMandate(input: Readonly<{
  store: MandateStore;
  identity: VerificationDecision;
  principal: NetworkPrincipal;
  action: string;
  scope: string;
  target: string;
  now: number;
}>): Promise<{ allowed: boolean; reason: string; mandateId?: string }> {
  if (!Number.isSafeInteger(input.now) || input.now < 0) return { allowed: false, reason: 'clock_invalid' };
  if (!input.identity.verified || input.identity.subjectId !== input.principal.id) return { allowed: false, reason: 'identity_not_verified' };
  const records = await input.store.list(input.now);
  const mandate = records.find(m => m.active && !m.revoked && m.actor === input.principal.id &&
    m.action === input.action && (!m.scopePrefix || input.scope.startsWith(m.scopePrefix)) &&
    (!m.targetPrefix || input.target.startsWith(m.targetPrefix)));
  if (!mandate) return { allowed: false, reason: 'registered_mandate_missing' };
  return evaluateNetworkMandate({ ...input, mandate });
}

/** Read ledger first, then reserve capacity. Never dispatches an effect. */
export async function evaluateNetworkExecutionReservation(input: Readonly<{
  store: MandateStore;
  identity: VerificationDecision;
  principal: NetworkPrincipal;
  proposal: ValidatedProposal;
  policy: ToolPolicy | undefined;
  gate: ExecutionGate;
  now: number;
}>): Promise<ExecutionGateDecision> {
  const { proposal } = input;
  if (proposal.actor !== input.principal.id || proposal.provenance.requestingIdentity !== input.principal.id) {
    return { allowed: false, outcome: 'DENY', reason: 'proposal_identity_mismatch', effectUnits: 0 };
  }
  const eligibility = await evaluateRegisteredNetworkMandate({
    store: input.store, identity: input.identity, principal: input.principal,
    action: proposal.action, scope: proposal.scope, target: proposal.target, now: input.now
  });
  if (!eligibility.allowed) return { allowed: false, outcome: 'DENY', reason: eligibility.reason, effectUnits: 0 };
  // No external lease is synthesized from an identity or an ordinary mandate.
  // Existing gate policies, budgets and external authority checks remain mandatory.
  return input.gate.evaluateAndReserve(proposal, input.policy, input.now);
}
