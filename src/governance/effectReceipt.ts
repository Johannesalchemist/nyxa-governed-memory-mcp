import { createHash } from 'node:crypto';
import type { KernelEffectEnvelope, KernelVerification } from './kernelContract.js';

export type KernelEffectReceipt = {
  version: 'nyxa.effect-receipt.v1';
  effectId: string;
  envelopeHash: string;
  action: string;
  target: string;
  verificationRequired: KernelVerification;
  execution: 'succeeded' | 'failed';
  verified: boolean;
  verifier: 'none' | 'handler-receipt' | 'independent';
};

function canonicalEnvelope(e: KernelEffectEnvelope): string {
  return JSON.stringify({version:e.version,actor:e.actor,action:e.action,target:e.target,scope:e.scope,effectClass:e.effectClass,authorityRequired:e.authorityRequired,verification:e.verification});
}
export function kernelEnvelopeHash(e: KernelEffectEnvelope): string { return createHash('sha256').update(canonicalEnvelope(e)).digest('hex'); }
export function buildKernelEffectReceipt(e: KernelEffectEnvelope, execution:'succeeded'|'failed', verifier:'none'|'handler-receipt'|'independent'): KernelEffectReceipt {
  const required=e.verification;
  const verified=execution==='succeeded' && (required==='none' ? verifier==='none' : required==='receipt' ? (verifier==='handler-receipt'||verifier==='independent') : verifier==='independent');
  const envelopeHash=kernelEnvelopeHash(e);
  return {version:'nyxa.effect-receipt.v1',effectId:`sha256:${createHash('sha256').update(envelopeHash+'\0'+execution+'\0'+verifier).digest('hex')}`,envelopeHash,action:e.action,target:e.target,verificationRequired:required,execution,verified,verifier};
}
export function verifyKernelEffectReceipt(e: KernelEffectEnvelope, r: KernelEffectReceipt): boolean {
  return r.version==='nyxa.effect-receipt.v1' && r.envelopeHash===kernelEnvelopeHash(e) && r.action===e.action && r.target===e.target && r.execution==='succeeded' && r.verified;
}
