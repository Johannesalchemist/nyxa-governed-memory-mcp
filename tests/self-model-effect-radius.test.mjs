import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SERVER = new URL("../src/server.ts", import.meta.url);

test("self-model belief effect contract is narrow and server-owned", async () => {
  const source = await readFile(SERVER, "utf8");

  assert.match(
    source,
    /case "nyxa_self_model_write_belief":/,
    "belief write must be explicitly selected"
  );

  assert.match(
    source,
    /proposal\.target === "self-model:\/belief"/,
    "belief effect contract must require canonical target"
  );

  assert.match(
    source,
    /BeliefRecordSchema\.safeParse/,
    "effect radius must depend on server-side belief schema validation"
  );

  assert.match(
    source,
    /selfModelWriteRadius = 1/,
    "exactly one validated belief record may resolve to radius 1"
  );

  assert.ok(source.includes("const trustedEffectRadius =") && source.includes("selfModelWriteRadius"), "trusted radius must come from server-owned resolvers");

});


test("three additional self-model effect contracts are narrow and schema-gated", async () => {
  const source = await readFile(SERVER, "utf8");

  const contracts = [
    {
      action: "nyxa_self_model_write_capability_limitation",
      target: "self-model:/capability_limitation",
      schema: "CapabilityLimitationRecordSchema"
    },
    {
      action: "nyxa_self_model_write_goal",
      target: "self-model:/goal",
      schema: "GoalRecordSchema"
    },
    {
      action: "nyxa_self_model_write_autobiographical_event",
      target: "self-model:/autobiographical_event",
      schema: "AutobiographicalEventSchema"
    }
  ];

  for (const contract of contracts) {
    assert.ok(
      source.includes(`case "${contract.action}"`),
      `${contract.action} must have an explicit server-owned contract`
    );

    assert.ok(
      source.includes(`proposal.target === "${contract.target}"`),
      `${contract.action} must require canonical target ${contract.target}`
    );

    assert.ok(
      source.includes(contract.schema),
      `${contract.action} must use ${contract.schema}`
    );
  }

  assert.ok(source.includes("const trustedEffectRadius =") && source.includes("selfModelWriteRadius"), "effect radius must remain server-owned");
});

test("remaining I1 self-model effect contracts are explicit, narrow and schema-gated", async () => {
  const source = await readFile(SERVER, "utf8");

  const contracts = [
    {
      action: "nyxa_self_model_write_personality",
      target: "self-model:/personality",
      schema: "PersonalityRecordSchema"
    },
    {
      action: "nyxa_self_model_write_self_model",
      target: "self-model:/self_model",
      schema: "SelfModelRecordSchema"
    },
    {
      action: "nyxa_self_model_write_current_state",
      target: "self-model:/current_state",
      schema: "CurrentStateSnapshotSchema"
    }
  ];

  for (const contract of contracts) {
    assert.ok(
      source.includes(`case "${contract.action}"`),
      `${contract.action} must have an explicit server-owned contract`
    );

    assert.ok(
      source.includes(`proposal.target === "${contract.target}"`),
      `${contract.action} must require canonical target ${contract.target}`
    );

    assert.ok(
      source.includes(contract.schema),
      `${contract.action} must use ${contract.schema}`
    );
  }

  const radiusSection = source.slice(
    source.indexOf('// Effect radius counts'),
    source.indexOf('const trustedEffectRadius')
  );

  assert.doesNotMatch(
    radiusSection,
    /case "nyxa_self_model_write_identity":/,
    "I2 identity must remain outside the bounded I1 effect-radius contracts"
  );
});
