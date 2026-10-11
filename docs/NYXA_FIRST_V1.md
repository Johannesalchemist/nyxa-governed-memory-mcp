# NYXA_FIRST_V1: Tool Routing Contract

Status: development policy, not a global ChatGPT tool-selection enforcement mechanism.
Date: 2026-10-11

1. For NYXA work, discover and use NYXA MCP / Toolbox first.
2. If NYXA lacks a capability or has a technical outage, SentinelX is the approved second route, subject to its own host allowlists and user authorization.
3. Never invoke Remote Desktop Commander automatically, for discovery, retries, or fallback. Require fresh, explicit approval for the particular RDC operation.
4. RDC quota exhaustion is a hard stop. Do not treat it as transient or retry after a delay.
5. A governance DENY, security rejection, or missing mandate is not a technical outage. Do not switch connectors to circumvent such a decision.
6. Record missing capabilities as gaps for a narrowly scoped NYXA adapter. Preserve gamma, mandate checks, audit and effect budgets.
7. Do not claim this document can restrict ChatGPT's external tool picker. To enforce that, configure a higher-level tool broker/host allowlist and test rejection of an unauthorized RDC call.

Acceptance criteria for enforcement: unauthorized RDC route denied; NYXA success selected first; NYXA technical-unavailable route may select SentinelX; governance denial cannot fall through; every fallback is audited.
