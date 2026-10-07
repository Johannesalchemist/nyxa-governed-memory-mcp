import type { ValidatedProposal } from './proposal.js';
import type { ToolPolicy } from '../policy/toolPolicy.js';

export type KernelEffectClass = 'read' | 'reversible' | 'irreversible';
export type KernelVerification = 'none' | 'receipt' | 'independent';

export type KernelEffectEnvelope = {
  version: 'nyxa.kernel.v1';
  actor: string;
  action: string;
  target: string;
  scope: string;
  effectClass: KernelEffectClass;
  authorityRequired: boolean;
  verification: KernelVerification;
};

export type KernelContractDecision =
  | { allowed: true; envelope: KernelEffectEnvelope }
  | { allowed: false; reason: string };

export function buildKernelEffectEnvelope(
  proposal: ValidatedProposal,
  policy: ToolPolicy | undefined
): KernelContractDecision {
  if (!policy) return { allowed: false, reason: 'kernel_unknown_action_policy' };

  const effectClass: KernelEffectClass = policy.capabilityClass === 'I0'
    ? 'read'
    : policy.capabilityClass === 'I1'
      ? 'reversible'
      : 'irreversible';

  const authorityRequired = effectClass !== 'read';
  const verification: KernelVerification = effectClass === 'read'
    ? 'none'
    : effectClass === 'reversible'
      ? 'receipt'
      : 'independent';

  if (!proposal.actor || !proposal.action || !proposal.target || !proposal.scope) {
    return { allowed: false, reason: 'kernel_incomplete_effect_identity' };
  }

  return {
    allowed: true,
    envelope: {
      version: 'nyxa.kernel.v1',
      actor: proposal.actor,
      action: proposal.action,
      target: proposal.target,
      scope: proposal.scope,
      effectClass,
      authorityRequired,
      verification
    }
  };
}
