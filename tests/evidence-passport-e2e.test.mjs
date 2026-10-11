import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { evidenceClaimDigest } from '../dist/identity/unifiedTrustFabric.js';

function parse(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text;
  assert.equal(typeof text, 'string');
  return JSON.parse(text);
}

function canonical(a) {
  return JSON.stringify([
    a.version, a.attestationId, a.issuerId, a.keyId, a.attestationClass,
    a.subjectId, a.action, a.target, a.transitionId, a.claimDigest,
    a.resultDigest ?? null, a.issuedAtMs, a.expiresAtMs, a.nonce
  ]);
}

async function spawnWithAnchor(anchor) {
  const cwd = resolve('.');
  const dataDir = await mkdtemp(join(tmpdir(), 'nyxa-passport-e2e-'));
  const transport = new StdioClientTransport({
    command: '/usr/bin/node',
    args: ['dist/index.js'],
    cwd,
    env: {
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      HOME: cwd,
      LANG: 'C.UTF-8',
      NYXA_AGENT_MODE: 'draft',
      NYXA_DATA_DIR: dataDir,
      NYXA_CONNECTOR_CONFIG: join(cwd, 'config', 'connector.dev.example.json'),
      NYXA_EVIDENCE_PASSPORT_TRUST_ANCHORS_JSON: JSON.stringify([anchor])
    },
    stderr: 'pipe'
  });
  const client = new Client({ name: 'evidence-passport-e2e', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

test('real MCP: self-asserted FACT is blocked, same claim with valid pinned Passport is accepted', async (t) => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const anchor = {
    issuerId: 'nyxa-test-attestor',
    keyId: 'ed25519:e2e',
    publicKeyPem,
    allowedClasses: ['connector_observation'],
    maxAgeSeconds: 300
  };
  const client = await spawnWithAnchor(anchor);
  t.after(async () => client.close());

  const actor = 'evidence-e2e-agent';
  const action = 'nyxa_read_file';
  const target = 'governed-original:/README.md';
  const taskId = 'passport-e2e';
  const runIdBlocked = 'blocked';
  const runIdAllowed = 'allowed';

  const bareClaim = {
    tag: 'FACT',
    statement: 'README exists and can be read.',
    source: 'nyxa-test-attestor'
  };

  const blockedProposal = {
    actor, action, target,
    scope: 'read one verified file',
    claims: [bareClaim],
    uncertainty: 0,
    requestedCapabilityClass: 'I0',
    estimatedIrreversibility: 'I0',
    provenance: { taskId, runId: runIdBlocked, requestingIdentity: 'integration-test' }
  };
  const blocked = parse(await client.callTool({
    name: 'nyxa_propose_action',
    arguments: { proposal: blockedProposal }
  }));
  assert.equal(blocked.policy_decision, 'DENY');
  assert.equal(blocked.domain, 'C4');
  assert.equal(blocked.reason, 'evidence_passport_required_claim_0');

  const claim = {
    ...bareClaim,
    attestationRef: 'att:e2e:1'
  };
  const now = Date.now();
  const unsigned = {
    version: 'nyxa.evidence-passport.v1',
    attestationId: claim.attestationRef,
    issuerId: anchor.issuerId,
    keyId: anchor.keyId,
    attestationClass: 'connector_observation',
    subjectId: actor,
    action,
    target,
    transitionId: taskId + ':' + runIdAllowed,
    claimDigest: evidenceClaimDigest(claim),
    resultDigest: 'b'.repeat(64),
    issuedAtMs: now - 1000,
    expiresAtMs: now + 60_000,
    nonce: 'nonce:e2e:1'
  };
  const attestation = {
    ...unsigned,
    signature: sign(null, Buffer.from(canonical(unsigned), 'utf8'), privateKey).toString('base64url')
  };

  const allowedProposal = {
    actor, action, target,
    scope: 'read one verified file',
    claims: [claim],
    evidencePassports: [attestation],
    uncertainty: 0,
    requestedCapabilityClass: 'I0',
    estimatedIrreversibility: 'I0',
    provenance: { taskId, runId: runIdAllowed, requestingIdentity: 'integration-test' }
  };
  const allowed = parse(await client.callTool({
    name: 'nyxa_propose_action',
    arguments: { proposal: allowedProposal }
  }));
  assert.equal(allowed.policy_decision, 'ALLOW');
  assert.equal(allowed.result.policy_decision, 'ALLOWED');
  assert.match(allowed.result.data.text, /NYXA/i);
});

test('real MCP: correct-looking Passport signed by an untrusted key is C4 denied', async (t) => {
  const trusted = generateKeyPairSync('ed25519');
  const attacker = generateKeyPairSync('ed25519');
  const anchor = {
    issuerId: 'nyxa-test-attestor',
    keyId: 'ed25519:e2e',
    publicKeyPem: trusted.publicKey.export({ type: 'spki', format: 'pem' }),
    allowedClasses: ['connector_observation'],
    maxAgeSeconds: 300
  };
  const client = await spawnWithAnchor(anchor);
  t.after(async () => client.close());

  const actor = 'evidence-e2e-agent';
  const action = 'nyxa_read_file';
  const target = 'governed-original:/README.md';
  const taskId = 'passport-e2e-wrong-signer';
  const runId = 'run-1';
  const claim = {
    tag: 'FACT',
    statement: 'README exists and can be read.',
    source: 'nyxa-test-attestor',
    attestationRef: 'att:e2e:attacker'
  };
  const now = Date.now();
  const unsigned = {
    version: 'nyxa.evidence-passport.v1',
    attestationId: claim.attestationRef,
    issuerId: anchor.issuerId,
    keyId: anchor.keyId,
    attestationClass: 'connector_observation',
    subjectId: actor,
    action,
    target,
    transitionId: taskId + ':' + runId,
    claimDigest: evidenceClaimDigest(claim),
    issuedAtMs: now - 1000,
    expiresAtMs: now + 60_000,
    nonce: 'nonce:e2e:attacker'
  };
  const attestation = {
    ...unsigned,
    signature: sign(null, Buffer.from(canonical(unsigned), 'utf8'), attacker.privateKey).toString('base64url')
  };
  const proposal = {
    actor, action, target,
    scope: 'attempt forged evidence passport',
    claims: [claim],
    evidencePassports: [attestation],
    uncertainty: 0,
    requestedCapabilityClass: 'I0',
    estimatedIrreversibility: 'I0',
    provenance: { taskId, runId, requestingIdentity: 'integration-test' }
  };
  const result = parse(await client.callTool({
    name: 'nyxa_propose_action',
    arguments: { proposal }
  }));
  assert.equal(result.policy_decision, 'DENY');
  assert.equal(result.domain, 'C4');
  assert.equal(result.reason, 'evidence_passport_invalid_claim_0');
});
