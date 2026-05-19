# Architecture

## Positioning

Nyxa Governed Memory MCP is the governed-memory core layer.

Nyxa AI Governance Apprentice is the product framing around this core: a governance-first system for classification, controlled memory flow, and audit trails in human-supervised AI workflows.

## Core vs Connector

MCP stdio is a connector layer. It is not a complete observability layer by itself.

The MCP server exposes governed tools and emits audit events for tool calls that reach this server. This is necessary, but not sufficient, for full action-chain visibility across heterogeneous clients and execution surfaces.

## Layered Model

1. Governed-memory core:
- shared policies
- shared event schema
- shared audit semantics
- shared sensitivity handling

2. Connector adapters:
- stdio MCP adapter (current)
- additional adapters over time

3. Observability expansion layers (future, separate from core):
- HTTP audit sink
- gateway/proxy routing

## Future HTTP and Gateway Layers

A future HTTP audit sink can receive external events from wrappers, hooks, and proxies.

A future gateway/proxy layer can provide broader end-to-end visibility for flows routed through Nyxa infrastructure.

These layers are separate from the core and can evolve independently, but they must use the same semantic audit contract.

## Core Reuse Constraint

The governed-memory core must be shared by all adapters.

No adapter may fork semantics for:
- policy enforcement intent
- sensitivity classification intent
- audit event contract
- validation boundaries between uncertain signals and confirmed memory
