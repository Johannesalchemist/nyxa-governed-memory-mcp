import { createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";

export type EntraVerifierConfig = {
  tenantId: string;
  clientId: string;
  clockSkewSeconds?: number;
  jwksUrl?: string;
};

export type EntraPrincipal = {
  authorityPrincipalId: string;
  authorityMethod: "entra-jwks";
  tenantId: string;
  objectId: string;
  subject: string;
};

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = {
  iss?: unknown; aud?: unknown; tid?: unknown; oid?: unknown; sub?: unknown;
  exp?: unknown; nbf?: unknown; iat?: unknown;
};
type Jwks = { keys?: JsonWebKey[] };

export class EntraIdentityError extends Error {
  public constructor(public readonly code: string) { super(code); }
}
const b64u = (value: string): Buffer => Buffer.from(value, "base64url");
const parseJson = <T>(segment: string, code: string): T => {
  try { return JSON.parse(b64u(segment).toString("utf8")) as T; }
  catch { throw new EntraIdentityError(code); }
};
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;
const numeric = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export class EntraIdentityVerifier {
  private readonly skew: number;
  private readonly jwksUrl: string;
  public constructor(
    private readonly config: EntraVerifierConfig,
    private readonly fetchJwks: (url: string) => Promise<Jwks> = async url => {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (!response.ok) throw new EntraIdentityError("jwks_fetch_failed");
      return await response.json() as Jwks;
    }
  ) {
    if (!config.tenantId || !config.clientId) throw new EntraIdentityError("config_invalid");
    this.skew = Math.max(0, Math.min(config.clockSkewSeconds ?? 60, 300));
    this.jwksUrl = config.jwksUrl ??
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/discovery/v2.0/keys`;
  }
  public async verify(idToken: string, nowMs = Date.now()): Promise<EntraPrincipal> {
    const parts = idToken.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) throw new EntraIdentityError("jwt_malformed");
    const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
    const header = parseJson<JwtHeader>(encodedHeader, "jwt_header_invalid");
    const claims = parseJson<JwtClaims>(encodedClaims, "jwt_claims_invalid");
    if (header.alg !== "RS256") throw new EntraIdentityError("alg_not_allowed");
    const kid = text(header.kid);
    if (!kid) throw new EntraIdentityError("kid_missing");

    const jwks = await this.fetchJwks(this.jwksUrl);
    const matches = Array.isArray(jwks.keys) ? jwks.keys.filter(key => key.kid === kid) : [];
    if (matches.length !== 1) throw new EntraIdentityError(matches.length ? "jwks_kid_ambiguous" : "jwks_kid_missing");
    const key = matches[0]!;
    if (key.kty !== "RSA") throw new EntraIdentityError("jwks_key_type_invalid");
    let publicKey;
    try { publicKey = createPublicKey({ key, format: "jwk" }); }
    catch { throw new EntraIdentityError("jwks_key_invalid"); }

    const signingInput = Buffer.from(`${encodedHeader}.${encodedClaims}`, "ascii");
    let signature: Buffer;
    try { signature = b64u(encodedSignature); }
    catch { throw new EntraIdentityError("signature_encoding_invalid"); }
    if (!verifySignature("RSA-SHA256", signingInput, publicKey, signature))
      throw new EntraIdentityError("signature_invalid");
    const tenantId = text(claims.tid);
    const issuer = text(claims.iss);
    const audience = text(claims.aud);
    const objectId = text(claims.oid);
    const subject = text(claims.sub);
    const exp = numeric(claims.exp);
    const nbf = numeric(claims.nbf);
    if (!tenantId || tenantId !== this.config.tenantId) throw new EntraIdentityError("tenant_invalid");
    const expectedIssuer = `https://login.microsoftonline.com/${this.config.tenantId}/v2.0`;
    if (issuer !== expectedIssuer) throw new EntraIdentityError("issuer_invalid");
    if (audience !== this.config.clientId) throw new EntraIdentityError("audience_invalid");
    if (!objectId || !subject) throw new EntraIdentityError("principal_claims_missing");
    if (exp === undefined) throw new EntraIdentityError("exp_missing");
    const now = Math.floor(nowMs / 1000);
    if (exp < now - this.skew) throw new EntraIdentityError("token_expired");
    if (nbf !== undefined && nbf > now + this.skew) throw new EntraIdentityError("token_not_yet_valid");

    return {
      authorityPrincipalId: `entra:${tenantId}:${objectId}`,
      authorityMethod: "entra-jwks",
      tenantId,
      objectId,
      subject
    };
  }
}
