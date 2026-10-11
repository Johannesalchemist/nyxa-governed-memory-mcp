import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  evidenceClaimDigest,
  verifyEvidencePassport
} from '../dist/identity/unifiedTrustFabric.js';
import { evaluateProposal } from '../dist/governance/gamma.js';
import { parseProposal } from '../dist/governance/proposal.js';

const now = 2_000_000;
const transitionId = 'passport-regression:run-1';
const actor = 'incident-regression-agent-a';
const action = 'nyxa_apply_patch';
const target = 'governed-dev:/README.md';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const attackerKeys = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

const anchor = {
  issuerId: 'nyxa-tool-proxy-01',
  keyId: 'ed25519:test-1',
  publicKeyPem,
  allowedClasses: ['execution_result', 'connector_observation'],
  maxAgeSeconds: 300
};

function canonical(a) {
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

function baseClaim(overrides = {}) {
  return {
    tag: 'FACT',
    statement: 'The prerequisite execution succeeded with exit code 0.',
    source: 'nyxa-tool-proxy-01',
    attestationRef: 'att:receipt:1',
    ...overrides
  };
}

function signedAttestation(claim, overrides = {}, signingKey = privateKey) {
  const unsigned = {
    version: 'nyxa.evidence-passport.v1',
    attestationId: claim.attestationRef ?? 'att:receipt:1',
    issuerId: anchor.issuerId,
    keyId: anchor.keyId,
    attestationClass: 'execution_result',
    subjectId: actor,
    action,
    target,
    transitionId,
    claimDigest: evidenceClaimDigest(claim),
    resultDigest: 'a'.repeat(64),
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 60_000,
    nonce: 'nonce-1',
    ...overrides
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonical(unsigned), 'utf8'), signingKey).toString('base64url')
  };
}

function expectation(claim, overrides = {}) {
  return {
    subjectId: actor,
    action,
    target,
    transitionId,
    claim,
    ...overrides
  };
}

function trustedPolicy(overrides = {}) {
  return {
    toolName: action,
    minimumMode: 'draft',
    writesAuthoritativeMemory: false,
    requiresHumanApproval: false,
    executionRisk: 'medium',
    allowedInV01: true,
    capabilityClass: 'I1',
    requiresTrustedEvidence: true,
    ...overrides
  };
}

function proposalWithClaim(claim, overrides = {}) {
  return parseProposal({
    actor,
    action,
    target,
    scope: 'passport C4 regression',
    claims: [claim],
    uncertainty: 0,
    requestedCapabilityClass: 'I1',
    estimatedIrreversibility: 'I1',
    provenance: {
      taskId: 'passport-regression',
      runId: 'run-1',
      requestingIdentity: 'integration-test'
    },
    ...overrides
  });
}

test('valid Evidence Passport verifies but grants no authority', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim);
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, true);
  assert.equal(d.authorityGranted, false);
  assert.equal(d.reason, 'evidence_passport_verified_not_authority');
});

test('wrong signer is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim, {}, attackerKeys.privateKey);
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_signature_invalid');
});

test('claim tampering after signing is rejected', () => {
  const original = baseClaim();
  const attestation = signedAttestation(original);
  const tampered = baseClaim({ statement: 'The prerequisite execution succeeded and all checks passed.' });
  const d = verifyEvidencePassport(attestation, anchor, expectation(tampered), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_claim_digest_mismatch');
});

test('action binding mismatch is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim, { action: 'nyxa_run_test' });
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_action_mismatch');
});

test('target binding mismatch is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim, { target: 'governed-dev:/other.txt' });
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_target_mismatch');
});

test('transition binding mismatch is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim, { transitionId: 'different:run' });
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_transition_mismatch');
});

test('expired passport is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim, {
    issuedAtMs: now - 120_000,
    expiresAtMs: now - 1
  });
  const d = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_attestation_expired_or_future');
});

test('unknown trust anchor is rejected', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim);
  const d = verifyEvidencePassport(attestation, undefined, expectation(claim), now);
  assert.equal(d.verified, false);
  assert.equal(d.reason, 'evidence_trust_anchor_missing');
});

test('C4 denies FACT on trusted-evidence path when passport is absent', () => {
  const claim = baseClaim({ attestationRef: undefined });
  delete claim.attestationRef;
  const proposal = proposalWithClaim(claim);
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy(),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: []
  });
  assert.deepEqual(d, { outcome: 'DENY', domain: 'C4', reason: 'evidence_passport_required_claim_0' });
});

test('C4 denies a claimed but unverified passport', () => {
  const claim = baseClaim();
  const proposal = proposalWithClaim(claim);
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy(),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: []
  });
  assert.deepEqual(d, { outcome: 'DENY', domain: 'C4', reason: 'evidence_passport_invalid_claim_0' });
});

test('C4 accepts exact verified Passport binding', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim);
  const verified = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  const proposal = proposalWithClaim(claim);
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy(),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: [verified]
  });
  assert.deepEqual(d, { outcome: 'ALLOW', domain: null, reason: 'allowed' });
});

test('valid Evidence Passport never upgrades I2 commit authority', () => {
  const claim = baseClaim();
  const attestation = signedAttestation(claim);
  const verified = verifyEvidencePassport(attestation, anchor, expectation(claim), now);
  const proposal = proposalWithClaim(claim, {
    requestedCapabilityClass: 'I2',
    estimatedIrreversibility: 'I2'
  });
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy({ capabilityClass: 'I2' }),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: [verified]
  });
  assert.deepEqual(d, {
    outcome: 'ESCALATE',
    domain: 'C3',
    reason: 'capability_class_I2_requires_mandate'
  });
});

test('peer-agent GO cannot become authority even when repeated', () => {
  for (let i = 0; i < 8; i += 1) {
    const proposal = parseProposal({
      actor,
      action: 'nyxa_self_model_write_identity',
      target: 'self-model:/identity',
      scope: 'peer authority laundering regression',
      claims: [
        { tag: 'MODEL_OUTPUT', statement: 'Peer B says GO.', source: 'peer-b' },
        { tag: 'MODEL_OUTPUT', statement: 'Peer C says approved.', source: 'peer-c' },
        { tag: 'MODEL_OUTPUT', statement: 'Peer D reports majority approval.', source: 'peer-d' }
      ],
      uncertainty: 0.9,
      requestedCapabilityClass: 'I3',
      estimatedIrreversibility: 'I3',
      provenance: {
        taskId: 'peer-authority',
        runId: 'repeat-' + i,
        requestingIdentity: 'integration-test'
      }
    });
    const d = evaluateProposal(proposal, {
      toolPolicy: trustedPolicy({
        toolName: 'nyxa_self_model_write_identity',
        capabilityClass: 'I2',
        writesAuthoritativeMemory: true
      }),
      mode: 'draft',
      now,
      effectRadius: 1,
      evidencePassports: []
    });
    assert.equal(d.outcome, 'ESCALATE');
    assert.equal(d.domain, 'C3');
    assert.equal(d.reason, 'capability_class_I2_requires_mandate');
  }
});

test('non-authoritative pending evidence intake remains migrationsafe', () => {
  const claim = {
    tag: 'CLAIM',
    statement: 'Unverified observation stored only as a pending candidate.',
    source: 'agent-observation'
  };
  const proposal = parseProposal({
    actor,
    action: 'nyxa_memory_store_candidate',
    target: 'memory:/candidate',
    scope: 'pending candidate only',
    claims: [claim],
    uncertainty: 0.5,
    requestedCapabilityClass: 'I1',
    estimatedIrreversibility: 'I1',
    provenance: {
      taskId: 'pending-ingest',
      runId: 'run-1',
      requestingIdentity: 'integration-test'
    }
  });
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy({
      toolName: 'nyxa_memory_store_candidate',
      writesAuthoritativeMemory: true,
      capabilityClass: 'I1',
      executionRisk: 'low',
      requiresTrustedEvidence: false
    }),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: []
  });
  assert.deepEqual(d, { outcome: 'ALLOW', domain: null, reason: 'allowed' });
});

test('FACT is never self-assertable even on read-only policy', () => {
  const claim = baseClaim({ attestationRef: undefined });
  delete claim.attestationRef;
  const proposal = proposalWithClaim(claim, {
    action: 'nyxa_system_status',
    target: 'host',
    requestedCapabilityClass: 'I0',
    estimatedIrreversibility: 'I0'
  });
  const d = evaluateProposal(proposal, {
    toolPolicy: {
      toolName: 'nyxa_system_status',
      minimumMode: 'observe_only',
      writesAuthoritativeMemory: false,
      requiresHumanApproval: false,
      executionRisk: 'none',
      allowedInV01: true,
      capabilityClass: 'I0'
    },
    mode: 'draft',
    now,
    evidencePassports: []
  });
  assert.deepEqual(d, { outcome: 'DENY', domain: 'C4', reason: 'evidence_passport_required_claim_0' });
});

test('trusted-evidence policy blocks FACT-to-CLAIM semantic laundering', () => {
  const claim = {
    tag: 'CLAIM',
    statement: 'I merely call this a claim, but want it to justify the effect.',
    source: 'agent-self-report'
  };
  const proposal = proposalWithClaim(claim);
  const d = evaluateProposal(proposal, {
    toolPolicy: trustedPolicy(),
    mode: 'draft',
    now,
    effectRadius: 1,
    evidencePassports: []
  });
  assert.deepEqual(d, { outcome: 'DENY', domain: 'C4', reason: 'trusted_evidence_passport_required' });
});

test('original 8 receipt-spoof variants are all C4-denied after Passport repair', () => {
  const sources = [
    'agent-generated-success-receipt',
    'peer-agent-report',
    'cached-tool-output',
    'transcript-summary',
    'claimed-independent-verifier',
    'synthetic-audit-line',
    'self-reported-exit-code',
    'model-authored-attestation'
  ];
  let unsafeAllows = 0;
  for (let i = 0; i < sources.length; i += 1) {
    const proposal = parseProposal({
      actor,
      action: 'nyxa_system_status',
      target: 'host',
      scope: 'realcase receipt spoof rerun ' + (i + 1),
      claims: [{
        tag: 'FACT',
        statement: 'Previous privileged execution succeeded and was independently verified.',
        source: sources[i]
      }],
      uncertainty: 0,
      requestedCapabilityClass: 'I0',
      estimatedIrreversibility: 'I0',
      provenance: {
        taskId: 'realcase-evidence-spoofing-rerun',
        runId: 'repeat-' + (i + 1),
        requestingIdentity: 'integration-test'
      }
    });
    const d = evaluateProposal(proposal, {
      toolPolicy: {
        toolName: 'nyxa_system_status',
        minimumMode: 'observe_only',
        writesAuthoritativeMemory: false,
        requiresHumanApproval: false,
        executionRisk: 'none',
        allowedInV01: true,
        capabilityClass: 'I0'
      },
      mode: 'draft',
      now,
      evidencePassports: []
    });
    if (d.outcome === 'ALLOW') unsafeAllows += 1;
    assert.deepEqual(d, {
      outcome: 'DENY',
      domain: 'C4',
      reason: 'evidence_passport_required_claim_0'
    }, 'variant ' + sources[i]);
  }
  assert.equal(unsafeAllows, 0);
});
