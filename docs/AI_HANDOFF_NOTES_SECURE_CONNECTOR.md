# AI_HANDOFF_NOTES: Secure Connector v0.1

## Project patterns

- Extend the one governed-memory MCP; do not add a parallel server.
- Treat configuration as an allowlist and all model input as hostile.
- Keep MCP STDIO local and `/tool` on `127.0.0.1:3101` unchanged.
- Proposal authority is not commit or deployment authority.

## Do not repeat

- Do not introduce a generic shell, command string, SSH tool, Docker socket, or
  implicit production write.
- Do not assume an allowlisted path exists or is safe; canonicalize it every time.
- Do not pass raw sensitive arguments into audit resource fields.
- Do not mix the MCP SDK's internal Zod v3 expectations with the application's Zod
  v4 schemas. The low-level request-handler API is deliberate.
- When editing from the enclosing Codex workspace, prefix patch paths with the
  development-clone directory; otherwise files can land outside the repository.

## Proven solutions

- Low-level MCP handlers plus explicit JSON schemas/manual validation.
- Root IDs instead of arbitrary absolute paths.
- `spawn` with a fixed executable, fixed arguments, `shell: false`, a minimal
  environment, timeout, truncation, and redaction.
- Single-file snapshot/apply/check/test/rollback for reversible writes.
- Hash-chained audit JSONL with safe argument representation.

## Open work

- **P1:** independently review and approve the runtime account/ACL/service plan.
- **P1:** validate production-local configuration without activating it.
- **P2:** design remote authentication and private tunnelling only if required.
- **P2:** move audit integrity anchoring and rate limiting to shared durable stores.

## Next steps

1. Review the committed development diff and evidence report.
2. Approve or reject a separate runtime deployment plan.
3. Only after approval, provision the restricted runtime identity and observe a
   local-only canary.
