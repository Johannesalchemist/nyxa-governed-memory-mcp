# Threat Model (Public MVP)

## Primary Risks

- memory poisoning: malicious or low-quality input contaminates candidate memory
- over-retention: data kept beyond intended retention window
- false authority: outputs mistaken as confirmed truth without validation
- prompt injection: attempts to bypass policy boundaries
- sensitive data leakage: exposure through logs, exports, or misconfiguration
- unauthorized consolidation: candidate promoted without approval
- interpretation creep: assistant behavior drifts toward unsupported inference

## Mitigation Direction

- policy checks before tool execution
- explicit candidate/validation separation
- strict `open_signal` handling with TTL
- audit trail for every tool call
- operator-configurable retention/access governance
- documentation of non-goals and forbidden domains
