import { randomBytes, createHash } from 'node:crypto';

const digest = x => createHash('sha256').update(x).digest('hex');
const PERMISSIONS = Object.freeze({ instagram: ['instagram_business_basic'], facebook: ['pages_show_list', 'pages_read_engagement'] });

/** Server-owned hooks only. No tokens, secrets, session principal or redirect from MCP input. */
export class SocialOAuth {
  #config; #store; #hooks; #clock;
  constructor({ config, stateStore, principal, authorizeConnect, exchangeCode, tokenStore, audit, clock = Date.now }) {
    if (!config || !['instagram', 'facebook'].includes(config.platform)) throw Error('invalid_platform');
    const redirect = new URL(config.redirectUri);
    if (redirect.protocol !== 'https:' || redirect.username || redirect.password || redirect.hash || redirect.search || !config.registeredRedirects?.includes(redirect.href)) throw Error('unverified_redirect');
    if (!/^\d{1,32}$/.test(config.appId ?? '') || !/^v\d{1,2}\.0$/.test(config.apiVersion ?? '')) throw Error('invalid_app_config');
    if (config.verified !== true) throw Error('app_configuration_not_verified');
    for (const fn of [stateStore?.put, stateStore?.consume, principal, authorizeConnect, exchangeCode, tokenStore?.write, audit]) if (typeof fn !== 'function') throw Error('trusted_hooks_required');
    this.#config = Object.freeze({ ...config, redirectUri: redirect.href }); this.#store = stateStore;
    this.#hooks = { principal, authorizeConnect, exchangeCode, tokenStore, audit }; this.#clock = clock;
  }
  async begin(input = {}) {
    if (!input || Object.keys(input).length) return { status: 'DENIED', reason: 'invalid_arguments' };
    const principal = await this.#hooks.principal();
    if (typeof principal !== 'string' || !principal || await this.#hooks.authorizeConnect(principal, this.#config.platform) !== true) return { status: 'DENIED', reason: 'connect_not_authorized' };
    const c = this.#config; const state = randomBytes(32).toString('base64url');
    const record = { principal, platform: c.platform, appId: c.appId, redirectUri: c.redirectUri, stateHash: digest(state), expiresAt: this.#clock() + 300000 };
    const u = new URL(c.platform === 'instagram' ? 'https://www.instagram.com/oauth/authorize' : `https://www.facebook.com/${c.apiVersion}/dialog/oauth`);
    u.searchParams.set('client_id', c.appId); u.searchParams.set('redirect_uri', c.redirectUri);
    u.searchParams.set('response_type', 'code'); u.searchParams.set('state', state);
    u.searchParams.set('scope', PERMISSIONS[c.platform].join(','));
    await this.#hooks.audit({ phase: 'oauth_prepare', platform: c.platform, principal, state_sha256: record.stateHash, expires_at: record.expiresAt });
    await this.#store.put(record); // Must be durable and reject duplicate keys; no unprotected default store.
    return { status: 'awaiting_personal_login', authorization_url: u.href, permissions: [...PERMISSIONS[c.platform]], expires_at: record.expiresAt, publication_authority: 'NONE' };
  }
  async callback(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['state', 'code', 'error'].includes(k)) || typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) return { status: 'DENIED', reason: 'invalid_callback' };
    const principal = await this.#hooks.principal();
    const c = this.#config; const now = this.#clock();
    // consume must atomically validate principal+expiry and delete; wrong principal must not consume another user's state.
    const r = await this.#store.consume(digest(input.state), principal, now);
    if (!r || r.principal !== principal || r.expiresAt <= now || r.platform !== c.platform || r.appId !== c.appId || r.redirectUri !== c.redirectUri || r.stateHash !== digest(input.state)) return { status: 'DENIED', reason: 'state_invalid_expired_or_replayed' };
    if (input.error || typeof input.code !== 'string' || !input.code || input.code.length > 4096) return { status: 'DENIED', reason: 'authorization_not_completed' };
    try {
      // Re-check authority after the human interaction; permission may have been revoked.
      if (await this.#hooks.authorizeConnect(principal, c.platform) !== true) return { status: 'DENIED', reason: 'connect_not_authorized' };
      await this.#hooks.audit({ phase: 'oauth_exchange_admission', platform: c.platform, principal, state_sha256: r.stateHash });
      const session = await this.#hooks.exchangeCode({ code: input.code, platform: c.platform, appId: c.appId, redirectUri: c.redirectUri });
      // exchangeCode must query real provider token scopes and account identity, never trust the requested scope list.
      if (!session || session.providerVerified !== true || typeof session.accessToken !== 'string' || !session.accessToken || !/^\d{1,32}$/.test(session.accountId ?? '') || !Array.isArray(session.scopes) || !PERMISSIONS[c.platform].every(s => session.scopes.includes(s)) || !(session.expiresAt > now)) return { status: 'DENIED', reason: 'provider_session_not_verified' };
      // Read gateway remains unable to publish even if provider returns extra rights.
      await this.#hooks.tokenStore.write({ principal, platform: c.platform, accountId: session.accountId, accessToken: session.accessToken, scopes: session.scopes, expiresAt: session.expiresAt });
      try { await this.#hooks.audit({ phase: 'oauth_token_stored', platform: c.platform, principal, account_id: session.accountId, expires_at: session.expiresAt }); }
      catch { return { status: 'token_stored_audit_failed', publication_authority: 'NONE' }; }
      return { status: 'account_connected', account_id: session.accountId, platform: c.platform, expires_at: session.expiresAt, publication_authority: 'NONE' };
    } catch { return { status: 'DENIED', reason: 'exchange_or_storage_failure' }; }
  }
}
