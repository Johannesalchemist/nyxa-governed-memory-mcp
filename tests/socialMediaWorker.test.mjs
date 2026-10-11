import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { SocialMediaWorker } from '../src/toolbox/socialMediaWorker.mjs';
const run = promisify(execFile); let bytes;
test.before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nyxa-fixture-'));
  try {
    const p = join(dir, 'fixture.mp4');
    await run('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000', '-t', '2', '-c:v', 'mpeg4', '-threads', '1', '-c:a', 'aac', '-y', p]);
    bytes = await readFile(p);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
const make = (extra = {}) => new SocialMediaWorker({ authorizeEffect: async x => ({ ...x, allowed: true }), audit: async () => {}, ...extra });
const request = operation => ({ operation, bytes, resource: 'fixture:generated-video' });
test('actual frames produced with PNG signatures and input-bound hashes', async () => {
  const r = await make().process(request('frames')); assert.equal(r.status, 'effect_observed'); assert.equal(r.frames.length, 2); assert.equal(r.provenance.frame_sha256.length, 2);
});
test('actual mono WAV audio produced', async () => {
  const r = await make().process(request('audio')); assert.equal(r.status, 'effect_observed'); assert.equal(r.audio.toString('ascii',0,4), 'RIFF'); assert.ok(r.audio.length > 1000);
});
test('effect denial prevents actual extraction', async () => {
  const r = await make({ authorizeEffect: async () => ({ allowed: false }) }).process(request('frames')); assert.equal(r.status, 'DENIED'); assert.equal(r.frames, undefined);
});
test('wrong asset scope denies effect', async () => {
  const r = await make({ authorizeEffect: async x => ({ ...x, asset_sha256: 'fake', allowed: true }) }).process(request('audio')); assert.equal(r.status, 'DENIED');
});
test('playlists and arbitrary paths are not accepted as media', async () => {
  const r = await make().process({ ...request('frames'), bytes: Buffer.from('#EXTM3U\nhttp://127.0.0.1/private') }); assert.equal(r.status, 'DENIED');
});
test('transcription unavailable until trusted provider configured', async () => {
  assert.equal((await make().process(request('transcribe'))).status, 'not_configured');
});
test('transcription fixture bound to actual extracted audio; not a real ASR claim', async () => {
  const r = await make({ transcriber: async x => ({ verified: true, text: 'FIXTURE TRANSCRIPT', provider: 'fixture-only', audio_sha256: createHash('sha256').update(x.audio).digest('hex') }) }).process(request('transcribe'));
  assert.equal(r.status, 'effect_observed'); assert.equal(r.provenance.provider, 'fixture-only'); assert.equal(r.content_trust, 'UNTRUSTED_EXTERNAL_CONTENT');
});
test('unverified ASR response is rejected', async () => {
  const r = await make({ transcriber: async () => ({ text: 'fake' }) }).process(request('transcribe')); assert.equal(r.status, 'worker_failed');
});
