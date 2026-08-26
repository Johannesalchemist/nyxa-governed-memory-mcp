# Change Log: Secure Connector v0.1

## Change

- Extended the existing MCP with a typed, deny-by-default I0/I1 capability layer.
- Added strict path, configuration, process, output, redaction, rate-limit, and
  audit-integrity controls.
- Added reproducible security, adversarial, and MCP STDIO integration tests.

## Affected files

- `src/server.ts`, `src/connector/*`, `src/policy/*`, `src/audit/AuditLog.ts`
- `src/config/env.ts`, `src/schema/audit.ts`, `src/tools/system.status.ts`
- `config/connector.dev.example.json`, `tests/*`, `package.json`, `.env.example`
- `README.md`, `docs/THREAT_MODEL.md`, and secure-connector handoff documents

## Reason

The prior server exposed governance inspection tools but did not provide the
requested scoped server connector. Extending it reuses the existing governance and
audit mechanisms without creating a parallel MCP.

## Before

There was no typed allowlist for project roots, repositories, services, or tests;
no guarded development patch transaction; and no adversarial verification for the
connector threat set.

## After

Read access is technically scoped, secret and binary output is denied/redacted,
processes use fixed argument arrays, writes are limited and reversible, unknown
operations fail closed, and every call produces structured evidence and audit data.

## Risks and open work

Production activation, runtime-user creation, networking, remote authentication,
and all I2 operations are intentionally not implemented. See the threat model for
residual risks.

## Test

Verified with TypeScript build, security/adversarial tests, real MCP STDIO
integration, and the approved NYXA governance receipt, core smoke, and drift audit
targets. No dependency installation was performed.
