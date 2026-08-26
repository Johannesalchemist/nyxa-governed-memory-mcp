# Nyxa Governed Memory MCP

Nyxa Governed Memory MCP is a governance-first MCP server. The secure connector
extends the existing server; it is not a parallel MCP and never exposes a generic
shell.

## Security model

The execution path is:

`Intent -> Classification -> Capability -> Constraint Check -> Authority Check -> Execute/Reject -> Evidence -> Audit`

Unknown actions fail closed. Proposal authority is not commit authority.

Capability classes:

- **I0 READ**: scoped, non-mutating inspection.
- **I1 REVERSIBLE DEV**: approved test targets and single-file patches inside an
  explicitly configured development root.
- **I2 CONTROLLED CHANGE**: not exposed by v0.1.
- **I3 FORBIDDEN**: technically unreachable by v0.1.

## Active tools

Legacy governance tools remain available:

- `system.status`
- `policy.mode`
- `audit.trace`

Secure connector v0.1 adds:

- `nyxa_system_status`
- `nyxa_list`
- `nyxa_read_file`
- `nyxa_search`
- `nyxa_git_status`
- `nyxa_git_diff`
- `nyxa_logs`
- `nyxa_run_test`
- `nyxa_apply_patch`

There is deliberately no `exec`, `shell`, `run_command`, `ssh_exec`, or equivalent
free-form command tool.

## Configuration

The connector is deny-all unless `NYXA_CONNECTOR_CONFIG` points to a valid JSON
configuration. Start from `config/connector.dev.example.json`, review every root,
repository, service, and test target, and keep production paths read-only.

The example contains no credentials. Secret-like files, binary files, traversal,
symlink escapes, unapproved services, unapproved test commands, and writes outside
the development root are rejected.

## Build and verify

Use the repository's existing dependency set:

```sh
npm run test:all
```

This builds TypeScript, runs security and adversarial tests, and exercises the real
MCP STDIO transport. No dependency installation is part of the v0.1 change.

Start locally after review:

```sh
NYXA_CONNECTOR_CONFIG=/absolute/path/to/reviewed-config.json npm run start
```

The existing loopback `/tool` endpoint is outside this implementation and must
remain bound to `127.0.0.1:3101`.

## Deployment boundary

v0.1 is a development implementation only. A later runtime deployment must use a
dedicated unprivileged Linux user with no sudo and no Docker-group membership.
No runtime user, service, tunnel, remote endpoint, or production activation is
created here.

See [Secure Connector v0.1](docs/SECURE_CONNECTOR_V01.md) and
[Threat Model](docs/THREAT_MODEL.md).
