import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCoCogitation,
  assessHumanAiDrift,
  classifyEmergentEvent,
  primaryEvidenceForReset
} from "../dist/cognitive/coCogitation.js";

function claim(
  statement,
  source,
  tag = "EXTERNAL_EVIDENCE"
) {
  return {
    statement,
    source,
    tag
  };
}

function contribution({
  id,
  role,
  origin = "AI",
  source,
  modelId,
  promptHash,
  parentIds = [],
  tag = "EXTERNAL_EVIDENCE"
}) {
  return {
    id,
    role,
    origin,
    claims: [
      claim(`${id}-statement`, source, tag)
    ],
    modelId,
    promptHash,
    parentIds
  };
}

test("GLITCH is diagnostic only and never learning or authority", () => {
  const event = classifyEmergentEvent("GLITCH");

  assert.equal(event.kind, "GLITCH");
  assert.equal(event.diagnosticAction, "DIAGNOSE");
  assert.equal(event.learningStatus, "NOT_ELIGIBLE");
  assert.equal(event.authorityEffect, "NONE");
  assert.equal(event.novelDimensionCandidate, false);
});

test("CO_DRIFT requires countercheck and never creates authority", () => {
  const event = classifyEmergentEvent("CO_DRIFT");

  assert.equal(event.kind, "CO_DRIFT");
  assert.equal(event.diagnosticAction, "COUNTERCHECK");
  assert.equal(event.learningStatus, "NOT_ELIGIBLE");
  assert.equal(event.authorityEffect, "NONE");
  assert.equal(event.novelDimensionCandidate, false);
});

test("KLITSCH opens exploration but remains hypothesis-only", () => {
  const event = classifyEmergentEvent("KLITSCH");

  assert.equal(event.kind, "KLITSCH");
  assert.equal(event.diagnosticAction, "EXPLORE");
  assert.equal(event.learningStatus, "HYPOTHESIS_ONLY");
  assert.equal(event.authorityEffect, "NONE");
  assert.equal(event.novelDimensionCandidate, true);
});

test("human-AI agreement without independent evidence produces co-drift", () => {
  const drift = assessHumanAiDrift({
    agreementDelta: 0.9,
    independentEvidenceDelta: 0.1
  });

  assert.equal(drift, 0.8);
});

test("independent evidence prevents agreement alone from becoming drift", () => {
  const drift = assessHumanAiDrift({
    agreementDelta: 0.8,
    independentEvidenceDelta: 0.8
  });

  assert.equal(drift, 0);
});

test("three genuinely distinct roles and derivations can be learning-eligible", () => {
  const cs = [
    contribution({
      id: "explore",
      role: "EXPLORE",
      origin: "HUMAN",
      source: "primary-observation-a",
      modelId: "human",
      promptHash: "human-context-a"
    }),
    contribution({
      id: "challenge",
      role: "CHALLENGE",
      source: "independent-source-b",
      modelId: "model-b",
      promptHash: "prompt-b"
    }),
    contribution({
      id: "alternative",
      role: "INDEPENDENT_ALTERNATIVE",
      source: "independent-source-c",
      modelId: "model-c",
      promptHash: "prompt-c"
    })
  ];

  const result = assessCoCogitation(cs, {
    agreementDelta: 0.3,
    independentEvidenceDelta: 0.7
  });

  assert.equal(result.epistemicResetRequired, false);
  assert.equal(result.learningEligible, true);
  assert.equal(result.humanAiDriftScore, 0);
});

test("same lineage under three roles cannot manufacture independence", () => {
  const shared = {
    modelId: "same-model",
    promptHash: "same-prompt",
    parentIds: ["same-parent"]
  };

  const cs = [
    contribution({
      id: "e",
      role: "EXPLORE",
      source: "a",
      ...shared
    }),
    contribution({
      id: "c",
      role: "CHALLENGE",
      source: "b",
      ...shared
    }),
    contribution({
      id: "i",
      role: "INDEPENDENT_ALTERNATIVE",
      source: "c",
      ...shared
    })
  ];

  const result = assessCoCogitation(cs);

  assert.equal(result.independentLineages, 1);
  assert.equal(result.epistemicResetRequired, true);
  assert.equal(result.learningEligible, false);
  assert.ok(
    result.reasons.includes("lineage_independence_insufficient")
  );
});

test("high source overlap is visible and cannot silently become learning", () => {
  const cs = [
    contribution({
      id: "e",
      role: "EXPLORE",
      source: "same-source",
      modelId: "m1",
      promptHash: "p1"
    }),
    contribution({
      id: "c",
      role: "CHALLENGE",
      source: "same-source",
      modelId: "m2",
      promptHash: "p2"
    }),
    contribution({
      id: "i",
      role: "INDEPENDENT_ALTERNATIVE",
      source: "same-source",
      modelId: "m3",
      promptHash: "p3"
    })
  ];

  const result = assessCoCogitation(cs);

  assert.equal(result.sharedSourceRatio, 1);
  assert.equal(result.learningEligible, false);
  assert.ok(result.reasons.includes("source_overlap_high"));
});

test("human-AI self-reinforcement can force epistemic reset", () => {
  const cs = [
    contribution({
      id: "e",
      role: "EXPLORE",
      origin: "HUMAN",
      source: "a",
      modelId: "human",
      promptHash: "h"
    }),
    contribution({
      id: "c",
      role: "CHALLENGE",
      source: "b",
      modelId: "m2",
      promptHash: "p2"
    }),
    contribution({
      id: "i",
      role: "INDEPENDENT_ALTERNATIVE",
      source: "c",
      modelId: "m3",
      promptHash: "p3"
    })
  ];

  const result = assessCoCogitation(cs, {
    agreementDelta: 1,
    independentEvidenceDelta: 0
  });

  assert.equal(result.humanAiDriftScore, 1);
  assert.equal(result.epistemicResetRequired, true);
  assert.equal(result.learningEligible, false);
  assert.ok(result.reasons.includes("human_ai_co_drift_high"));
});

test("epistemic reset drops derived conclusions", () => {
  const cs = [{
    id: "mixed",
    role: "EXPLORE",
    origin: "HUMAN",
    modelId: "human",
    promptHash: "context",
    parentIds: [],
    claims: [
      claim("observed A", "sensor-a", "EXTERNAL_EVIDENCE"),
      claim("recorded B", "record-b", "FACT"),
      claim("maybe C", "reasoner", "HYPOTHESIS"),
      claim("model says D", "model", "MODEL_OUTPUT"),
      claim("simulated E", "simulation", "SIMULATION"),
      claim("inferred F", "reasoner", "INFERENCE")
    ]
  }];

  const reset = primaryEvidenceForReset(cs);

  assert.deepEqual(
    reset.map(x => x.tag),
    ["EXTERNAL_EVIDENCE", "FACT"]
  );

  assert.equal(
    reset.some(x =>
      ["HYPOTHESIS", "MODEL_OUTPUT", "SIMULATION", "INFERENCE"]
        .includes(x.tag)
    ),
    false
  );
});

test("empty co-cogitation fails closed for learning", () => {
  const result = assessCoCogitation([]);

  assert.equal(result.epistemicResetRequired, true);
  assert.equal(result.learningEligible, false);
  assert.ok(result.reasons.includes("no_contributions"));
});
