# Audit Event Schema

## Purpose

AuditEvent is the semantic contract shared across stdio MCP, future HTTP ingestion, hooks/wrappers, and proxy adapters.

All transport layers must converge on the same governance event meaning, even if they differ in transport mechanics.

## Required Fields

- id
- source
- actor
- action
- payload_hash
- ts_monotonic
- ts_wall
- schema_version

## Recommended Fields

- context_id
- session_id
- correlation_id
- sensitivity_class
- event_type
- integrity_hash
- metadata

## Deterministic IDs

Event IDs should be deterministic where possible (for example from stable event components) to support deduplication and replay-safe ingestion.

Deterministic ID strategy must avoid accidental collisions and should remain stable across adapters producing the same logical event.

## Payload Hashing by Default

payload_hash is preferred over storing sensitive raw payloads by default.

This supports traceability and integrity checks while reducing unnecessary exposure of sensitive content in audit storage.

Raw payload retention, if enabled by an operator, should be explicit, policy-controlled, and purpose-limited.

## Time Semantics

- ts_monotonic: ordering and sequence reliability within runtime/ingestion context
- ts_wall: human-readable wall-clock time for cross-system interpretation

Both are needed: monotonic time for consistent ordering, wall time for operational forensics and external reporting.

## Integrity and Replay Considerations

integrity_hash can protect event-chain integrity (for example through chaining/anchoring strategies).

Replay risk must be addressed through deterministic IDs, sequence validation, and ingestion controls that reject duplicate or stale events beyond policy limits.

## Trust Boundary Requirement

Unauthenticated event ingestion would invalidate audit trust.

If any source can inject arbitrary events, audit timelines lose evidentiary reliability.

## Future Authentication Posture

- Stage B: loopback + shared secret token
- Stage C: OAuth/mTLS or equivalent operator-controlled trust boundary

The transport may change over time, but authenticated provenance and integrity must remain mandatory for trusted governance timelines.
