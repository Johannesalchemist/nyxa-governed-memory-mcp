# NYXA Research Frontier, Ablation and Quality Perception V1

Status: approved research design, NOT proof of production integration. Date: 2026-10-11.

## Research platform operating model

Every capability is discoverable through a single inventory with canonical ID, owner, version, deployment, dependencies, test evidence, data policy, permitted side effects and rollback procedure. Supported activation states: OFF, SHADOW, SANDBOX, CANARY, ACTIVE, QUARANTINED. Transition requires explicit capability gate decision and evidence; activation of a module never implies a grant for its side effects. No automatic mass activation. Preserve the ability to compare two variants while holding all other variables constant.

## Controlled ablation protocol

For each research question: register baseline and objective metric, pin datasets and model/prompt/tool versions, random seeds where applicable, run a control and a single-variable ablation, retain raw artifacts, report effect size, confidence/uncertainty and negative results, require independent adversarial review, and allow rollback. Prevent contamination between training and evaluation sets. Record experiment and audit IDs; do not treat simulated success as live evidence.

## Quality perception / multimodal observability

A quality gate must combine deterministic checks and perceptual judgment. For web: computed WCAG contrast ratios (including interactive states and text-over-image), keyboard/focus, responsive viewport matrix, clipping, occlusion, font hierarchy, layout shifts, accessibility tree, screenshot comparison and human design review. Automated contrast checks must distinguish WCAG 2.x numerical thresholds from broader visual legibility and aesthetic judgment. For Unreal/avatar: scene-ground-truth transforms, collision traces, lip-sync timing, gaze target, pose/idle coherence, groom attachment, camera captures and human-rated reference alignment. Compare intended outcome with actual rendered artifacts; retain visual evidence. Human disagreement is a useful training signal, not a reason to silently override the reviewer.

## Frontier-aware study agent

The study agent has two coupled tracks: (1) foundational mastery with spaced retrieval, examinations and persistent evidence of competence; (2) current research frontier by domain. Discover doctoral dissertations, university repositories, professor/group research programs, peer-reviewed papers, preprints, replication studies and open datasets. Search by explicit research questions and neighboring disciplines; collect DOI/URL, authors, date, version, license, methods, assumptions, benchmark, limitations, competing findings and citation provenance. Prefer original sources. Distinguish peer-reviewed evidence, dissertation, preprint, project claim and unverified assertion. Freshness is domain-specific and search timestamps are recorded. Never invent citations or imply a preprint is established consensus.

## Frontier research cycle

Map established knowledge -> identify unresolved questions and disagreement -> formulate falsifiable hypothesis -> select evaluation and negative controls -> simulate/test in sandbox -> independent examiner (Claude where configured) -> governance decision -> bounded deployment only if authorized -> live probe -> learning ratchet -> update knowledge map and next question. A professor's current topics are signals for research direction, not endorsements or verified collaborations.

## Integration targets already present

- src/epistemic/studyAdapter.ts, researchAgent.ts, researchRouter.ts, researchBridge.ts, primarySourceResearch.ts, claudeExaminer.ts and openRouterResearchBridge.ts.
- src/organism/thesisEvolution.ts, evolutionLoop.ts, learningRatchet.ts and ratchetedEvolution.ts.
- src/biofunctional/ablationClaims.ts; scripts/study-cycle.mjs and scripts/study-cycle-runner.sh.
- deploy/nyxa-study-agent.service and deploy/nyxa-study-agent.timer.

These are inventory candidates. Do not rebuild them before inspecting implementation, wiring, tests and live runtime. Service/timer configuration is not proof of running state.

## Certification milestones

1. Inventory and canonical deduplication of existing modules, connectors, experiments and evaluation suites.
2. Read-only live probes of study agent and runtime activation registry; document what is actually running.
3. Persisted, provenance-linked frontier literature sample in at least two domains, with contradictions and uncertainty recorded.
4. Controlled ablation showing reproducible measurable quality difference, with blind human review for perceptual tasks.
5. Fail-closed denied activation, permitted sandbox activation, canary and rollback tests with audit trail.
6. Two successive learning cycles, with improvement verified against held-out baseline and no policy bypass.

No declaration of autonomous governance-conformant self-evolution before these milestones are evidenced in production.
