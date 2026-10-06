import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompanyAuthority } from "../dist/governance/companyAuthority.js";

const principal = "entra:ae2e91a0-c74f-4c5d-ac24-ad6533e2bfa0:2098df45-3a51-4bf3-a2b0-d401589d0959";
const tenantId = "ae2e91a0-c74f-4c5d-ac24-ad6533e2bfa0";
const orgId = "44444444-4444-4444-8444-444444444444";
const auditId = "55555555-5555-4555-8555-555555555555";

const dir = await mkdtemp(join(tmpdir(), "nyxa-real-entra-authority-"));
const file = join(dir, "authority.json");
const registry = {
  version: 1,
  memberships: [{
    principal,
    tenant_id: tenantId,
    organizations: [{
      organization_id: orgId,
      permissions: ["read"],
      audit_ids: [auditId]
    }]
  }]
};
await writeFile(file, JSON.stringify(registry));
await chmod(file, 0o600);

process.argv.push("canary", "--company-authority-file=" + file);
const authority = new CompanyAuthority([], principal);

const resource = { tenant_id: tenantId, organization_id: orgId, audit_id: auditId };
console.log("ALLOW_READ", JSON.stringify(await authority.check(resource, "read")));
console.log("DENY_WRITE", JSON.stringify(await authority.check(resource, "write")));
console.log("DENY_TENANT", JSON.stringify(await authority.check({ ...resource, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, "read")));

process.argv.push("--company-principal=human:spoof");
const spoof = new CompanyAuthority([], principal);
console.log("DENY_SPOOF", JSON.stringify(await spoof.check(resource, "read")));

await rm(dir, { recursive: true, force: true });
