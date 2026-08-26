import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { ConnectorError } from "./errors.js";
import type { ConnectorConfig } from "./types.js";

const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const absolutePath = z.string().min(1).refine((value) => isAbsolute(value), "absolute_path_required");
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const rootSchema = z.object({
  id: identifier,
  path: absolutePath,
  access: z.enum(["read", "dev"]),
  trust: z.enum(["VERIFIED_SOURCE", "UNVERIFIED_SOURCE"]),
  postPatchTarget: identifier.optional()
}).strict();
const repositorySchema = z.object({ id: identifier, path: absolutePath, rootId: identifier }).strict();
const serviceSchema = z.object({
  id: identifier,
  kind: z.literal("systemd"),
  unit: z.string().regex(/^[a-zA-Z0-9@_.-]+[.]service$/)
}).strict();
const targetSchema = z.object({
  id: identifier,
  executable: absolutePath,
  args: z.array(z.string().max(500)).max(30),
  cwd: absolutePath,
  timeoutMs: z.number().int().min(100).max(300_000),
  trust: z.enum(["VERIFIED_SOURCE", "UNVERIFIED_SOURCE"]),
  integrityFiles: z.array(z.object({ path: absolutePath, sha256 }).strict()).max(30)
}).strict();
const configSchema = z.object({
  enabled: z.boolean(),
  devEnabled: z.boolean(),
  gitExecutable: absolutePath,
  systemctlExecutable: absolutePath,
  roots: z.array(rootSchema).max(20),
  repositories: z.array(repositorySchema).max(20),
  services: z.array(serviceSchema).max(20),
  testTargets: z.array(targetSchema).max(20),
  limits: z.object({
    maxOutputChars: z.number().int().min(1_000).max(1_000_000),
    maxFileBytes: z.number().int().min(1_000).max(10_000_000),
    maxSearchResults: z.number().int().min(1).max(1_000),
    maxSearchFiles: z.number().int().min(1).max(100_000),
    maxDirectoryEntries: z.number().int().min(1).max(10_000),
    maxPatchBytes: z.number().int().min(1_000).max(1_000_000),
    toolTimeoutMs: z.number().int().min(100).max(300_000),
    rateLimitPerMinute: z.number().int().min(1).max(1_000)
  }).strict()
}).strict();

const allowedTestExecutables = new Set(["/usr/bin/node", "/usr/bin/npm"]);

export const DENY_ALL_CONNECTOR_CONFIG: ConnectorConfig = Object.freeze({
  enabled: false,
  devEnabled: false,
  gitExecutable: "/usr/bin/git",
  systemctlExecutable: "/usr/bin/systemctl",
  roots: [],
  repositories: [],
  services: [],
  testTargets: [],
  limits: {
    maxOutputChars: 50_000,
    maxFileBytes: 1_048_576,
    maxSearchResults: 100,
    maxSearchFiles: 5_000,
    maxDirectoryEntries: 1_000,
    maxPatchBytes: 200_000,
    toolTimeoutMs: 30_000,
    rateLimitPerMinute: 60
  }
});

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`duplicate_${label}`);
}

export function parseConnectorConfig(value: unknown): ConnectorConfig {
  const config = configSchema.parse(value) as ConnectorConfig;
  assertUnique(config.roots.map((item) => item.id), "root_id");
  assertUnique(config.repositories.map((item) => item.id), "repository_id");
  assertUnique(config.services.map((item) => item.id), "service_id");
  assertUnique(config.testTargets.map((item) => item.id), "test_target_id");
  const roots = new Map(config.roots.map((root) => [root.id, root]));
  const targets = new Set(config.testTargets.map((target) => target.id));
  for (const root of config.roots) {
    root.path = resolve(root.path);
    if (root.postPatchTarget && !targets.has(root.postPatchTarget)) {
      throw new Error(`unknown_post_patch_target:${root.id}`);
    }
  }
  for (const repository of config.repositories) {
    repository.path = resolve(repository.path);
    const root = roots.get(repository.rootId);
    if (!root || root.path !== repository.path) throw new Error(`repository_root_mismatch:${repository.id}`);
  }
  for (const target of config.testTargets) {
    target.cwd = resolve(target.cwd);
    if (!allowedTestExecutables.has(target.executable)) {
      throw new Error(`test_executable_not_allowed:${target.id}`);
    }
  }
  if (config.gitExecutable !== "/usr/bin/git") throw new Error("git_executable_not_allowed");
  if (config.systemctlExecutable !== "/usr/bin/systemctl") throw new Error("systemctl_executable_not_allowed");
  return config;
}

export function loadConnectorConfig(configPath: string | undefined): ConnectorConfig {
  if (!configPath || configPath.trim() === "") return DENY_ALL_CONNECTOR_CONFIG;
  try {
    const raw = readFileSync(resolve(configPath), "utf8");
    return parseConnectorConfig(JSON.parse(raw) as unknown);
  } catch {
    throw new ConnectorError("connector_config_invalid", "Connector configuration is invalid.", "INVALID");
  }
}
