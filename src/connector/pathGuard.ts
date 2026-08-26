import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ConnectorError } from "./errors.js";
import type { ConnectorConfig, ConnectorRoot } from "./types.js";

const blockedExactSegments = new Set([
  ".git", ".ssh", "node_modules", "dist", "data", "logs", "coverage", "__pycache__"
]);
const blockedFilePatterns: RegExp[] = [
  /^\.env(?:\.|$)/i,
  /^(?:id_rsa|id_ed25519|authorized_keys|known_hosts)$/i,
  /(?:^|[._-])(?:secret|credential|private[_-]?key)(?:[._-]|$)/i,
  /\.(?:key|pem|p12|pfx|jks|keystore|sqlite|sqlite3|db|db-wal|db-shm)$/i
];
const protectedDevPrefixes = [
  ".git/", "config/", "scripts/", "src/audit/", "src/config/", "src/connector/", "src/policy/",
  "src/schema/audit.ts", "src/server.ts", "package.json", "package-lock.json", "tsconfig.json", ".env", ".gitignore"
];

export type GuardedPath = {
  root: ConnectorRoot;
  rootRealPath: string;
  absolutePath: string;
  relativePath: string;
};

function splitVirtualPath(value: string): { rootId: string; relativePath: string } {
  if (value.includes("\0") || value.includes("\\")) throw new ConnectorError("path_invalid", "Path is invalid.", "INVALID");
  const match = /^([a-z][a-z0-9_-]{0,63}):\/(.*)$/i.exec(value);
  if (!match) throw new ConnectorError("path_invalid", "Use root-id:/relative/path.", "INVALID");
  const relativePath = match[2] ?? "";
  if (isAbsolute(relativePath) || relativePath.split("/").some((segment) => segment === "..")) {
    throw new ConnectorError("path_traversal_denied", "Path traversal is denied.");
  }
  return { rootId: match[1]!, relativePath };
}

function assertAllowedSegments(relativePath: string): void {
  for (const segment of relativePath.split("/").filter(Boolean)) {
    const normalized = segment.toLowerCase();
    if (blockedExactSegments.has(normalized) || normalized.startsWith(".backup") || normalized === "backups") {
      throw new ConnectorError("path_blocked", "Path is blocked by policy.");
    }
    if (blockedFilePatterns.some((pattern) => pattern.test(segment))) {
      throw new ConnectorError("secret_path_denied", "Secret and credential paths are denied.");
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export class PathGuard {
  private readonly roots: ReadonlyMap<string, ConnectorRoot>;
  public constructor(private readonly config: ConnectorConfig) {
    this.roots = new Map(config.roots.map((root) => [root.id, root]));
  }
  public getRoot(rootId: string): ConnectorRoot {
    const root = this.roots.get(rootId);
    if (!root) throw new ConnectorError("root_not_allowed", "Root is not allowlisted.", "UNKNOWN");
    return root;
  }
  public async resolveExisting(virtualPath: string): Promise<GuardedPath> {
    const parsed = splitVirtualPath(virtualPath);
    const root = this.getRoot(parsed.rootId);
    assertAllowedSegments(parsed.relativePath);
    const rootRealPath = await realpath(root.path);
    const candidate = resolve(rootRealPath, parsed.relativePath);
    if (!isWithin(rootRealPath, candidate)) throw new ConnectorError("path_escape_denied", "Path escaped its allowlisted root.");
    const candidateRealPath = await realpath(candidate);
    if (!isWithin(rootRealPath, candidateRealPath)) throw new ConnectorError("symlink_escape_denied", "Symlink escape is denied.");
    return {
      root,
      rootRealPath,
      absolutePath: candidateRealPath,
      relativePath: relative(rootRealPath, candidateRealPath).split(sep).join("/")
    };
  }
  public async resolveDevTarget(virtualPath: string): Promise<GuardedPath> {
    const parsed = splitVirtualPath(virtualPath);
    const root = this.getRoot(parsed.rootId);
    if (root.access !== "dev" || !this.config.devEnabled) {
      throw new ConnectorError("write_not_allowed", "Writes are allowed only in the approved development root.");
    }
    if (parsed.relativePath === "") throw new ConnectorError("write_target_invalid", "A file target is required.", "INVALID");
    assertAllowedSegments(parsed.relativePath);
    const normalized = parsed.relativePath.replace(/^\.\//, "");
    if (protectedDevPrefixes.some((prefix) => normalized === prefix.replace(/\/$/, "") || normalized.startsWith(prefix))) {
      throw new ConnectorError("control_plane_write_denied", "Connector and governance control-plane files are protected.");
    }
    const rootRealPath = await realpath(root.path);
    const absolutePath = resolve(rootRealPath, normalized);
    if (!isWithin(rootRealPath, absolutePath)) throw new ConnectorError("path_escape_denied", "Path escaped its allowlisted root.");
    const parentRealPath = await realpath(resolve(absolutePath, ".."));
    if (!isWithin(rootRealPath, parentRealPath)) throw new ConnectorError("symlink_escape_denied", "Symlink escape is denied.");
    try {
      const existingRealPath = await realpath(absolutePath);
      if (!isWithin(rootRealPath, existingRealPath)) throw new ConnectorError("symlink_escape_denied", "Symlink escape is denied.");
      const info = await lstat(existingRealPath);
      if (!info.isFile() || info.isSymbolicLink()) throw new ConnectorError("write_target_invalid", "Write target must be a regular file.");
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new ConnectorError("write_target_invalid", "Write target is invalid.");
      }
    }
    return { root, rootRealPath, absolutePath, relativePath: normalized };
  }
  public async readTextFile(virtualPath: string, maxBytes: number): Promise<{ path: GuardedPath; text: string }> {
    const guarded = await this.resolveExisting(virtualPath);
    const noFollow = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    let handle;
    try {
      handle = await open(guarded.absolutePath, noFollow);
      const info = await handle.stat();
      if (!info.isFile()) throw new ConnectorError("not_a_file", "Target is not a regular file.");
      if (info.size > maxBytes) throw new ConnectorError("file_too_large", "File exceeds the configured size limit.");
      const data = await handle.readFile();
      if (data.includes(0)) throw new ConnectorError("binary_file_denied", "Binary files are denied.");
      return { path: guarded, text: data.toString("utf8") };
    } finally {
      await handle?.close();
    }
  }
}

export function validateGitBase(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!/^(?!-)(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(value)) {
    throw new ConnectorError("git_base_invalid", "Git base reference is invalid.", "INVALID");
  }
  return value;
}

export function isBlockedEntryName(name: string): boolean {
  try {
    assertAllowedSegments(name);
    return false;
  } catch {
    return true;
  }
}
