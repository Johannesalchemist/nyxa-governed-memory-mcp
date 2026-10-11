import { createHash, verify as verifySignature } from 'node:crypto';
import type { SrmClaim } from '../srm/types.js';

/** NYXA Unified Identity & Trust Fabric. Evidence evaluation only: no secrets, no authentication bypass, no effects. */
export type SubjectKind = 'human' | 'agent' | 'service';
export type VerificationMethod = 'customer_reference' | 'knowledge_check' | 'provider_challenge' | 'passkey' | 'external_identity' | 'agent_credential' | 'service_certificate';
export type VerificationProfile = Readonly<{
  profileId: string;
  version: string;
  subjectKind: SubjectKind;
  acceptedMethods: readonly VerificationMethod[];
  requiredMethods: readonly VerificationMethod[];
  verifierId: string;
  maxEvidenceAgeSeconds: number;
}>;
export type VerificationEvidence = Readonly<{
  method: VerificationMethod;
  subjectId: string;
  verifierId: string;
  verifiedAtMs: number;
  expiresAtMs: number;
  referenceId: string;
  outcome: 'VERIFIED' | 'REJECTED';
}>;
export type VerificationDecision = Readonly<{
  verified: boolean;
  reason: string;
  subjectId?: string;
  profileId: string;
  evidenceReferences: readonly string[];
  authorityGranted: false;
}>;
/** Caller must supply attestations obtained through an authenticated trusted-verifier channel. */
export function evaluateVerification(profile: VerificationProfile, subjectId: string, evidence: readonly VerificationEvidence[], nowMs: number): VerificationDecision {
  const fail = (reason: string): VerificationDecision => ({verified:false, reason, profileId:profile.profileId, evidenceReferences:[], authorityGranted:false});
  if (!profile.profileId || !profile.version || !profile.verifierId || !subjectId || !Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(profile.maxEvidenceAgeSeconds) || profile.maxEvidenceAgeSeconds < 1 || profile.maxEvidenceAgeSeconds > 86400) return fail('invalid_profile');
  if (!profile.requiredMethods.length || profile.requiredMethods.some(m => !profile.acceptedMethods.includes(m))) return fail('invalid_methods');
  if (evidence.length > 32) return fail('evidence_limit');
  const valid = evidence.filter(e => e.outcome === 'VERIFIED' && e.subjectId === subjectId && e.verifierId === profile.verifierId && profile.acceptedMethods.includes(e.method) && Number.isSafeInteger(e.verifiedAtMs) && Number.isSafeInteger(e.expiresAtMs) && e.verifiedAtMs <= nowMs && e.expiresAtMs > nowMs && nowMs - e.verifiedAtMs <= profile.maxEvidenceAgeSeconds * 1000 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(e.referenceId));
  if (!profile.requiredMethods.every(m => valid.some(e => e.method === m))) return fail('required_evidence_missing');
  return {verified:true, reason:'evidence_requirements_met_not_authorized', subjectId, profileId:profile.profileId, evidenceReferences:[...new Set(valid.map(e=>e.referenceId))], authorityGranted:false};
}

/**
 * Evidence Passport V1
 *
 * A claim is not trusted because its text says FACT or because source contains
 * a plausible verifier name. Trust is created only by validating an
 * attestation against a server-owned public trust anchor. The signing key must
 * remain outside the governance verifier and outside agent context.
 */
export type EvidenceAttestationClass =
  | 'execution_result'
  | 'connector_observation'
  | 'external_evidence'
  | 'human_observation';

export type EvidencePassportTrustAnchor = Readonly<{
  issuerId: string;
  keyId: string;
  publicKeyPem: string;
  allowedClasses: readonly EvidenceAttestationClass[];
  maxAgeSeconds: number;
}>;

export type EvidencePassportAttestation = Readonly<{
  version: 'nyxa.evidence-passport.v1';
  attestationId: string;
  issuerId: string;
  keyId: string;
  attestationClass: EvidenceAttestationClass;
  subjectId: string;
  action: string;
  target: string;
  transitionId: string;
  claimDigest: string;
  resultDigest?: string | undefined;
  issuedAtMs: number;
  expiresAtMs: number;
  nonce: string;
  signature: string;
}>;

export type EvidencePassportDecision = Readonly<{
  verified: boolean;
  reason: string;
  attestationId?: string;
  issuerId?: string;
  claimDigest?: string;
  action?: string;
  target?: string;
  transitionId?: string;
  authorityGranted: false;
}>;

export type EvidencePassportExpectation = Readonly<{
  subjectId: string;
  action: string;
  target: string;
  transitionId: string;
  claim: SrmClaim;
}>;

export function canonicalEvidencePassportPayload(a: Omit<EvidencePassportAttestation, 'signature'>): string {
  return JSON.stringify([
    a.version,
    a.attestationId,
    a.issuerId,
    a.keyId,
    a.attestationClass,
    a.subjectId,
    a.action,
    a.target,
    a.transitionId,
    a.claimDigest,
    a.resultDigest ?? null,
    a.issuedAtMs,
    a.expiresAtMs,
    a.nonce
  ]);
}

export function evidenceClaimDigest(claim: SrmClaim): string {
  return createHash('sha256')
    .update(JSON.stringify([claim.tag, claim.statement, claim.source, claim.asOf ?? null]))
    .digest('hex');
}

export function verifyEvidencePassport(
  attestation: EvidencePassportAttestation | undefined,
  anchor: EvidencePassportTrustAnchor | undefined,
  expected: EvidencePassportExpectation,
  nowMs: number
): EvidencePassportDecision {
  const fail = (reason: string): EvidencePassportDecision => ({ verified: false, reason, authorityGranted: false });
  if (!attestation) return fail('evidence_attestation_missing');
  if (!anchor) return fail('evidence_trust_anchor_missing');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return fail('invalid_clock');
  if (attestation.version !== 'nyxa.evidence-passport.v1') return fail('evidence_passport_version_invalid');
  if (attestation.issuerId !== anchor.issuerId || attestation.keyId !== anchor.keyId) return fail('evidence_issuer_or_key_mismatch');
  if (!anchor.allowedClasses.includes(attestation.attestationClass)) return fail('evidence_attestation_class_not_allowed');
  if (!Number.isSafeInteger(anchor.maxAgeSeconds) || anchor.maxAgeSeconds < 1 || anchor.maxAgeSeconds > 86400) return fail('evidence_anchor_invalid');
  if (!Number.isSafeInteger(attestation.issuedAtMs) || !Number.isSafeInteger(attestation.expiresAtMs)) return fail('evidence_time_invalid');
  if (attestation.issuedAtMs > nowMs || attestation.expiresAtMs <= nowMs || attestation.expiresAtMs <= attestation.issuedAtMs) return fail('evidence_attestation_expired_or_future');
  if (nowMs - attestation.issuedAtMs > anchor.maxAgeSeconds * 1000) return fail('evidence_attestation_stale');
  if (!attestation.attestationId || !attestation.nonce || !attestation.transitionId) return fail('evidence_attestation_identity_incomplete');
  if (attestation.subjectId !== expected.subjectId) return fail('evidence_subject_mismatch');
  if (attestation.action !== expected.action) return fail('evidence_action_mismatch');
  if (attestation.target !== expected.target) return fail('evidence_target_mismatch');
  if (attestation.transitionId !== expected.transitionId) return fail('evidence_transition_mismatch');
  const digest = evidenceClaimDigest(expected.claim);
  if (attestation.claimDigest !== digest) return fail('evidence_claim_digest_mismatch');
  const { signature, ...unsigned } = attestation;
  let validSignature = false;
  try {
    validSignature = verifySignature(
      null,
      Buffer.from(canonicalEvidencePassportPayload(unsigned), 'utf8'),
      anchor.publicKeyPem,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return fail('evidence_signature_invalid');
  }
  if (!validSignature) return fail('evidence_signature_invalid');
  return {
    verified: true,
    reason: 'evidence_passport_verified_not_authority',
    attestationId: attestation.attestationId,
    issuerId: attestation.issuerId,
    claimDigest: digest,
    action: attestation.action,
    target: attestation.target,
    transitionId: attestation.transitionId,
    authorityGranted: false
  };
}
