import { readFile } from "node:fs/promises";
import { EntraIdentityVerifier } from "../dist/identity/entraIdentity.js";

const tenantId = "ae2e91a0-c74f-4c5d-ac24-ad6533e2bfa0";
const clientId = "c1dd0d63-6453-400f-a303-3ebc03d9cf20";
const token = (await readFile("/tmp/nyxa-entra-canary.idtoken", "utf8")).trim();
const verifier = new EntraIdentityVerifier({ tenantId, clientId });
const principal = await verifier.verify(token);
console.log(JSON.stringify({
  authorityPrincipalId: principal.authorityPrincipalId,
  authorityMethod: principal.authorityMethod,
  tenantId: principal.tenantId,
  objectId: principal.objectId,
  subjectPresent: !!principal.subject
}));
