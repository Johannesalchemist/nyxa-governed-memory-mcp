# Threat Model

## Scope and trust boundaries

The protected assets are NYXA source, governance controls, secrets, service state,
audit evidence, and human authority. The LLM and all tool arguments are untrusted.
The MCP capability layer is the policy boundary; the operating-system account and
filesystem permissions are a second boundary. Configured roots, repositories,
services, and test targets are allowlists, not discovery hints.

v0.1 supports local MCP STDIO only. It does not expose a TCP listener, remote MCP,
SSH, a Docker socket, or an arbitrary process interface.

## Capability mapping

| Class | v0.1 status | Operations |
| --- | --- | --- |
| I0 READ | Available when allowlisted | status, list, read, search, git status/diff, approved audit log |
| I1 REVERSIBLE DEV | Available only in development root | fixed test targets, guarded single-file patch |
| I2 CONTROLLED CHANGE | Not exposed | restart, install, migrate, deploy, runtime configuration |
| I3 FORBIDDEN | Unreachable | shell, privilege changes, credentials, destructive operations, gate bypass |

## Threats and controls

| Threat | Control | Verification |
| --- | --- | --- |
| Directory traversal or absolute-path escape | root identifiers, lexical validation, canonical realpath containment | security tests |
| Symlink escape | canonical target and parent checks after symlink resolution | adversarial test |
| Secret or binary disclosure | blocked names/extensions/directories, content inspection, redaction | security tests |
| Shell or argument injection | no generic execution tool; fixed executable and argument arrays; `shell: false` | adversarial tests |
| Git option/revision injection | repository IDs and strict revision grammar; fixed Git flags | security tests |
| Unapproved service access | exact service allowlist; no Docker socket | integration tests |
| Production write disguised as read | capability classification and development-root write gate | adversarial tests |
| Governance/control-plane modification | protected connector, policy, audit, config, and governance paths | adversarial tests |
| Oversized output or resource exhaustion | output/result limits, timeouts, result caps, rate limiter | security tests |
| Unknown or malformed request | strict schemas and fail-closed `UNKNOWN`/`INVALID` results | integration tests |
| Audit tampering | append-only JSON lines with chained hashes and integrity verification | security test |
| Credential leakage through audit | safe argument hashing/representation and redaction before persistence | security tests |
| Dependency drift in test targets | exact executable/arguments plus integrity hash | configuration tests |

## Patch transaction

`nyxa_apply_patch` accepts one unified diff for one regular file in a configured
development root. It validates the resource and patch, snapshots content and mode,
runs `git apply --check`, applies the patch, executes the configured post-patch test,
and returns the diff. A failed check restores the exact snapshot. Rename, deletion,
binary, multi-file, oversized, secret, production, and control-plane patches are
denied.

## Residual risks

- In-memory rate limits reset on process restart and do not coordinate across
  multiple instances.
- Hash-chained local audit logs detect modification but do not prevent deletion by
  an operating-system actor with filesystem access.
- Redaction is defense in depth; allowlists and secret-file denial remain primary.
- Service status relies on fixed local system tools and the runtime account's OS
  permissions.
- Remote MCP authentication and secure tunnelling are intentionally deferred.

## Deployment requirements

Run a later deployment under a dedicated, unprivileged user with no sudo, no
Docker-group membership, minimal filesystem ACLs, a private audit directory, and no
network listener unless separately designed and approved. Keep `/tool` loopback-only.
Any I2 capability needs its own typed tool, explicit approval flow, impact and
rollback evidence, and a separate threat review.
