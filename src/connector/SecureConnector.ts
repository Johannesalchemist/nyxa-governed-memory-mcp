import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, opendir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { hostname, loadavg, platform, release, totalmem, freemem, uptime } from "node:os";
import { ConnectorError } from "./errors.js";
import { isBlockedEntryName, PathGuard, validateGitBase } from "./pathGuard.js";
import { runFixedProcess, type ProcessResult } from "./processRunner.js";
import { sanitizeText } from "./redaction.js";
import type {
  ConnectorConfig,
  ConnectorRepository,
  ConnectorResult,
  ConnectorRoot,
  ConnectorTestTarget,
  EvidenceTrust
} from "./types.js";

type ListedEntry = { name: string; type: "file" | "directory"; size?: number };
type SearchMatch = { path: string; line: number; text: string; trust: EvidenceTrust };

function supportedResult<T extends Record<string, unknown>>(
  capability: "I0" | "I1",
  resourceId: string,
  implementation: string,
  claim: string,
  trust: EvidenceTrust,
  data: T,
  options: { truncated?: boolean; redactions?: number; observations?: string[] } = {}
): ConnectorResult<T> {
  return {
    policy_decision: "ALLOWED",
    capability_class: capability,
    resource_id: resourceId,
    evidence: {
      claim,
      implementation,
      status: "SUPPORTED",
      trust,
      observations: options.observations ?? [],
      gamma: "SUPPORTED"
    },
    data,
    truncated: options.truncated ?? false,
    redactions_applied: options.redactions ?? 0
  };
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensureConnectorEnabled(config: ConnectorConfig): void {
  if (!config.enabled) throw new ConnectorError("connector_disabled", "Connector is disabled by default.");
}

function mapById<T extends { id: string }>(items: T[], id: string, code: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new ConnectorError(code, "Resource is not allowlisted.", "UNKNOWN");
  return item;
}

export class SecureConnector {
  private readonly guard: PathGuard;

  public constructor(
    private readonly config: ConnectorConfig,
    private readonly dataDir: string
  ) {
    this.guard = new PathGuard(config);
  }

  public async systemStatus(): Promise<ConnectorResult> {
    ensureConnectorEnabled(this.config);
    const services: Array<{ id: string; active: boolean; state: string }> = [];
    for (const service of this.config.services) {
      const result = await runFixedProcess({
        executable: this.config.systemctlExecutable,
        args: ["is-active", service.unit],
        cwd: "/",
        timeoutMs: Math.min(this.config.limits.toolTimeoutMs, 5_000),
        maxOutputChars: 2_000
      });
      services.push({
        id: service.id,
        active: result.exitCode === 0 && result.stdout.trim() === "active",
        state: result.stdout.trim() || "unknown"
      });
    }
    const roots = await Promise.all(this.config.roots.map(async (root) => {
      try {
        await this.guard.resolveExisting(`${root.id}:/`);
        return { id: root.id, accessible: true, access: root.access, trust: root.trust };
      } catch {
        return { id: root.id, accessible: false, access: root.access, trust: root.trust };
      }
    }));
    return supportedResult("I0", "host", "node:os + fixed systemctl adapter", "Read minimized host and service status", "VERIFIED_SOURCE", {
      host: {
        hostname: hostname(),
        platform: platform(),
        release: release(),
        uptime_seconds: Math.floor(uptime()),
        load_average: loadavg(),
        memory_total_bytes: totalmem(),
        memory_free_bytes: freemem()
      },
      services,
      roots,
      containers: "not_available_without_privileged_docker_socket"
    });
  }

  public async list(virtualPath: string): Promise<ConnectorResult<{ entries: ListedEntry[] }>> {
    ensureConnectorEnabled(this.config);
    const guarded = await this.guard.resolveExisting(virtualPath);
    const info = await lstat(guarded.absolutePath);
    if (!info.isDirectory()) throw new ConnectorError("not_a_directory", "Target is not a directory.", "INVALID");
    const entries: ListedEntry[] = [];
    const directory = await opendir(guarded.absolutePath);
    let truncated = false;
    try {
      for await (const entry of directory) {
        if (isBlockedEntryName(entry.name) || entry.isSymbolicLink()) continue;
        if (entries.length >= this.config.limits.maxDirectoryEntries) {
          truncated = true;
          break;
        }
        if (entry.isDirectory()) entries.push({ name: entry.name, type: "directory" });
        else if (entry.isFile()) {
          const fileInfo = await lstat(join(guarded.absolutePath, entry.name));
          entries.push({ name: entry.name, type: "file", size: fileInfo.size });
        }
      }
    } finally {
      await directory.close().catch(() => undefined);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return supportedResult("I0", virtualPath, "PathGuard.list", "List one allowlisted directory", guarded.root.trust, { entries }, { truncated });
  }

  public async readFile(
    virtualPath: string,
    startLine?: number,
    endLine?: number
  ): Promise<ConnectorResult<{ text: string; start_line: number; end_line: number }>> {
    ensureConnectorEnabled(this.config);
    const file = await this.guard.readTextFile(virtualPath, this.config.limits.maxFileBytes);
    const lines = file.text.split(/\r?\n/);
    const start = startLine ?? 1;
    const end = endLine ?? Math.min(lines.length, start + 4_999);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start > 4_999) {
      throw new ConnectorError("line_range_invalid", "Line range is invalid.", "INVALID");
    }
    const selected = lines.slice(start - 1, Math.min(end, lines.length)).join("\n");
    const sanitized = sanitizeText(selected, this.config.limits.maxOutputChars);
    return supportedResult(
      "I0",
      virtualPath,
      "PathGuard.readTextFile",
      "Read an allowlisted text file",
      file.path.root.trust,
      { text: sanitized.text, start_line: start, end_line: Math.min(end, lines.length) },
      { truncated: sanitized.truncated, redactions: sanitized.redactions }
    );
  }

  public async search(
    query: string,
    virtualPath?: string,
    requestedMaxResults?: number
  ): Promise<ConnectorResult<{ matches: SearchMatch[]; files_scanned: number }>> {
    ensureConnectorEnabled(this.config);
    if (query.length < 1 || query.length > 500 || query.includes("\0")) {
      throw new ConnectorError("search_query_invalid", "Search query is invalid.", "INVALID");
    }
    const maxResults = Math.min(
      Math.max(requestedMaxResults ?? 50, 1),
      this.config.limits.maxSearchResults
    );
    const starts = virtualPath
      ? [await this.guard.resolveExisting(virtualPath)]
      : await Promise.all(this.config.roots.map((root) => this.guard.resolveExisting(`${root.id}:/`)));
    const matches: SearchMatch[] = [];
    let filesScanned = 0;
    let truncated = false;
    let redactions = 0;

    const scanDirectory = async (root: ConnectorRoot, rootPath: string, directoryPath: string): Promise<void> => {
      if (matches.length >= maxResults || filesScanned >= this.config.limits.maxSearchFiles) {
        truncated = true;
        return;
      }
      const directory = await opendir(directoryPath);
      try {
        for await (const entry of directory) {
          if (matches.length >= maxResults || filesScanned >= this.config.limits.maxSearchFiles) {
            truncated = true;
            break;
          }
          if (entry.isSymbolicLink() || isBlockedEntryName(entry.name)) continue;
          const absolute = join(directoryPath, entry.name);
          if (entry.isDirectory()) {
            await scanDirectory(root, rootPath, absolute);
            continue;
          }
          if (!entry.isFile()) continue;
          filesScanned += 1;
          const rel = relative(rootPath, absolute).split(sep).join("/");
          try {
            const file = await this.guard.readTextFile(`${root.id}:/${rel}`, this.config.limits.maxFileBytes);
            const lines = file.text.split(/\r?\n/);
            for (let index = 0; index < lines.length; index += 1) {
              if (!lines[index]!.includes(query)) continue;
              const sanitized = sanitizeText(lines[index]!, 1_000);
              redactions += sanitized.redactions;
              matches.push({ path: `${root.id}:/${rel}`, line: index + 1, text: sanitized.text, trust: root.trust });
              if (matches.length >= maxResults) {
                truncated = true;
                break;
              }
            }
          } catch {
            // Blocked, binary, oversized and concurrently changed files are skipped safely.
          }
        }
      } finally {
        await directory.close().catch(() => undefined);
      }
    };

    for (const start of starts) {
      const info = await lstat(start.absolutePath);
      if (info.isDirectory()) await scanDirectory(start.root, start.rootRealPath, start.absolutePath);
      else {
        filesScanned += 1;
        const file = await this.guard.readTextFile(virtualPath!, this.config.limits.maxFileBytes);
        const lines = file.text.split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < maxResults; index += 1) {
          if (!lines[index]!.includes(query)) continue;
          const sanitized = sanitizeText(lines[index]!, 1_000);
          redactions += sanitized.redactions;
          matches.push({ path: virtualPath!, line: index + 1, text: sanitized.text, trust: start.root.trust });
        }
      }
    }
    const trust = starts.some((start) => start.root.trust === "UNVERIFIED_SOURCE") ? "UNVERIFIED_SOURCE" : "VERIFIED_SOURCE";
    return supportedResult("I0", virtualPath ?? "all-approved-roots", "PathGuard.literalSearch", "Literal search in approved roots", trust, {
      matches,
      files_scanned: filesScanned
    }, { truncated, redactions });
  }

  public async gitStatus(repositoryId: string): Promise<ConnectorResult> {
    return await this.gitCommand(repositoryId, "status", undefined);
  }

  public async gitDiff(repositoryId: string, base?: string): Promise<ConnectorResult> {
    return await this.gitCommand(repositoryId, "diff", validateGitBase(base));
  }

  private async gitCommand(repositoryId: string, operation: "status" | "diff", base?: string): Promise<ConnectorResult> {
    ensureConnectorEnabled(this.config);
    const repository = mapById(this.config.repositories, repositoryId, "repository_not_allowed");
    const root = this.guard.getRoot(repository.rootId);
    const common = ["-c", `safe.directory=${repository.path}`, "-c", "core.pager=cat", "-c", "color.ui=false"];
    const args = operation === "status"
      ? [...common, "status", "--short", "--branch", "--untracked-files=all"]
      : [...common, "diff", "--no-ext-diff", "--no-textconv", ...(base ? [base] : []), "--"];
    const result = await runFixedProcess({
      executable: this.config.gitExecutable,
      args,
      cwd: repository.path,
      timeoutMs: this.config.limits.toolTimeoutMs,
      maxOutputChars: this.config.limits.maxOutputChars
    });
    if (result.exitCode !== 0) throw new ConnectorError("git_read_failed", "Git read operation failed.", "INVALID");
    return supportedResult("I0", repository.id, `fixed git ${operation}`, `Read Git ${operation}`, root.trust, {
      output: result.stdout,
      base: base ?? null
    }, { truncated: result.truncated, redactions: result.redactions });
  }

  public async logs(serviceId: string, _lines: number): Promise<ConnectorResult> {
    ensureConnectorEnabled(this.config);
    void serviceId;
    throw new ConnectorError("log_source_not_allowed", "No general log source is approved. Use audit.trace for L1.", "UNKNOWN");
  }

  public async runTest(targetId: string): Promise<ConnectorResult> {
    ensureConnectorEnabled(this.config);
    if (!this.config.devEnabled) throw new ConnectorError("dev_mode_disabled", "Development capabilities are disabled.");
    const target = mapById(this.config.testTargets, targetId, "test_target_not_allowed");
    await this.verifyTargetIntegrity(target);
    const result = await runFixedProcess({
      executable: target.executable,
      args: target.args,
      cwd: target.cwd,
      timeoutMs: target.timeoutMs,
      maxOutputChars: this.config.limits.maxOutputChars
    });
    const passed = result.exitCode === 0 && !result.timedOut;
    if (!passed) throw new ConnectorError(result.timedOut ? "test_timeout" : "test_failed", "Approved test target failed.", "INVALID");
    return supportedResult("I1", target.id, "fixed test target adapter", "Run an approved deterministic test target", target.trust, {
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    }, { truncated: result.truncated, redactions: result.redactions });
  }

  private async verifyTargetIntegrity(target: ConnectorTestTarget): Promise<void> {
    for (const expected of target.integrityFiles) {
      const data = await readFile(expected.path);
      if (sha256(data) !== expected.sha256) {
        throw new ConnectorError("test_integrity_mismatch", "Approved test source changed since review.");
      }
    }
  }

  public async applyPatch(virtualPath: string, patch: string): Promise<ConnectorResult> {
    ensureConnectorEnabled(this.config);
    if (!this.config.devEnabled) throw new ConnectorError("dev_mode_disabled", "Development capabilities are disabled.");
    if (Buffer.byteLength(patch, "utf8") > this.config.limits.maxPatchBytes || patch.includes("\0")) {
      throw new ConnectorError("patch_invalid", "Patch is malformed or oversized.", "INVALID");
    }
    const target = await this.guard.resolveDevTarget(virtualPath);
    this.validateSingleFilePatch(patch, target.relativePath);
    const repository = this.config.repositories.find((candidate) => candidate.path === target.rootRealPath);
    if (!repository) throw new ConnectorError("dev_repository_not_allowed", "Development root is not an approved repository.");
    const beforeStatus = await this.runGit(repository, ["status", "--porcelain=v1", "--untracked-files=all", "--", target.relativePath]);
    if (beforeStatus.exitCode !== 0) throw new ConnectorError("git_status_failed", "Could not verify target state.", "INVALID");

    let existed = true;
    let original = Buffer.alloc(0);
    let originalMode = 0o600;
    try {
      const originalInfo = await lstat(target.absolutePath);
      originalMode = originalInfo.mode & 0o777;
      original = await readFile(target.absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") existed = false;
      else throw new ConnectorError("snapshot_failed", "Could not create pre-change snapshot.", "INVALID");
    }
    const backupDir = join(this.dataDir, "backups");
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backupId = `${Date.now()}-${randomUUID()}`;
    const backupPath = join(backupDir, `${backupId}.before`);
    await writeFile(backupPath, original, { flag: "wx", mode: 0o600 });

    const check = await this.runGit(repository, ["apply", "--check", "--recount", "--whitespace=error-all", "-"], patch);
    if (check.exitCode !== 0) throw new ConnectorError("patch_check_failed", "Patch failed deterministic preflight.", "INVALID");
    const applied = await this.runGit(repository, ["apply", "--recount", "--whitespace=error-all", "-"], patch);
    if (applied.exitCode !== 0) throw new ConnectorError("patch_apply_failed", "Patch could not be applied.", "INVALID");

    try {
      const postTarget = target.root.postPatchTarget;
      if (!postTarget) throw new ConnectorError("post_patch_test_missing", "Development root has no approved post-patch test.", "INVALID");
      await this.runTest(postTarget);
    } catch (error) {
      await this.rollbackFile(target.absolutePath, original, existed, originalMode);
      throw error;
    }

    const diff = await this.runGit(repository, ["diff", "--no-ext-diff", "--no-textconv", "--", target.relativePath]);
    if (diff.exitCode !== 0) {
      await this.rollbackFile(target.absolutePath, original, existed, originalMode);
      throw new ConnectorError("post_patch_diff_failed", "Could not verify post-patch diff.", "INVALID");
    }
    return supportedResult("I1", virtualPath, "single-file git apply adapter", "Apply one reversible patch in the development root", target.root.trust, {
      backup_id: backupId,
      previous_sha256: sha256(original),
      target_existed: existed,
      diff: diff.stdout,
      preexisting_target_state: beforeStatus.stdout
    }, { truncated: diff.truncated, redactions: diff.redactions });
  }

  private validateSingleFilePatch(patch: string, relativePath: string): void {
    const diffHeaders = [...patch.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
    const oldHeaders = [...patch.matchAll(/^--- (.+)$/gm)];
    const newHeaders = [...patch.matchAll(/^\+\+\+ (.+)$/gm)];
    if (diffHeaders.length !== 1 || oldHeaders.length !== 1 || newHeaders.length !== 1) {
      throw new ConnectorError("patch_scope_invalid", "Patch must affect exactly one file.", "INVALID");
    }
    const diffOld = diffHeaders[0]![1];
    const diffNew = diffHeaders[0]![2];
    const oldPath = oldHeaders[0]![1];
    const newPath = newHeaders[0]![1];
    const oldValid = oldPath === `a/${relativePath}` || oldPath === "/dev/null";
    if (diffOld !== relativePath || diffNew !== relativePath || !oldValid || newPath !== `b/${relativePath}`) {
      throw new ConnectorError("patch_target_mismatch", "Patch headers do not match the approved target.", "INVALID");
    }
    if (/^(?:rename from|rename to|deleted file mode|GIT binary patch|Binary files )/m.test(patch)) {
      throw new ConnectorError("patch_operation_denied", "Rename, deletion and binary patches are denied.");
    }
  }

  private async runGit(repository: ConnectorRepository, args: string[], stdin?: string): Promise<ProcessResult> {
    return await runFixedProcess({
      executable: this.config.gitExecutable,
      args: ["-c", `safe.directory=${repository.path}`, "-c", "core.pager=cat", "-c", "color.ui=false", ...args],
      cwd: repository.path,
      timeoutMs: this.config.limits.toolTimeoutMs,
      maxOutputChars: this.config.limits.maxOutputChars,
      stdin
    });
  }

  private async rollbackFile(path: string, original: Buffer, existed: boolean, originalMode: number): Promise<void> {
    try {
      const info = await lstat(path).catch(() => undefined);
      if (info?.isSymbolicLink()) throw new Error("symlink");
      if (info) await unlink(path);
      if (existed) {
        const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
        await writeFile(path, original, { flag: flags, mode: originalMode });
      }
    } catch {
      throw new ConnectorError("rollback_failed", "Rollback failed; development tree requires manual review.", "INVALID");
    }
  }
}
