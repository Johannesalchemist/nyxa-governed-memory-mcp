# NYXA Industrial Twin Reference v0.1

Goal: capture-agnostic, multi-resolution, temporal, provenance-aware and effect-relative industrial twin.

## Seven milestones
1. Capture-agnostic ingestion: photo, video, phone LiDAR, professional LiDAR, NavVis, CAD/P&ID, sensors.
2. Stable spatial world model: observations refine assets instead of creating duplicate worlds.
3. Evidence/provenance: source, time, accuracy, confidence, coverage, transformations and hashes.
4. Production/business twin: BOM, ERP/MES, orders, cost, maintenance, capacity and margin.
5. Simulation/change detection: observations create change candidates, never silent overwrites.
6. NYXA effect-relative governance: evidence thresholds depend on the requested real-world effect.
7. Windtunnel demonstrator: ALLOW, real DENY, ESCALATE, bypass, replay, scope, fail-closed and effect verification.

## Core invariant
Reality is not overwritten. It is observed over time.

## First E2E experiment
Capture one room with 3-5 objects. Move one object. Capture again. Resolve stable asset identity, calculate displacement, create a change candidate, then request multiple effects against the same evidence. SHOW_LOCATION should be possible at lower evidence quality while ROBOT_MOVE must fail closed unless its stricter thresholds are met.

## Status
M1/M3 contract scaffolded. Effect policy scaffolded for M6. No production/runtime deployment. No claim of E2E enforcement until a technically possible forbidden effect is demonstrably prevented and evidenced.