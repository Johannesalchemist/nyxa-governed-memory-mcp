# NYXA Forward Cut V1: integration baseline and commit discipline

Status: **integration candidate, not a production release**. Date: 2026-11-24.

## Verified starting point

- Public GitHub repository: `Johannesalchemist/nyxa-governed-memory-mcp`.
- This branch starts from remote `main` at `d16f42761291f4773a11f9e431cec50a3ab5715c`. This is a **reference and coordination branch**, not the current running MCP source.
- Server B's observed runtime branch `e2e-enforcement-canary`: `0d7870846b9135ddaa016daf7271d73d90a03ee5`, with additional **uncommitted** changes.
- Server B's observed development branch `jev-weight-evolution-v0`: `df2b0fbbcf1abcda89aa6a316d48125901433f12`, with additional **uncommitted** changes.
- Three locally protected Git recovery bundles and isolated restore tests passed (original, development, runtime). Those bundles and their contents are **not** included here.
- These branches share `20c2426cfd7e8514e476ce5e9ca7244bd03ffb89` as an observed common ancestor.
- The existing public PRs #1 (RAP), #2 (CandidateStore), and #3 (AuditLog) remain **open drafts**. PR #2 targets the development branch and PR #3 targets PR #2's branch, so their dependency order matters.

## Forward-cut selection

| Lane | Retain / integrate | Do not imply |
| --- | --- | --- |
| Core | Running governance semantics, authority/mandate/lease enforcement, E0, gamma, replay and audit integrity, real tested executor, scoped MCP | A portable-CI PASS is not host-level enforcement evidence |
| Product integration | Memory, Self-Model V2, Studio/App Factory navigation registry, Sophia, RIC, governed RunPod adapter | Commit history alone proves deployed functionality |
| Labs | Experimental organisms, cognitive, scientific and hardware branches; isolated execution and evidence | Experimental capability is live |
| Archive | Legacy prototypes, reproducible experiment results, obsolete duplicates, reviewed history | Delete historical Git history or private datasets |

**Runtime is the operative reference, not an unconditional merge winner.** Compare code and observed effects with current development before promoting individual changes. The operator's existing W0 C1–C6 mapping in `/home/jo/nyxa-contracts/MAPPING.md` is authoritative for reuse decisions until a verified updated mapping supersedes it. In particular, C3 reuses the current authority bridge and C4 reuses the existing Studio navigation/tool registries. Do not create parallel mandate, lease, or registry systems.

## Work protocol: Inspect → Target → Reuse → Plan → Implement → Verify → Adversarial Verify → Commit → Observe

1. Resolve live host identity, access route, user, target directory, and executing service before any write.
2. Check other agents and the current working tree. Never write into another agent's dirty worktree; use a separate owned worktree.
3. Use task-scoped, small commits after each verified functional increment and before handoff. Record base SHA, changed paths, scope, commands, test output/evidence IDs, security impact, and rollback steps.
4. Stage exact reviewed paths only. No `git add .`, `git clean`, `git reset --hard`, force push, blanket ignore rule, or automatic merge.
5. Reject secrets, access credentials, personal data, live audit ledgers, memory datasets, private experiments, runtime snapshots, and generated junk from the public Git repository. Review `git diff --cached` and binary/large-file lists before every commit.
6. Run reproducible build, isolated unit/integration tests and adversarial cases for ALLOW, effective DENY, ESCALATE, replay, bypass, scope, crash/restart, fail-closed and evidence. Distinguish local test outcomes from actual host enforcement.
7. Do not infer production readiness from green CI. Dedicated Linux host sandbox and authenticated MCP tests are separate release gates, as the existing `.github/workflows/nyxa-host-security-gate.yml` documents.
8. Commits and draft PRs are development artifacts, **not release approval**. Productive restart/cutover, external publication, credentials, runtime mutation and expanded authority require their own verified authorization. All production changes need a captured rollback artifact.

## Suggested integration slices

1. **FC-01** Reconcile runtime/dev changes including uncommitted state in isolated worktrees; inventory source of truth, ownership and missing prerequisites.
2. **FC-02** Preserve and adversarially test authority, effect policy, audit chain, writer locks and replay protection.
3. **FC-03** Incorporate CandidateStore and memory fixes from PRs #2/#3 with dependency/test provenance; reconcile Codex memory consolidation and Self-Model V2 without overwriting concurrent work.
4. **FC-04** Wire C1–C6 contracts to Studio, Sophia, RIC and RunPod with honest live/mock/planned registry status and gated deep links.
5. **FC-05** Integrate opt-in training and cost/accounting boundaries; retain existing GPU budget guard.
6. **FC-06** Create a reproducible candidate, execute real host-level DENY and full E2E tests, then propose a controlled cutover with rollback.

## Release criteria

- Exact source SHA and build artifact SHA, lockfile and configuration/policy hashes, tested environment and runtime identity.
- No imported private or unreviewed files; no unresolved secret findings.
- Verified integration wiring, effective governance and audit evidence.
- Real denial of a technically possible action; not a mock or schema-only claim.
- Rollback rehearsed under a known target identity.
- Owner's separate approval for production cutover.

**Current outcome:** This document is a durable coordination checkpoint only. It does not claim successful implementation of FC-01 through FC-06.
