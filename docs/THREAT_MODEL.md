# Threat Model (Public MVP)

Primary risks:
- memory poisoning
- over-retention
- false authority
- prompt injection
- sensitive data leakage
- unauthorized consolidation
- interpretation creep

Mitigation direction:
- policy checks before outcomes
- explicit candidate/validation separation
- strict open-signal boundaries with TTL
- audit trails for governance-relevant events
- operator-governed retention and access controls
