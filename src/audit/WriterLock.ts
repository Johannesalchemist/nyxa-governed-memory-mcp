import { createServer, createConnection, type Server } from "node:net";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Process-lifetime, per-data-directory single-writer exclusion.
 *
 * Backed by an exclusive bind on a Unix domain socket at <dataDir>/.writer.lock.sock,
 * deliberately NOT a PID file. A PID file's only staleness signal is "does a process
 * with this PID number currently exist", which is genuinely ambiguous under PID
 * reuse -- a long-running host can and does recycle PIDs, so that check can silently
 * misidentify an unrelated new process as the still-live lock owner. A listening Unix
 * socket has no such ambiguity: the OS itself tears down the listening file
 * descriptor the instant the owning process exits for ANY reason (normal exit,
 * SIGTERM, SIGKILL, crash), so "is anything actually listening right now" is a real,
 * current kernel-enforced fact, never a stale record this code has to interpret.
 *
 * A leftover socket FILE can still exist on disk after an unclean shutdown (the OS
 * frees the listening fd, but does not unlink the path), which is why acquire() still
 * has to probe: a failed bind (EADDRINUSE) is followed by a real connection attempt to
 * that same path. A successful connect proves a live owner (fail closed, no retry). A
 * failed connect proves the file is a stale leftover (safe to unlink and retry the
 * bind exactly once); if that retry still loses, a genuine concurrent acquirer won the
 * race, and this process correctly fails closed too rather than looping or guessing.
 *
 * Independent per data directory by construction (the socket path is derived from
 * dataDir), so two processes using different NYXA_DATA_DIR values never contend.
 */
export class WriterLockError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WriterLockError";
  }
}

export class WriterLock {
  private readonly sockPath: string;
  private server: Server | null = null;

  public constructor(dataDir: string) {
    this.sockPath = join(dataDir, ".writer.lock.sock");
  }

  public async acquire(): Promise<void> {
    try {
      await this.bind();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    }

    const liveOwnerPresent = await this.probeLive();
    if (liveOwnerPresent) {
      throw new WriterLockError(
        `writer_lock_held: another process already holds the audit writer lock for this data directory (${this.sockPath})`
      );
    }

    await unlink(this.sockPath).catch(() => {});
    try {
      await this.bind();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        throw new WriterLockError(
          `writer_lock_held: lost a race to reclaim a stale lock for this data directory (${this.sockPath})`
        );
      }
      throw error;
    }
  }

  public async release(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(this.sockPath).catch(() => {});
  }

  private bind(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      const onError = (error: Error) => {
        server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        this.server = server;
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.sockPath);
    });
  }

  private probeLive(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection(this.sockPath);
      const finish = (result: boolean) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(result);
      };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
    });
  }
}
