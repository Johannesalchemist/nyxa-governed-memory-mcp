# Nyxa Governed Memory MCP

Nyxa Governed Memory MCP is an MCP-compatible AI Governance Apprentice for governed memory workflows. Governed memory means memory that is classified, sensitivity-aware, auditable, consent-aware, and not automatically treated as confirmed truth.

This project uses MCP as a connector layer, not as the product itself. The product framing is governance-first: observe, classify, document, and keep humans in control of validation and decisions.

## What This Is

Nyxa AI Governance Apprentice helps teams structure AI-adjacent memory and audit workflows with explicit policy checks and audit traces.

It is designed for:
- governed memory classification
- open-signal handling
- risk documentation
- audit trail generation
- human-supervised AI workflows

## What This Is Not

Public MVP boundaries:
- no autonomous interpretation
- no autonomous action execution
- no confirmed memory without validation
- no biometric processing
- no dream interpretation
- no clinical, psychological, or legal advice
- no hidden side effects

## Core Invariants

- `open_signal` is not `memory_node`.
- Unvalidated memory candidates are not confirmed truth.
- Human operators remain responsible for decisions, validation, and deployment controls.
- Legal evidence package preparation means organization/documentation support, not legal advice.

## Current Active Tools (v0.1)

The currently active tool surface is intentionally minimal:
- `system.status`
- `policy.mode`
- `audit.trace`

## Planned Public MVP Tool Surface (Roadmap, Not Yet Active)

The following governance-oriented tools are planned for public MVP expansion and are not active in v0.1:
- `classify_event`
- `classify_sensitivity`
- `create_audit_note`
- `export_governance_report`
- `prepare_legal_evidence_package`
- `hold_open_signal`

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Run (dev)

```bash
npm run dev
```

## Run (dist)

```bash
npm run build
npm run start
```

## MCP Connector Example

```json
{
  "mcpServers": {
    "nyxa-governed-memory": {
      "command": "node",
      "args": ["/absolute/path/to/nyxa-governed-memory-mcp/dist/index.js"],
      "env": {
        "NYXA_AGENT_MODE": "observe_only",
        "NYXA_MEMORY_BACKEND": "local",
        "NYXA_DATA_DIR": "/absolute/path/to/nyxa-governed-memory-mcp/data"
      }
    }
  }
}
```

## Safe-By-Default Boundaries

- default mode: `observe_only`
- policy enforcement before every tool call
- audit event written for every tool call
- execution tools disabled
- authoritative writes disabled

## Submission Readiness

This repository is structured for governance-first MCP/connector submission with:
- explicit security and privacy statements
- documented governance invariants
- threat model and limitations
- EU/GDPR alignment notes (design alignment, not certification)
- controlled, minimal tool exposure in current release
