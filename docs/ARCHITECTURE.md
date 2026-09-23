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

## Newsroom acceptance contract

The Newsroom is a governed multi-model collaboration surface. Natural-language
requests may explicitly invite external participants, for example: "Besprich
das mal mit Claude" or "Besprich das mit Claude und Kimi".

Routing is modality-aware. Text may use Claude/Kimi; image and video work may
use policy-approved vision/video models such as Qwen or Gemini; code and
research may select appropriate policy-approved specialists. OpenRouter may be
used as model transport, but transport never grants authority.

Every external contribution must retain provider, exact model id, task/request
id, timestamp, modality, evidence/input references where available, output
reference, uncertainty, and material dissent. A participant name may only be
attributed after a real successful call to that provider/model. Failed or
unavailable models must never be simulated.

NYXA has two enforcement points using shared governance semantics:
1. Newsroom governance: provenance, epistemic sufficiency, dissent, evidence,
   participant and task scope.
2. Effect governance: authority, target, capability/effect class, E0/Gamma,
   and audit evidence before external effects.

A successful discussion does not authorize publication. The intended publish
path is Newsroom -> NYXA -> proposal envelope -> NYXA Effect Gate ->
authenticated Grav MCP -> least-privilege publisher -> Digitalleria. Direct
model-to-Grav publication is not an accepted Newsroom path.

Acceptance requires evidenced tests for text, multi-model discussion, image,
video, code, research, automatic routing with disclosed exact model ids,
anti-phantom behavior, governance, governed publication, and fail-closed
DENY/DEGRADE/ESCALATE/UNKNOWN outcomes.

Primary conversational acceptance phrase:
"Besprich das mal mit Claude und Kimi."

This test passes only when both external participants were actually called,
their identities and outputs are evidenced, NYXA evaluated the workflow,
material dissent survived synthesis, and the synthesis was returned.
