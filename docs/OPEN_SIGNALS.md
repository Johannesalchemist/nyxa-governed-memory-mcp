# Open Signals

An `open_signal` represents held uncertainty, not accepted fact.

Rules:
- `open_signal` is not `memory_node`.
- TTL is required for open signals.
- Open signals are not retrieved as factual memory.
- No interpretation while status is closed/unvalidated.
- Promotion requires explicit validation.

Purpose:
- keep uncertain, high-risk, or unresolved items visible
- prevent premature consolidation into confirmed memory
- preserve auditability of unresolved state
