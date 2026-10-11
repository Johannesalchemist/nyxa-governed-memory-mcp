import test from 'node:test';
import assert from 'node:assert/strict';
import { SocialOAuth } from '../src/toolbox/socialOAuth.mjs';

function setup({ config = {}, scopes = ['instagram_business_basic'], verified = true, audit = async () => {}, allow = () => true } = {}) {
  const records = new Map(); let actor = 'Jo', now = 1000, exchanges = 0; const stored = [];
  const oauth = new SocialOAuth({ config: { platform: 'instagram', appId: '123', apiVersion: 'v25.0', redirectUri: 'https://example.invalid/oauth/callback', registeredRedirects: ['https://example.invalid/oauth/callback'], verified: true, ...config },
    principal: async () => actor, authorizeConnect: async () => allow(),
    stateStore: { put: async r => { assert.ok(!records.has(r.stateHash)); records.set(r.stateHash, r); }, consume: async (k, p, time) => { const r = records.get(k); if (!r || r.principal !== p || r.expiresAt <= time) return null; records.delete(k); return r; } },
    exchangeCode: async () => { exchanges++; return { accessToken: 'SECRET_TEST_ONLY', accountId: '42', scopes, expiresAt: now + 60000, providerVerified: verified }; },
    tokenStore: { write: async s => stored.push(s) }, audit, clock: () => now });
  return { oauth, stored, exchanges: () => exchanges, actor: a => actor = a, advance: n => now += n };
}
const callback = begun => ({ code: 'CODE_TEST_ONLY', state: new URL(begun.authorization_url).searchParams.get('state') });
test('start returns personal login with read scopes and no secrets', async () => {
  const { oauth } = setup(); const r = await oauth.begin(); const u = new URL(r.authorization_url);
  assert.equal(r.status, 'awaiting_personal_login'); assert.equal(u.host, 'www.instagram.com');
  assert.equal(u.searchParams.get('scope'), 'instagram_business_basic'); assert.equal(r.publication_authority, 'NONE'); assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('Facebook start has only Page read scopes', async () => {
  const { oauth } = setup({ config: { platform: 'facebook' } }); const r = await oauth.begin();
  assert.deepEqual(r.permissions, ['pages_show_list', 'pages_read_engagement']); assert.equal(new URL(r.authorization_url).host, 'www.facebook.com');
});
test('valid callback stores token but never returns it; replay rejected', async () => {
  const { oauth, stored, exchanges } = setup(); const c = callback(await oauth.begin());
  const r = await oauth.callback(c); assert.equal(r.status, 'account_connected'); assert.equal(stored.length, 1); assert.ok(!JSON.stringify(r).includes('SECRET'));
  assert.equal((await oauth.callback(c)).status, 'DENIED'); assert.equal(exchanges(), 1);
});
test('wrong principal cannot consume state; right principal can continue', async () => {
  const s = setup(); const c = callback(await s.oauth.begin()); s.actor('other'); assert.equal((await s.oauth.callback(c)).status, 'DENIED'); assert.equal(s.exchanges(), 0);
  s.actor('Jo'); assert.equal((await s.oauth.callback(c)).status, 'account_connected');
});
test('expired state denies exchange', async () => {
  const s = setup(); const c = callback(await s.oauth.begin()); s.advance(300001); assert.equal((await s.oauth.callback(c)).status, 'DENIED'); assert.equal(s.exchanges(), 0);
});
test('state swapping and caller redirect denied', async () => {
  const s = setup(); const c = callback(await s.oauth.begin());
  assert.equal((await s.oauth.callback({ ...c, state: 'A'.repeat(43) })).status, 'DENIED');
  assert.equal((await s.oauth.callback({ ...c, redirect: 'https://evil.invalid' })).status, 'DENIED'); assert.equal(s.exchanges(), 0);
});
test('missing actual granted scopes blocks storage', async () => {
  const s = setup({ scopes: [] }); const r = await s.oauth.callback(callback(await s.oauth.begin())); assert.equal(r.status, 'DENIED'); assert.equal(s.stored.length, 0);
});
test('unverified provider session blocks storage', async () => {
  const s = setup({ verified: false }); assert.equal((await s.oauth.callback(callback(await s.oauth.begin()))).status, 'DENIED'); assert.equal(s.stored.length, 0);
});
test('authorization revoked during login prevents exchange', async () => {
  let allowed = true; const s = setup({ allow: () => allowed }); const c = callback(await s.oauth.begin()); allowed = false;
  assert.equal((await s.oauth.callback(c)).status, 'DENIED'); assert.equal(s.exchanges(), 0);
});
test('OAuth error consumes one-time state without exchange', async () => {
  const s = setup(); const c = callback(await s.oauth.begin()); assert.equal((await s.oauth.callback({ ...c, error: 'access_denied' })).status, 'DENIED');
  assert.equal((await s.oauth.callback(c)).status, 'DENIED'); assert.equal(s.exchanges(), 0);
});
test('parallel callback consumes state only once', async () => {
  const s = setup(); const c = callback(await s.oauth.begin()); const r = await Promise.all([s.oauth.callback(c), s.oauth.callback(c)]);
  assert.equal(r.filter(x => x.status === 'account_connected').length, 1); assert.equal(s.exchanges(), 1);
});
test('unverified application config and redirects rejected', () => {
  assert.throws(() => setup({ config: { verified: false } })); assert.throws(() => setup({ config: { redirectUri: 'https://evil.invalid/oauth/callback' } }));
});
