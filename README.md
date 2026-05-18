# nyxa-governed-memory-mcp

## What this is
`nyxa-governed-memory-mcp` is a documentation-first MCP server foundation for Claude Code.
It is designed as a governed memory and audit base, with strict policy enforcement and explicit safety boundaries.

## What this is not
This v0.1 server is **not** an execution layer and **not** an automation-first agent tool.
It does **not** expose shell execution, unrestricted file write, screenshots, email, or external mutation tools.

## v0.1 scope
Only these tools are exposed:
- `system.status`
- `policy.mode`
- `audit.trace`

Core guarantees:
- default mode is `observe_only`
- startup always ensures the data directory exists
- every tool call is policy-checked first
- every tool call is audited to JSONL
- backend abstraction exists from day one (`local`, `remote`, `dedicated_node`, `customer_owned`)
- only `local` backend is active in v0.1

## Security boundaries
- no shell execution tools
- no email tools
- no screenshot tools
- no arbitrary filesystem tools
- no hidden side effects
- no authoritative memory writes in v0.1

## Install
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

## Claude Code MCP config example
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

## Feature flags
From `.env` / environment:
- `NYXA_DREAMING_ENABLED`
- `NYXA_APPRENTICE_ENABLED`
- `NYXA_VISUAL_OBSERVATION_ENABLED`
- `NYXA_DRAFTS_ENABLED`
- `NYXA_AUTHORITATIVE_WRITES_ENABLED`
- `NYXA_EXECUTION_TOOLS_ENABLED`

v0.1 enforces execution and authoritative writes as disabled.

## Future roadmap (not in v0.1)
- governed memory candidate flow
- dreaming candidates
- apprentice observation mode extensions
- visual observation hooks
- dedicated EU memory node support
- customer-owned memory backend support
