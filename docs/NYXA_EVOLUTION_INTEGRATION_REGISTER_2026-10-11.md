# NYXA: Integration, Evidence and Evolution Activation Register

Date: 2026-10-11. Status: BASELINE, NOT YET CERTIFIED SELF-EVOLVING.

## Verified baseline

- Development repository: /opt/nyxa-governed-memory-mcp-dev, branch jev-weight-evolution-v0.
- GitHub remote branch contains commit e1faa0296941161cbc73329d9a0fb7e842cdbc0e.
- Production systemd service nyxa-governed-memory-mcp is active, working directory /opt/nyxa-governed-memory-mcp-runtime, executing node dist/index.js.
- Configured `npm run test:all` passed 18 security/adversarial tests and 1 integration test on the development tree; this does NOT cover the complete suite.
- 153 *.test.mjs files exist in tests/ at the time of inspection. A comprehensive test sweep remains outstanding.
- Development tree has concurrent modified/untracked files. Do not stage all or deploy indiscriminately.

## Existing capabilities, not to be reimplemented without inventory

| Capability | Known source | Integration evidence | State |
| --- | --- | --- | --- |
| Evolution loop | src/organism/evolutionLoop.ts | No proven production end-to-end path | EXISTS_NOT_VERIFIED_ACTIVE |
| Learning ratchet | src/organism/learningRatchet.ts | Imported by ratchetedEvolution.ts; production path not proven | EXISTS_PARTIALLY_CONNECTED |
| Ratcheted evolution | src/organism/ratchetedEvolution.ts | Module exists; production path not proven | EXISTS_NOT_VERIFIED_ACTIVE |
| Boundary discovery | src/organism/boundaryDiscovery.ts | Module exists; production path not proven | EXISTS_NOT_VERIFIED_ACTIVE |
| Hardware evolution | src/organism/hardwareEvolution.ts | Module exists; production path not proven | EXISTS_NOT_VERIFIED_ACTIVE |
| Governance | src/tools/governance.status.ts; src/tools/capability_gate.trace.ts | Modules exist; specific evolutionary enforcement not proven | EXISTS_NOT_VERIFIED_ACTIVE |
| Sophia telephony | src/organism/sophiaSecretaryTelephonyV1.ts; sophiaSecretaryCallDispatchV1.ts | Untracked work; no production evidence | IN_DEVELOPMENT |
| Cafe control | src/toolbox/cafeControlV1.ts; cafeBrokerClientV1.ts | Untracked work; no production evidence | IN_DEVELOPMENT |
| Study exam gateway | src/toolbox/examGatewayV1.ts; scripts/study-exam.mjs | Concurrent modifications; no complete certification | IN_DEVELOPMENT |

## Single-source-of-truth integration contract

1. Discover existing code, services, n8n workflows, MCP tools, adapters, tests and evidence BEFORE proposing a new module. Record canonical owner, version, runtime, interface, dependencies and overlap.
2. Classify every component as MISSING, EXISTS_NOT_CONNECTED, CONNECTED_NOT_TESTED, TESTED_NOT_DEPLOYED, or LIVE_VERIFIED. Never promote status without traceable evidence.
3. Route evolutionary proposals through the existing governance/capability gate. No implicit authorization from discovery, simulation or model output. External actions require explicit bounded mandates.
4. Evolution sequence: observe -> propose -> simulate -> independent adversarial review -> governance decision -> sandbox test -> human approval when required -> controlled deploy -> live probe -> evidence -> rollback or ratchet.
5. Fail closed on missing evidence, unknown permissions, unbounded resource consumption, unverified model output, or cross-service authority escalation. Maintain immutable audit identifiers and rollback points.
6. Never auto-merge, auto-deploy, mutate production or grant new permissions merely because tests pass. Establish an approved deployment policy and monitor runtime behavior.
7. Validate the COMPLETE applicable suite, not just package.json's narrow test:all selection. Include governance denial, prompt-injection, capability escalation, recovery and rollback tests.
8. Deploy from a reproducible commit to a separately identified runtime; compare live version/hash with source and perform E2E probes.

## Acceptance criteria for saying 'NYXA is self-evolving within governance'

- A bounded improvement proposal is generated from a real observation with provenance.
- The candidate is evaluated in an isolated simulation with measurable baseline, benefit, risk and uncertainty.
- An independent adversarial reviewer and a separate policy gate both produce persisted, attributable decisions.
- A denied candidate cannot be deployed even if the proposer or routing model requests it.
- An approved candidate is tested, promoted only through the authorized release path, and verified in the running production process.
- A regression triggers a proven rollback and the learning record survives restart.
- A second cycle consumes prior evidence and measurably improves a relevant metric without bypassing governance.
- All transitions are reproducible with audit traces, code version, timestamps and explicit responsible authority.

Current certification verdict: NOT YET PROVEN. This register is a baseline and anti-duplication control, not an activation claim.
