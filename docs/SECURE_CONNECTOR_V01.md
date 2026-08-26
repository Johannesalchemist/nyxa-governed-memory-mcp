# Secure Connector v0.1

## Decision

The existing governed-memory MCP is extended in place. This preserves its policy,
audit, schema, and STDIO mechanisms and avoids a second authority surface.

The server uses the MCP SDK's low-level `Server` request handlers with explicit JSON
schemas and manual validation. This matches the dependency versions already present
in the repository and avoids adding or changing packages.

## Components

- `src/server.ts`: one MCP surface and fail-closed request routing.
- `src/connector/config.ts`: strict configuration and allowlist validation.
- `src/connector/pathGuard.ts`: canonical path, secret, binary, and write checks.
- `src/connector/processRunner.ts`: fixed executables, argument arrays, timeout,
  output limits, and redaction.
- `src/connector/SecureConnector.ts`: typed I0/I1 capability implementation.
- `src/policy/*`: capability and authority decision.
- `src/audit/AuditLog.ts`: safe arguments, evidence fields, and hash-chain integrity.
- `tests/*`: unit, adversarial, and real STDIO integration verification.

## Approved development inventory

The example configuration records the user-approved candidates:

- roots: governed original, governed development clone, NYXA governance, NYXA rules;
- repositories: governed original and development clone;
- services: `ollama.service` and `docker.service` status only;
- log source: existing `audit.trace` only;
- tests: build, governance receipt, core smoke, and drift audit.

Configuration does not make an unavailable path valid: canonical filesystem checks
still fail closed. The original repository is read-only; patching is restricted to
the development clone.

## Operation and rollback

No production deployment is included. To stop using the connector, stop the local
STDIO process and remove `NYXA_CONNECTOR_CONFIG`; absent configuration returns to
deny-all behavior. To roll back the code, revert the single development-branch
commit or discard the isolated clone. `nyxa_apply_patch` additionally creates a
snapshot and rolls back automatically when post-patch verification fails.

## Claim-to-evidence readiness

Tool results carry a structured claim, implementation reference, evidence list,
adversarial-test reference, and gamma-compatible status (`SUPPORTED`,
`UNSUPPORTED`, `CONTRADICTED`, or `UNKNOWN`). Audit events capture capability,
decision, safe argument representation/hash, affected resource, result, duration,
and chain integrity without credentials.

## Deferred work

- dedicated runtime account and OS ACL provisioning;
- approved service-unit deployment;
- remote MCP authentication and a secure private tunnel;
- external append-only audit sink and cross-process rate limiting;
- any separately approved, strictly typed I2 operation.
