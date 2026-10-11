import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileOAuthStateStore } from '../src/toolbox/socialOAuthState.mjs';
const key = 'a'.repeat(64);
async function setup(t) { const dir = await mkdtemp(join(tmpdir(), 'nyxa-oauth-test-')); t.after(() => rm(dir, { recursive: true, force: true })); return { dir, store: new FileOAuthStateStore(dir) }; }
const record = { stateHash: key, principal: 'Jo', expiresAt: 10000, platform: 'instagram' };
test('state persists across store instances with private permissions', async t => {
  const { dir, store } = await setup(t); await store.put(record);
  assert.equal((await stat(join(dir, `${key}.json`))).mode & 0o077, 0);
  assert.deepEqual(await new FileOAuthStateStore(dir).consume(key, 'Jo', 2000), record);
  assert.equal(await store.consume(key, 'Jo', 2000), null);
});
test('two independent consumers can claim only once', async t => {
  const { dir, store } = await setup(t); await store.put(record);
  const r = await Promise.all([store.consume(key, 'Jo', 2000), new FileOAuthStateStore(dir).consume(key, 'Jo', 2000)]);
  assert.equal(r.filter(Boolean).length, 1);
});
test('wrong principal leaves state available for its owner', async t => {
  const { store } = await setup(t); await store.put(record);
  assert.equal(await store.consume(key, 'other', 2000), null); assert.ok(await store.consume(key, 'Jo', 2000));
});
test('expired state cannot be claimed', async t => {
  const { store } = await setup(t); await store.put(record); assert.equal(await store.consume(key, 'Jo', 10001), null);
});
test('duplicate puts and public state directories fail closed', async t => {
  const { dir, store } = await setup(t); await store.put(record); await assert.rejects(store.put(record));
  await chmod(dir, 0o755); await assert.rejects(store.consume(key, 'Jo', 2000));
});
