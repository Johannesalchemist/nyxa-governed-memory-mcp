import { strict as assert } from "node:assert";
import { evaluateEffectiveCapability } from "../src/policy/effectiveCapability.js";

const humanEnvelope = {
  actor: "agent:test",
  action: "write external state",
  resource: "https://example.invalid/resource",
  purpose: "authorized test",
  authorityGrant: "human:test-grant",
  evidenceRefs: ["test:evidence"],
  expiresAt: "2099-01-01T00:00:00Z",
  humanApproved: true,
};

const cases = [
  {
    name: "safe read remains I0",
    actual: evaluateEffectiveCapability({
      declaredCapability: "web_read",
      observedEffects: ["READ_ONLY"],
      requestedLevel: "I0",
    }),
    expectedDecision: "ALLOW",
    expectedLevel: "I0",
  },
  {
    name: "DSEWiki GET side effect is treated as external write",
    actual: evaluateEffectiveCapability({
      declaredCapability: "web_read",
      observedEffects: ["EXTERNAL_STATE_WRITE"],
      requestedLevel: "I0",
    }),
    expectedDecision: "DENY",
    expectedLevel: "I2",
  },
  {
    name: "shared-state discovery cannot silently become a multi-agent channel",
    actual: evaluateEffectiveCapability({
      declaredCapability: "web_read",
      observedEffects: ["SHARED_STATE"],
      requestedLevel: "I0",
    }),
    expectedDecision: "DENY",
    expectedLevel: "I2",
  },
  {
    name: "discovered credential is quarantined",
    actual: evaluateEffectiveCapability({
      declaredCapability: "web_read",
      observedEffects: ["CREDENTIAL_DISCOVERY"],
      requestedLevel: "I0",
      discoveredCredential: true,
      credentialExplicitlyAuthorized: false,
    }),
    expectedDecision: "DENY",
    expectedLevel: "I2",
  },
  {
    name: "credential possession never self-authorizes use",
    actual: evaluateEffectiveCapability({
      declaredCapability: "api_call",
      observedEffects: ["CREDENTIAL_USE"],
      requestedLevel: "I1",
      credentialExplicitlyAuthorized: true,
    }),
    expectedDecision: "DENY",
    expectedLevel: "I3",
  },
  {
    name: "revoked capability class cannot be recreated under another tool name",
    actual: evaluateEffectiveCapability({
      declaredCapability: "url_shortener_read",
      observedEffects: ["EXTERNAL_STATE_WRITE"],
      requestedLevel: "I0",
      requestedEquivalenceClass: "EXTERNAL_STATE_WRITE",
      revokedEquivalenceClasses: ["EXTERNAL_STATE_WRITE"],
      commitEnvelope: humanEnvelope,
    }),
    expectedDecision: "DENY",
    expectedLevel: "I2",
  },
  {
    name: "I2 external commit with complete independent human authority can pass this layer",
    actual: evaluateEffectiveCapability({
      declaredCapability: "web_write",
      observedEffects: ["EXTERNAL_STATE_WRITE"],
      requestedLevel: "I2",
      commitEnvelope: humanEnvelope,
    }),
    expectedDecision: "ALLOW",
    expectedLevel: "I2",
  },
];

for (const testCase of cases) {
  assert.equal(testCase.actual.decision, testCase.expectedDecision, testCase.name);
  assert.equal(testCase.actual.effectiveLevel, testCase.expectedLevel, testCase.name);
  console.log(`PASS ${testCase.name}`);
}

console.log(`PASS ${cases.length}/${cases.length} RAP hardening vectors`);
