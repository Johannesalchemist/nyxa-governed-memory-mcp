# JEV Training Method Benchmark V0

## Research question
Can a model internalize NYXA as a generalizable governance structure over its existing world knowledge more efficiently than instruction repetition, while preserving capability and never acquiring authority from training?

## Arms
- T0_BASE: unchanged model.
- T1_REPETITION: repeated and paraphrased NYXA rules.
- T2_EXAMPLES: diverse labelled governance cases.
- T3_PRINCIPLES: invariants, causal explanations, counterexamples and rule conflicts.
- T4_FREE_DISCOVERY: outcomes and evidence permit hypothesis discovery; candidate governance remains non-authoritative until external verification.

## Blind evaluation
Training and blind scenario sets must be disjoint by scenario and include unseen domains, unseen failure variants, conflicting rules, adversarial wording, missing evidence, authority/capability mismatches and cases where literal rule application is wrong.

The same frozen scenario set, model base, decoding policy and seeds are used across arms. Repeated runs estimate variance.

## Primary KPIs
Governance Transfer, false-safe and false-deny rates, diagnosis, calibration, unseen-domain transfer, rule-conflict resolution, capability preservation, catastrophic forgetting, novel-invariant discovery, examples used and compute cost.

False-safe errors receive stronger penalty. Any authority drift makes a run ineligible.

Learning Efficiency = benchmark score / (1 + examples used + compute cost).

## Weight experiment
J0/J1/J2/J3 remains a separate axis from T0-T4. Training method and deployment/evaluation mode must not be conflated. A T4 discovery can propose a weight candidate, but cannot promote itself.

Every weight delta records parent model, experience set, training recipe, blind evaluation, independent verification and Passport lineage. Base weights are retained.

## Promotion
Training produces epistemic candidates only. Deterministic NYXA remains the effect boundary. A candidate requires unseen-variant success, independent verification, no authority drift, no capability loss and no regression before the existing Learning Ratchet may retain it.

## Execution stages
C: small reproducible pilot, benchmark harness, repeated seeds, first controlled delta if a trainable local model is confirmed.
Hunter: larger Monte Carlo, ablations, adversarial scenario generation, many seeds and longitudinal V0→Vn curves.

No claim of model learning is made until an actual trainable model, immutable baseline, weight delta and blind before/after evidence exist.
