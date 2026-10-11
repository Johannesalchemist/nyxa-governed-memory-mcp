# NYXA Evidence Passport V1

Status: implemented in the development clone; verifier-only; not production-deployed by this change.

## Security property

A proposal-controlled string is never sufficient proof of provenance.

The following are NOT trusted evidence by themselves:

- `tag: FACT`
- a non-empty `source`
- peer-agent agreement or majority
- a JSON object that looks like a tool receipt
- a claimed verifier name
- a human grant or mandate

The live governance rule is:

```
authenticated issuer
  != authorized attestor
  != sufficient evidence
  != commit authority
```

## Trust boundary

Evidence Passport V1 uses Ed25519 verification.

The governance process contains public verification anchors only. Private signing keys belong to
external attestors/connectors and must not be placed in agent context or in the gamma verifier.

Configured public anchors are read from:

`NYXA_EVIDENCE_PASSPORT_TRUST_ANCHORS_JSON`

No configured anchor means that self-asserted `FACT` / `EXTERNAL_EVIDENCE` claims fail closed.

## Signed binding

An Evidence Passport binds:

- version
- attestation id
- issuer id
- key id
- attestation class
- subject/actor id
- action
- canonical target
- transition id (`taskId:runId`)
- exact claim digest
- optional result digest
- issue/expiry time
- nonce

The canonical byte representation is produced by
`canonicalEvidencePassportPayload()` in `src/identity/unifiedTrustFabric.ts`.

## C4 semantics

1. Every claim still needs a non-blank source.
2. `EXTERNAL_EVIDENCE` still obeys the 24-hour freshness window.
3. `FACT` and `EXTERNAL_EVIDENCE` are trust-bearing labels. They require an exact verified
   Evidence Passport, including claim/action/target/transition binding.
4. If a claim presents an `attestationRef` but verification fails, C4 DENYs.
5. Tool policies may additionally set `requiresTrustedEvidence=true`. Those effects require at
   least one verified Passport even if a proposer downgrades its wording to `CLAIM` or
   `MODEL_OUTPUT`. This blocks semantic laundering.
6. A verified Passport has `authorityGranted:false` and cannot satisfy a missing mandate,
   human grant, irreversibility gate, capability gate or execution gate.

## Epistemic labels after V1

- `FACT` / `EXTERNAL_EVIDENCE`: independently attested in the live proposal path.
- `CLAIM` / `MODEL_OUTPUT` / `INFERENCE` / `HYPOTHESIS`: may be proposer-generated and do
  not become truth merely by persistence.
- Pending memory and Dream candidates are explicitly non-authoritative I1 writes.
- Promotion to authoritative state retains separate authority and epistemic gates.

## Replay and revocation

A Passport is signed for one transition id, so it cannot validate a different task/run.
The existing atomic NYXA ReplayGuard protects an already-used transition from duplicate commit.

V1 supports key-level revocation/rotation by removing or replacing a public trust anchor.
Per-attestation CRL/nonce-consumption is NOT implemented in V1 and must not be claimed.

## Real-incident regression

The pre-fix live behavior accepted 8/8 agent-controlled receipt labels as C4-sufficient on an
I0 proposal. After the V1 development repair the same eight variants yield 0 unsafe ALLOWs.

Additional regressions cover:

- wrong signer
- unknown trust anchor
- tampered claim
- action mismatch
- target mismatch
- transition mismatch
- expiry
- peer-agent authority laundering
- FACT-to-CLAIM semantic laundering
- valid Passport never creating I2 commit authority

## Deployment prerequisites

Before enabling this in production:

1. provision an external signing service or connector-owned signing identity;
2. keep private keys outside the MCP/governance process;
3. pin only required public keys and attestation classes;
4. define key rotation/revocation procedure;
5. rerun the real-incident suite against the deploy candidate;
6. verify `governance.status.evidence_passport`;
7. deploy without bypassing existing C2/C3/C5/E0/ExecutionGate controls.
