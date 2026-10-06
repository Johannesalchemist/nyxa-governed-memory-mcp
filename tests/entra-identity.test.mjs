import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { EntraIdentityVerifier, EntraIdentityError } from "../dist/identity/entraIdentity.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const now = 2_000_000_000;
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
jwk.kid = "test-kid";
jwk.use = "sig";
jwk.alg = "RS256";

const enc = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(overrides = {}, headerOverrides = {}, key = privateKey) {
  const header = { alg: "RS256", typ: "JWT", kid: "test-kid", ...headerOverrides };
  const claims = {
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    aud: clientId, tid: tenantId, oid: objectId, sub: "subject-1",
    iat: now - 10, nbf: now - 10, exp: now + 600, ...overrides
  };
  const signingInput = `${enc(header)}.${enc(claims)}`;
  return `${signingInput}.${sign("RSA-SHA256", Buffer.from(signingInput), key).toString("base64url")}`;
}
const verifier = new EntraIdentityVerifier(
  { tenantId, clientId, clockSkewSeconds: 0 },
  async () => ({ keys: [jwk] })
);

async function expectCode(promise, code) {
  await assert.rejects(promise, error =>
    error instanceof EntraIdentityError && error.code === code
  );
}

test("valid Entra token becomes immutable NYXA principal", async () => {
  const principal = await verifier.verify(token(), now * 1000);
  assert.deepEqual(principal, {
    authorityPrincipalId: `entra:${tenantId}:${objectId}`,
    authorityMethod: "entra-jwks",
    tenantId,
    objectId,
    subject: "subject-1"
  });
});

test("tampered signature is denied", async () => {
  const parts = token().split(".");
  parts[1] = enc({ tid: tenantId, oid: objectId, sub: "attacker", aud: clientId,
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`, exp: now + 600 });
  await expectCode(verifier.verify(parts.join("."), now * 1000), "signature_invalid");
});
test("wrong tenant is denied", async () => {
  await expectCode(verifier.verify(token({ tid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }), now * 1000), "tenant_invalid");
});
test("wrong issuer is denied", async () => {
  await expectCode(verifier.verify(token({ iss: "https://issuer.invalid/v2.0" }), now * 1000), "issuer_invalid");
});
test("wrong audience is denied", async () => {
  await expectCode(verifier.verify(token({ aud: "other-app" }), now * 1000), "audience_invalid");
});
test("expired token is denied", async () => {
  await expectCode(verifier.verify(token({ exp: now - 1 }), now * 1000), "token_expired");
});
test("future nbf is denied", async () => {
  await expectCode(verifier.verify(token({ nbf: now + 1 }), now * 1000), "token_not_yet_valid");
});
test("missing object identity is denied", async () => {
  await expectCode(verifier.verify(token({ oid: "" }), now * 1000), "principal_claims_missing");
});
test("non-RS256 algorithm is denied", async () => {
  await expectCode(verifier.verify(token({}, { alg: "HS256" }), now * 1000), "alg_not_allowed");
});
test("unknown kid is denied", async () => {
  await expectCode(verifier.verify(token({}, { kid: "unknown" }), now * 1000), "jwks_kid_missing");
});
