# Nyxa Governed Memory MCP

Nyxa Governed Memory MCP is an MCP-compatible AI Governance Apprentice for governed memory workflows. Governed memory means memory that is classified, sensitivity-aware, auditable, consent-aware, and not automatically treated as confirmed truth.

MCP is the connector layer for tool interoperability, not the full governance product by itself. The product framing is governance-first: observe, classify, document, and keep humans in control.

## What This Repository Provides

- a governed-memory core for classification and policy-aware handling
- audit trails for tool calls and governance-relevant transitions
- open-signal handling boundaries for unresolved or uncertain events
- documentation-first controls for human-supervised AI workflows

## Active Tool Surface (Current)

Only these tools are active:
- system.status
- policy.mode
- udit.trace

## Planned Tool Surface (Not Active Yet)

The following tools are planned and not active in the current release:
- classify_event
- classify_sensitivity
- hold_open_signal
- create_audit_record
- xport_governance_report
- xport_audit_timeline

Planned hold_open_signal behavior (not active yet):
- holds uncertainty as an open signal
- TTL required
- no interpretation while closed
- no confirmed memory creation
- no autonomous action

## Observability Boundary

Full action-chain observability requires routing events through Nyxa and only applies to clients that emit or route those events through Nyxa-controlled hooks, wrappers, proxies, or MCP transports.

## Governance Invariants

- open_signal is not memory_node
- no autonomous interpretation
- no confirmed memory without validation
- no autonomous action execution
- no biometric processing in public MVP
- no dream interpretation in public MVP
- no clinical, psychological, or legal advice
- human operators remain responsible for decisions and validation

## Safe-by-Default Boundaries

- default mode is observe-first (observe_only)
- policy checks run before tool outcomes are returned
- audit events are written for tool calls
- execution tools and authoritative writes are not enabled by default

## Build and Run

`ash
npm install
npm run build
npm run dev
`

Dist entry:

`ash
npm run build
npm run start
`

## Submission Readiness Notes

- public framing: Nyxa AI Governance Apprentice
- MCP stdio supported
- connector and observability boundaries documented
- threat model and limitations documented
- security/privacy documentation included
