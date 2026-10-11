import { lstat, realpath, writeFile, readFile, mkdir, unlink, rmdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** A pre-created private directory, selected by the trusted server configuration. */
export class FileOAuthStateStore {
  #directory;
  constructor(directory) {
    if (!isAbsolute(directory)) throw Error('absolute_private_state_directory_required');
    this.#directory = directory;
  }
  async #root() {
    const s = await lstat(this.#directory);
    if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0 || await realpath(this.#directory) !== this.#directory) throw Error('unsafe_state_directory');
    return this.#directory;
  }
  async put(record) {
    if (!/^[a-f0-9]{64}$/.test(record?.stateHash ?? '') || typeof record.principal !== 'string' || !record.principal || !Number.isFinite(record.expiresAt)) throw Error('invalid_state_record');
    const root = await this.#root();
    await writeFile(join(root, `${record.stateHash}.json`), JSON.stringify(record), { flag: 'wx', mode: 0o600 });
  }
  async consume(hash, principal, now) {
    if (!/^[a-f0-9]{64}$/.test(hash) || typeof principal !== 'string' || !principal || !Number.isFinite(now)) return null;
    const root = await this.#root(), lock = join(root, `${hash}.lock`), path = join(root, `${hash}.json`);
    try { await mkdir(lock, { mode: 0o700 }); } catch (e) { if (e.code === 'EEXIST') return null; throw e; }
    try {
      const s = await lstat(path);
      if (!s.isFile() || s.isSymbolicLink() || s.size > 8192 || (s.mode & 0o077) !== 0) throw Error('unsafe_state_record');
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (record.stateHash !== hash || record.principal !== principal || !Number.isFinite(record.expiresAt)) return null;
      await unlink(path); // Single-use claim occurs BEFORE token exchange, never afterwards.
      if (record.expiresAt <= now) return null;
      return record;
    } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    finally { await rmdir(lock); }
  }
}
