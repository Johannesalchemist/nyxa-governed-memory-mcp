# Nyxa Governed Memory MCP

Nyxa Governed Memory MCP is an MCP-compatible AI Governance Apprentice for governed memory workflows. Governed memory means memory that is classified, sensitivity-aware, auditable, consent-aware, and not automatically treated as confirmed truth.

MCP is the connector layer for tool interoperability, not the full governance product by itself. The product framing is governance-first: observe, classify, document, and keep humans in control.

## What This Repository Provides

- a governed-memory core for classification and policy-aware handling
- audit trails for tool calls and governance-relevant transitions
- open-signal handling boundaries for unresolved or uncertain events
- documentation-first controls for human-supervised AI workflows

## Active Tool Surface (Current)

- system.status
- policy.mode
- udit.trace

## Public Submission Scope (Architecture and Documentation)

This public submission focuses on safe-by-default governance boundaries and traceability, including:
- memory classification and sensitivity awareness
- audit timelines and event integrity posture
- explicit separation of uncertain signals from confirmed memory
- transport and observability boundaries

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
