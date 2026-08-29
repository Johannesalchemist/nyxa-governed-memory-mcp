# Replay/idempotency design note (analysis only — not implemented)

No immediate security violation from replay was found during F1/F2 repair or the prior live
testing: γ has no proposal-identity/nonce tracking, so an identical proposal submitted twice is
evaluated twice (two ALLOW decisions, two audit/change-history entries) — but this never produced
a second unauthorized state transition in anything tested, because every currently-writable
domain happens to be either a read, an append with server-controlled sequencing, or an upsert
keyed by caller-supplied `id`.

## Classification by action type

| action(s) | category | replay semantics |
|---|---|---|
| `nyxa_list`, `nyxa_read_file`, `nyxa_search`, `nyxa_git_status`, `nyxa_git_diff`, `nyxa_logs`, `nyxa_self_model_read` | READ / QUERY-LIST | **replay harmless** — no state touched, replay is a non-event by construction |
| `nyxa_run_test` | EXTERNAL SIDE EFFECT (bounded) | **replay idempotent-in-effect, not idempotent-in-cost** — running a fixed test target twice produces the same kind of result but spends real CPU/time twice; this is exactly what the shared rate limiter (F1 repair) now bounds, so cost is capped rather than needing a distinct replay control |
| `nyxa_apply_patch` | IRREVERSIBLE-SHAPED EXTERNAL SIDE EFFECT | **replay must be rejected, but by content not by a nonce** — the same patch applied twice against the same pre-image will fail its own second application (the file no longer matches the patch's expected context, or the post-patch verification step will reject a no-op/already-applied diff) — semantic idempotency from the diff format itself, not something a replay-detection layer needs to add |
| `nyxa_self_model_write_{personality,self_model,current_state,belief,capability_limitation,goal}` | UPSERT (keyed by `id`, or singleton for `self_model`/`current_state`/`personality`) | **replay idempotent** — confirmed live: submitting the identical `goal` proposal twice left exactly one record, not two. Two governance decisions and two change-history entries are still produced (see below), but domain state does not duplicate |
| `nyxa_self_model_write_identity` | UPSERT, but currently unreachable (I2, unconditionally denied by C3) | **moot today** — replay of a write that can never succeed has no state to duplicate; revisit if I2 is ever made reachable |
| `nyxa_self_model_write_autobiographical_event` | APPEND | **replay requires freshness/sequencing, and already gets it — for free, from a different mechanism**: the store, not the caller, assigns `seq`/`previousEventHash` (confirmed: caller-supplied values in those fields are rejected by the schema before reaching the store). Replaying an identical *content* payload twice does not replay the *same event* — it appends two distinct, correctly-chained events with different `seq`/`occurredAt`/`eventHash`. This is not accidental idempotency; it's the intended behavior of an append log (two identical-looking things can legitimately both have happened) |

## Where does the gap actually sit?

The one real gap is narrower than "replay is unhandled": **γ produces a fresh, independently-audited decision for every submission, even when the proposal content is byte-identical to one already evaluated.** That means replay currently costs *governance-layer noise* (duplicate audit/change-history entries, doubled rate-limit consumption per F1's now-shared pool) even where it costs nothing at the *domain-state* layer. Whether that's a problem depends on the threat model: it does not currently let anything through it wasn't already going to let through (a replayed ALLOW-decision proposal was already going to be ALLOWed on its own merits both times), and it does not currently let anything skip an already-enforced DENY (a replayed DENY-decision proposal is independently re-evaluated and re-denied, not remembered-and-skipped).

## Recommendation

**Do not add a global blind deduplication mechanism.** It would need to solve cache-invalidation-shaped problems (how long is a "duplicate" window? does legitimate, intentional repetition — e.g. two genuinely separate `nyxa_run_test` runs a minute apart — get wrongly suppressed?) for a threat that isn't currently demonstrated as exploitable.

**Prefer the semantic idempotency each layer already has, made deliberate rather than incidental:**
- **Execution/tool-adapter layer** is the right home for `nyxa_apply_patch`'s replay protection — it should stay content-based (patch-against-stale-content fails), not become a proposal-id nonce; a nonce would actually be *worse* here since it would block a legitimate second attempt to apply the same textual change to a file that reverted.
- **Execution/tool-adapter layer** (specifically `SelfModelStore`) is also the right home for the UPSERT domains' idempotency — it already provides it via `id`-keying; this should be documented as an intentional property of those domains, not left as an accidental side effect of how the store happens to be implemented.
- **γ is not the right place to add replay detection.** γ is defined as pure and stateless (same proposal + context → same decision, always) — adding replay memory would require γ to hold state across calls, breaking that invariant for a benefit (governance-layer noise reduction) that doesn't correspond to a real authority gap today.
- If governance-layer noise (duplicate audit entries for identical resubmissions) becomes an actual operational problem, the right layer is the **proposal envelope/dispatch boundary in `server.ts`** (e.g. an optional, caller-supplied idempotency key on the envelope, deduplicated at the dispatch layer immediately before calling γ) — not γ itself, and not a mandatory global mechanism, since most current actions don't need it.
