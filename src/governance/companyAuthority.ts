import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const uuid = z.string().uuid();
const membership = z.object({
  principal: z.string().min(1).max(200),
  tenant_id: uuid,
  organizations: z.array(z.object({
    organization_id: uuid,
    permissions: z.array(z.enum(["read", "write"])).min(1),
    audit_ids: z.array(uuid).min(1)
  }).strict()).min(1)
}).strict();
const registry = z.object({ version: z.literal(1), memberships: z.array(membership) }).strict();
export type CompanyResource = { tenant_id: string; organization_id: string; audit_id: string };
export type CompanyAuthorityDecision = {
  allowed: boolean; domain: "TENANT_AUTHORITY"; reason: string; principal: string | null;
};

/** Trust boundary: trusted OS launcher, one principal per stdio process. CLI arguments
 * are never MCP arguments or clientInfo. Shared unbound bridge processes MUST NOT be
 * configured with a universal principal. No membership-issuance tool exists.
 * Registry is re-read for each authorization; unavailable/invalid state fails closed.
 * CLI flags are an OS-launcher assertion, NOT proof of an end-user login. Only use this
 * mode when the launcher owns the process and routes exactly one authenticated caller
 * to its stdin. A host administrator or arbitrary-code execution as the service UID
 * is outside this boundary. Deployment must keep this file and its parent directories
 * under operator control, outside data and all connector-accessible roots.
 * The current production tunnel has NOT been verified to supply a per-caller binding;
 * without both flags this implementation denies Company Audit, by design.
 * Registry shape: {version:1,memberships:[{principal,tenant_id,organizations:[{
 * organization_id,permissions:["read","write"],audit_ids:[canonical UUID]}]}]}.
 * Audit IDs are exact scopes, never wildcards. No MandateStore or HumanGrant reuse.
 * Membership checks linearize at each completed registry read. Revocation is not
 * cancellation of an already-authorized, in-flight operation; there is no global
 * transaction between an operator replacing the registry and an append syscall.
 */
export class CompanyAuthority {
  public readonly restrictsSession = process.argv.slice(2).some(arg => arg.startsWith("--company-principal=") || arg.startsWith("--company-authority-file="));
  public get principalId(): string | null { return this.principal ?? null; }
  public permitsTool(name: string): boolean {
    return !this.restrictsSession || ["nyxa_company_audit_read", "nyxa_propose_action", "audit.trace"].includes(name);
  }
  private readonly principal: string | undefined;
  private readonly file: string | undefined;
  public constructor(private readonly excludedRoots: readonly string[]) {
    const option = (name: string): string | undefined => {
      const matches = process.argv.slice(2).filter(arg => arg.startsWith(name + "="));
      return matches.length === 1 ? matches[0]!.slice(name.length + 1) || undefined : undefined;
    };
    this.principal = option("--company-principal");
    this.file = option("--company-authority-file");
  }
  public async check(resource: CompanyResource, permission: "read" | "write"): Promise<CompanyAuthorityDecision> {
    const result = (allowed: boolean, reason: string): CompanyAuthorityDecision => ({
      allowed, domain: "TENANT_AUTHORITY", reason, principal: this.principal ?? null
    });
    if (!this.principal || !this.file) return result(false, "principal_binding_missing");
    try {
      if (!isAbsolute(this.file) || await realpath(this.file) !== resolve(this.file)) throw new Error();
      for (const root of this.excludedRoots) {
        const canonicalRoot = await realpath(root).catch(() => resolve(root));
        const rel = relative(canonicalRoot, this.file);
        if (rel === "" || (!rel.startsWith("../") && !isAbsolute(rel))) throw new Error();
      }
      const handle = await open(this.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      let raw: string;
      try {
        const stat = await handle.stat();
        const named = await lstat(this.file);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 65536 || (stat.mode & 0o077) !== 0 ||
            (stat.uid !== process.geteuid!() && stat.uid !== 0) || stat.ino !== named.ino || stat.dev !== named.dev) throw new Error();
        const buffer = Buffer.alloc(65537);
        let bytes = 0;
        while (bytes < buffer.length) {
          const chunk = await handle.read(buffer, bytes, buffer.length - bytes, bytes);
          if (!chunk.bytesRead) break;
          bytes += chunk.bytesRead;
        }
        if (bytes > 65536) throw new Error();
        const after = await handle.stat();
        if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw new Error();
        raw = buffer.subarray(0, bytes).toString("utf8");
      } finally { await handle.close(); }
      const entries = registry.parse(JSON.parse(raw));
      const tenants = entries.memberships.filter(m => m.principal === this.principal && m.tenant_id === resource.tenant_id);
      if (!tenants.length) return result(false, "tenant_membership_missing");
      if (tenants.length !== 1) return result(false, "authority_registry_ambiguous");
      const orgs = tenants.flatMap(m => m.organizations).filter(o => o.organization_id === resource.organization_id);
      if (!orgs.length) return result(false, "organization_scope_denied");
      if (orgs.length !== 1) return result(false, "authority_registry_ambiguous");
      const audits = orgs.filter(o => o.audit_ids.includes(resource.audit_id));
      if (!audits.length) return result(false, "audit_scope_denied");
      if (!audits.some(o => o.permissions.includes(permission))) return result(false, "permission_denied");
      return result(true, "membership_authorized");
    } catch { return result(false, "authority_registry_invalid"); }
  }
}
