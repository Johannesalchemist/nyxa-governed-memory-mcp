import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const exec = promisify(execFile);
const sha = b => createHash('sha256').update(b).digest('hex');
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
export function validateMP4(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 16 || bytes.length > MAX_ASSET_BYTES || bytes.toString('ascii', 4, 8) !== 'ftyp') throw Error('invalid_or_oversized_mp4');
}

/** Fixed local worker candidate. Must run in the approved NYXA execution sandbox before remote registration. */
export class SocialMediaWorker {
  #authorize; #audit; #transcribe;
  constructor({ authorizeEffect, audit, transcriber = null }) {
    if (typeof authorizeEffect !== 'function' || typeof audit !== 'function') throw Error('trusted_hooks_required');
    this.#authorize = authorizeEffect; this.#audit = audit; this.#transcribe = transcriber;
  }
  async process({ operation, bytes, resource }) {
    if (!['frames', 'audio', 'transcribe'].includes(operation) || typeof resource !== 'string' || !resource) return { status: 'DENIED', reason: 'invalid_request' };
    try { validateMP4(bytes); } catch { return { status: 'DENIED', reason: 'invalid_asset' }; }
    const assetHash = sha(bytes);
    const decision = await this.#authorize({ operation, resource, asset_sha256: assetHash, max_seconds: 30, max_frames: 3 });
    if (!decision || decision.allowed !== true || decision.operation !== operation || decision.resource !== resource || decision.asset_sha256 !== assetHash) return { status: 'DENIED', reason: 'effect_not_authorized' };
    // Sending audio to a transcriber is a separate disclosure. Fixed trusted connector only.
    if (operation === 'transcribe' && !this.#transcribe) return { status: 'not_configured', reason: 'transcriber_required' };
    await this.#audit({ phase: 'media_worker_admission', operation, resource, asset_sha256: assetHash });
    const dir = await mkdtemp(join(tmpdir(), 'nyxa-social-'));
    let completed = false;
    try {
      const path = join(dir, 'asset.mp4'); await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0', '-i', path, '-t', '30'];
      if (operation === 'frames') {
        args.push('-an', '-vf', 'fps=1,scale=320:320:force_original_aspect_ratio=decrease', '-frames:v', '3', '-threads', '1', join(dir, 'frame-%02d.png'));
      } else {
        args.push('-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', join(dir, 'audio.wav'));
      }
      await exec('/usr/bin/ffmpeg', args, { timeout: 15000, maxBuffer: 65536, killSignal: 'SIGKILL', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
      let result;
      if (operation === 'frames') {
        const paths = (await readdir(dir)).filter(n => /^frame-\d{2}\.png$/.test(n)).sort();
        if (!paths.length || paths.length > 3) throw Error('invalid_frames');
        const frames = await Promise.all(paths.map(n => readFile(join(dir, n))));
        if (frames.some(b => b.length > 1024 * 1024 || !b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))) throw Error('invalid_frames');
        result = { status: 'effect_observed', operation, frames, provenance: { asset_sha256: assetHash, frame_sha256: frames.map(sha), processed_seconds_limit: 30, content_trust: 'UNTRUSTED_EXTERNAL_CONTENT' } };
      } else {
        const audio = await readFile(join(dir, 'audio.wav'));
        if (audio.length < 44 || audio.length > 1000000 || audio.toString('ascii', 0, 4) !== 'RIFF') throw Error('invalid_audio');
        if (operation === 'audio') result = { status: 'effect_observed', operation, audio, provenance: { asset_sha256: assetHash, audio_sha256: sha(audio) } };
        else {
          const transcript = await this.#transcribe({ audio, mime: 'audio/wav', resource, asset_sha256: assetHash });
          if (!transcript || transcript.verified !== true || typeof transcript.text !== 'string' || !transcript.provider || transcript.audio_sha256 !== sha(audio)) throw Error('transcription_not_verified');
          result = { status: 'effect_observed', operation, text: transcript.text.slice(0, 20000), content_trust: 'UNTRUSTED_EXTERNAL_CONTENT', provenance: { asset_sha256: assetHash, audio_sha256: sha(audio), provider: transcript.provider, transcript_sha256: sha(Buffer.from(transcript.text)) } };
        }
      }
      completed = true;
      try { await this.#audit({ phase: 'media_worker_effect', operation, resource, asset_sha256: assetHash }); }
      catch { return { status: 'effect_observed_audit_failed', operation }; }
      return result;
    } catch { return { status: completed ? 'effect_observed_error' : 'worker_failed', reason: 'bounded_worker_failure' }; }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
}
