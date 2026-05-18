import { resolve } from "node:path";
import { isNyxaAgentMode, type NyxaAgentMode } from "../policy/modes.js";
import type { MemoryBackendType } from "../backend/MemoryBackend.js";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return defaultValue;
}

function parseMode(value: string | undefined): NyxaAgentMode {
  const fallback: NyxaAgentMode = "observe_only";
  if (!value) {
    return fallback;
  }

  if (!isNyxaAgentMode(value)) {
    throw new Error(`invalid_agent_mode:${value}`);
  }

  if (value === "supervised_execute") {
    throw new Error("supervised_execute_not_allowed_in_v01");
  }

  return value;
}

function parseBackend(value: string | undefined): MemoryBackendType {
  const fallback: MemoryBackendType = "local";
  if (!value) {
    return fallback;
  }

  const normalized = value.trim() as MemoryBackendType;
  const allowed: MemoryBackendType[] = ["local", "remote", "dedicated_node", "customer_owned"];
  if (!allowed.includes(normalized)) {
    throw new Error(`invalid_memory_backend:${value}`);
  }

  return normalized;
}

export type NyxaConfig = {
  appName: "nyxa-governed-memory-mcp";
  version: "0.1.0";
  agentMode: NyxaAgentMode;
  memoryBackend: MemoryBackendType;
  dataDir: string;
  featureFlags: {
    dreamingEnabled: boolean;
    apprenticeEnabled: boolean;
    visualObservationEnabled: boolean;
    draftsEnabled: boolean;
    authoritativeWritesEnabled: boolean;
    executionToolsEnabled: boolean;
  };
  remoteMemory: {
    url: string;
    token: string;
  };
};

export function loadConfig(): NyxaConfig {
  const agentMode = parseMode(process.env.NYXA_AGENT_MODE);
  const memoryBackend = parseBackend(process.env.NYXA_MEMORY_BACKEND);
  const dataDir = resolve(process.cwd(), process.env.NYXA_DATA_DIR ?? "./data");

  const featureFlags = {
    dreamingEnabled: parseBoolean(process.env.NYXA_DREAMING_ENABLED, false),
    apprenticeEnabled: parseBoolean(process.env.NYXA_APPRENTICE_ENABLED, true),
    visualObservationEnabled: parseBoolean(process.env.NYXA_VISUAL_OBSERVATION_ENABLED, false),
    draftsEnabled: parseBoolean(process.env.NYXA_DRAFTS_ENABLED, false),
    authoritativeWritesEnabled: parseBoolean(process.env.NYXA_AUTHORITATIVE_WRITES_ENABLED, false),
    executionToolsEnabled: parseBoolean(process.env.NYXA_EXECUTION_TOOLS_ENABLED, false)
  };

  if (featureFlags.authoritativeWritesEnabled) {
    throw new Error("authoritative_writes_must_be_disabled_in_v01");
  }

  if (featureFlags.executionToolsEnabled) {
    throw new Error("execution_tools_must_be_disabled_in_v01");
  }

  return {
    appName: "nyxa-governed-memory-mcp",
    version: "0.1.0",
    agentMode,
    memoryBackend,
    dataDir,
    featureFlags,
    remoteMemory: {
      url: process.env.NYXA_REMOTE_MEMORY_URL ?? "",
      token: process.env.NYXA_REMOTE_MEMORY_TOKEN ?? ""
    }
  };
}
