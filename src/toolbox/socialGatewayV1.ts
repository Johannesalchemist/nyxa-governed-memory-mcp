import { createHash, randomUUID } from 'node:crypto';


export type Platform = 'instagram' | 'facebook';
export type SocialProvider = { readonly platform: Platform; accountStatus(): Promise<unknown>; inspect(resource: string): Promise<unknown> };
export type MediaBinding = { accountId: string; mediaId: string; canonicalUrl: string };
export type MetaConfig = { platform: Platform; apiVersion: string; accountId: string; tokenStore(): Promise<string>; resolveOwnedMedia(resource: string, accountId: string): Promise<MediaBinding | null> };
export type AuthRequest = { principal: string; platform: Platform; operation: string; resource: string; requiredScopes: readonly string[] };
export type AuthDecision = { allowed: boolean; resource?: string; operation?: string; principal?: string };
export type SocialHooks = { providers?: SocialProvider[]; authorize(request: AuthRequest): Promise<AuthDecision>; audit(receipt: Record<string, unknown>): Promise<void>; principal(): Promise<string> };
export type SocialRegistry = { register(capability: { name: string; description: string; risk: 'read'; version: string; connector: string; evidence?: boolean; inputSchema: Record<string, unknown>; handler(input: Record<string, unknown>): Promise<unknown> }): void };

const scopes = Object.freeze({ instagram: ['instagram_business_basic'], facebook: ['pages_read_engagement'] });
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const denied = (reason: string): Record<string, unknown> => ({ policy_decision: 'DENIED', status: 'blocked', reason });
const operations = ['inspect', 'account_status', 'retrieve', 'frames', 'transcribe', 'publish'];

// No URL supplied by a caller becomes an outbound request target.
export function canonicalMedia(platform: Platform, value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw Error('invalid_url');
  let u;
  try { u = new URL(value); } catch { throw Error('invalid_url'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) throw Error('invalid_url');
  if (platform === 'instagram' && ['instagram.com', 'www.instagram.com'].includes(u.hostname)) {
    const m = /^\/(reel|p|tv)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(u.pathname);
    if (m) return `https://www.instagram.com/${m[1]}/${m[2]}/`;
  }
  if (platform === 'facebook' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(u.hostname)) {
    const m = /^\/([A-Za-z0-9._-]{1,100})\/videos\/(\d{1,32})\/?$/.exec(u.pathname);
    if (m) return `https://www.facebook.com/${m[1]}/videos/${m[2]}/`;
    const id = u.searchParams.get('v');
    if (['/watch/', '/watch'].includes(u.pathname) && /^\d{1,32}$/.test(id ?? '')) return `https://www.facebook.com/watch/?v=${id}`;
  }
  throw Error('unsupported_url'); // Share links require separately governed resolution.
}

async function boundedJSON(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok || response.status >= 300) throw Error('provider_http_error');
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_provider_response');
  let bytes = 0; const chunks: Buffer[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) throw Error('provider_response_too_large');
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) throw Error('invalid_provider_response');
    return data;
  } finally { await reader.cancel().catch(() => {}); }
}

export class MetaReadProvider {
  // Server-owned configuration; never accept config/token/membership from MCP arguments.
  #config: Readonly<MetaConfig>; #fetch: typeof fetch;
  constructor(config: MetaConfig, transport: typeof fetch = fetch) {
    if (!['instagram', 'facebook'].includes(config.platform) || !/^v\d{1,2}\.0$/.test(config.apiVersion)) throw Error('invalid_config');
    if (!/^\d{1,32}$/.test(config.accountId)) throw Error('invalid_account');
    this.#config = Object.freeze({ ...config }); this.#fetch = transport;
  }
  get platform() { return this.#config.platform; }
  async #get(id: string, fields: string) {
    if (!/^\d{1,32}$/.test(id)) throw Error('invalid_resource');
    const c = this.#config;
    const token = await c.tokenStore();
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw Error('oauth_required');
    const host = c.platform === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com';
    const u = new URL(`https://${host}/${c.apiVersion}/${id}`);
    u.searchParams.set('fields', fields);
    return boundedJSON(await this.#fetch(u, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(15000) }));
  }
  async accountStatus() {
    const data = await this.#get(this.#config.accountId, this.platform === 'instagram' ? 'id,username' : 'id,name');
    if (String(data.id) !== this.#config.accountId) throw Error('provider_identity_mismatch');
    // Account names are untrusted content and excluded from status.
    return { account_id: this.#config.accountId, authenticated_effect: 'account_identity_read' };
  }
  async inspect(resource: string) {
    // Trusted binding must verify that the selected media belongs to this exact account.
    const binding = await this.#config.resolveOwnedMedia(resource, this.#config.accountId);
    if (!binding || binding.accountId !== this.#config.accountId || binding.canonicalUrl !== resource || !/^\d{1,32}$/.test(binding.mediaId)) throw Error('resource_not_authorized');
    const data = await this.#get(binding.mediaId, this.platform === 'instagram' ? 'id,caption,media_type,permalink,timestamp' : 'id,description,permalink_url,created_time');
    if (String(data.id) !== binding.mediaId) throw Error('provider_identity_mismatch');
    const permalink = canonicalMedia(this.platform, data.permalink ?? data.permalink_url);
    if (permalink !== resource) throw Error('provider_resource_mismatch');
    const rawText = data.caption ?? data.description ?? '';
    if (typeof rawText !== 'string') throw Error('invalid_provider_response');
    return { media_id: binding.mediaId, canonical_url: resource, text: rawText.slice(0, 20000), content_trust: 'UNTRUSTED_EXTERNAL_CONTENT', timestamp: data.timestamp ?? data.created_time ?? null };
  }
}

export class SocialGateway {
  #providers: Map<Platform, SocialProvider>; #authorize: SocialHooks['authorize']; #audit: SocialHooks['audit']; #principal: SocialHooks['principal'];
  constructor({ providers = [], authorize, audit, principal }: SocialHooks) {
    if (typeof authorize !== 'function' || typeof audit !== 'function' || typeof principal !== 'function') throw Error('trusted_hooks_required');
    this.#providers = new Map(providers.map(p => [p.platform, p]));
    if (this.#providers.size !== providers.length) throw Error('duplicate_provider');
    this.#authorize = authorize; this.#audit = audit; this.#principal = principal;
  }
  capabilities() {
    return { gateway: 'NYXA Social Gateway V1 candidate', live_meta_verified: false, platforms: ['instagram', 'facebook'], implemented: ['inspect', 'account_status'], unavailable: ['retrieve', 'frames', 'transcribe', 'publish'], configured_providers: [...this.#providers.keys()] };
  }
  async execute(input: Record<string, unknown>) {
    const evidenceId = randomUUID(); let result: Record<string, unknown>;
    const permitted = ['platform', 'operation', 'resource'];
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !permitted.includes(k)) || !['instagram', 'facebook'].includes(String(input.platform)) || !operations.includes(String(input.operation))) {
      result = denied('invalid_arguments');
    } else if (input.operation === 'publish') {
      result = denied('publication_adapter_disabled'); // Even caller-supplied grants cannot enable a write.
    } else {
      try {
        const provider = this.#providers.get(input.platform as Platform);
        const resource = input.operation === 'account_status' ? `account:${input.platform}` : canonicalMedia(input.platform as Platform, input.resource);
        if (input.operation === 'account_status' && input.resource !== undefined) throw Error('invalid_arguments');
        const principal = await this.#principal();
        if (typeof principal !== 'string' || !principal) throw Error('principal_required');
        const decision = await this.#authorize({ principal, platform: input.platform as Platform, operation: String(input.operation), resource, requiredScopes: scopes[input.platform as Platform] });
        // The hook must verify expiry, scope, ownership, consent and replay using NYXA's server-side authority.
        if (!decision || decision.allowed !== true || decision.resource !== resource || decision.operation !== input.operation || decision.principal !== principal) {
          result = denied('authorization_required');
        } else if (!provider) {
          result = { policy_decision: 'ALLOWED', status: 'not_configured', reason: 'oauth_and_provider_configuration_required' };
        } else if (!['inspect', 'account_status'].includes(String(input.operation))) {
          result = { policy_decision: 'ALLOWED', status: 'not_implemented', reason: 'bounded_media_pipeline_required' };
        } else {
          await this.#audit({ evidence_id: evidenceId, phase: 'before_provider_read', principal, operation: input.operation, resource_sha256: hash(resource) });
          const data = input.operation === 'inspect' ? await provider.inspect(resource) : await provider.accountStatus();
          result = { policy_decision: 'ALLOWED', status: 'effect_observed', data, provenance: { provider: input.platform, operation: input.operation, resource, observed_at: new Date().toISOString(), payload_sha256: hash(data), trust: 'PROVIDER_RESPONSE_VALIDATED' } };
        }
      } catch {
        // Raw provider errors/URLs may include secrets; never echo them.
        result = denied('provider_or_authorization_failure');
      }
    }
    const receipt = { evidence_id: evidenceId, operation: operations.includes(String(input?.operation)) ? input.operation : 'invalid', result_status: result.status, policy_decision: result.policy_decision, result_sha256: hash(result), timestamp: new Date().toISOString() };
    try { await this.#audit(receipt); } catch {
      return { policy_decision: 'INVALID', status: result.status === 'effect_observed' ? 'effect_observed_audit_failed' : 'audit_failed', reason: 'audit_persistence_failed', evidence_id: evidenceId };
    }
    return { ...result, evidence_id: evidenceId };
  }
}

// Registration is inert until the existing registry explicitly imports/calls it.
export function registerSocialGateway(registry: SocialRegistry, gateway: SocialGateway) {
  registry.register({ name: 'social.capabilities', description: 'Reports configured and unavailable social functions.', risk: 'read', version: '0.1.0', connector: 'media', inputSchema: { type: 'object', additionalProperties: false }, handler: async input => Object.keys(input).length ? denied('invalid_arguments') : gateway.capabilities() });
  registry.register({ name: 'social.execute_read', description: 'Governed account and owned media inspection; external text stays untrusted.', risk: 'read', version: '0.1.0', connector: 'media', evidence: true, inputSchema: { type: 'object', additionalProperties: false, required: ['platform', 'operation'], properties: { platform: { enum: ['instagram', 'facebook'] }, operation: { enum: ['inspect', 'account_status'] }, resource: { type: 'string', maxLength: 2000 } } }, handler: input => gateway.execute(input) });
}


// Development declarations expose the integration contract without fabricating authority.
// Replace these registrations with registerSocialGateway only after trusted hooks are bound.
export function registerSocialDeclarations(registry: SocialRegistry) {
  registry.register({ name: 'social.capabilities', description: 'Social integration readiness; no credentials or account claims.', risk: 'read', version: '0.1.0', connector: 'social-meta', inputSchema: { type: 'object', additionalProperties: false }, handler: async input => Object.keys(input).length ? denied('invalid_arguments') : ({ gateway: 'NYXA Social Gateway V1', platforms: ['instagram', 'facebook'], status: 'not_configured', executable: false, live_meta_verified: false, implemented_modules: ['inspect', 'account_status', 'oauth_state', 'local_media_worker'], unavailable: ['retrieve', 'frames', 'transcribe', 'publish'], blockers: ['trusted_authority_binding', 'meta_app_callback_verification', 'provider_token_store', 'owned_media_binding', 'media_worker_sandbox'] }) });
  registry.register({ name: 'social.execute_read', description: 'Social reads denied until server authority and account configuration are bound.', risk: 'read', version: '0.1.0', connector: 'social-meta', evidence: true, inputSchema: { type: 'object', additionalProperties: false, required: ['platform', 'operation'], properties: { platform: { enum: ['instagram', 'facebook'] }, operation: { enum: ['inspect', 'account_status'] }, resource: { type: 'string', maxLength: 2000 } } }, handler: async () => ({ ...denied('trusted_authority_binding_required'), executable: false }) });
}
