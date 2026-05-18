import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/env.js";
import { ensureDir } from "./utils/ensureDir.js";
import { safeJsonStringify } from "./utils/safeJson.js";
import { AuditLog } from "./audit/AuditLog.js";
import { enforcePolicy } from "./policy/enforcePolicy.js";
import { LocalBackend } from "./backend/LocalBackend.js";
import { RemoteBackendStub } from "./backend/RemoteBackend.js";
import { buildSystemStatus, SYSTEM_STATUS_TOOL_ANNOTATIONS } from "./tools/system.status.js";
import { buildPolicyMode, POLICY_MODE_TOOL_ANNOTATIONS } from "./tools/policy.mode.js";
import { AUDIT_TRACE_TOOL_ANNOTATIONS, buildAuditTrace, normalizeAuditTraceLimit } from "./tools/audit.trace.js";
function toolJsonResult(payload) {
    return {
        content: [
            {
                type: "text",
                text: safeJsonStringify(payload, 2)
            }
        ]
    };
}
function extractLimit(extra) {
    if (!extra || typeof extra !== "object") {
        return undefined;
    }
    const request = extra.request;
    const args = request?.params?.arguments;
    if (!args || typeof args !== "object") {
        return undefined;
    }
    const raw = args.limit;
    return typeof raw === "number" ? raw : undefined;
}
export class NyxaGovernedMemoryServer {
    config;
    auditLog;
    backend;
    server;
    constructor() {
        this.config = loadConfig();
        this.auditLog = new AuditLog(this.config.dataDir);
        this.backend = this.createBackend(this.config);
        this.server = new McpServer({
            name: this.config.appName,
            version: this.config.version
        });
    }
    async start() {
        await ensureDir(this.config.dataDir);
        await this.auditLog.init();
        this.registerTools();
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
    createBackend(config) {
        if (config.memoryBackend === "local") {
            return new LocalBackend(config.dataDir);
        }
        return new RemoteBackendStub(config.memoryBackend);
    }
    registerTools() {
        this.server.tool("system.status", "Returns MCP status and feature flags.", SYSTEM_STATUS_TOOL_ANNOTATIONS, async () => this.runTool("system.status", {}, async () => {
            const backendInfo = await this.backend.health();
            return {
                ...buildSystemStatus(this.config),
                backend_status: backendInfo.status
            };
        }));
        this.server.tool("policy.mode", "Returns current policy mode with allowed and blocked capabilities.", POLICY_MODE_TOOL_ANNOTATIONS, async () => this.runTool("policy.mode", {}, async () => buildPolicyMode(this.config)));
        this.server.tool("audit.trace", "Returns recent audit events.", AUDIT_TRACE_TOOL_ANNOTATIONS, async (_input, extra) => {
            const input = { limit: extractLimit(extra) };
            const decision = enforcePolicy("audit.trace", this.config.agentMode);
            if (!decision.allowed) {
                await this.audit("blocked", "audit.trace", {
                    reason: decision.reason,
                    input
                });
                return toolJsonResult({
                    error: "policy_blocked",
                    reason: decision.reason,
                    tool: "audit.trace"
                });
            }
            // Deterministic audit trace behavior: write self-event first, then read.
            await this.audit("allowed", "audit.trace", { input });
            const limit = normalizeAuditTraceLimit(input);
            const events = await this.auditLog.recent(limit);
            return toolJsonResult(buildAuditTrace(events));
        });
    }
    async runTool(toolName, input, action) {
        const policyDecision = enforcePolicy(toolName, this.config.agentMode);
        if (!policyDecision.allowed) {
            await this.audit("blocked", toolName, {
                reason: policyDecision.reason,
                input
            });
            return toolJsonResult({
                error: "policy_blocked",
                reason: policyDecision.reason,
                tool: toolName
            });
        }
        try {
            const payload = await action();
            await this.audit("allowed", toolName, { input });
            return toolJsonResult(payload);
        }
        catch {
            await this.audit("error", toolName, { input });
            return toolJsonResult({
                error: "internal_error",
                tool: toolName
            });
        }
    }
    async audit(result, toolName, details) {
        const event = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            actor: "mcp",
            action: "tool.call",
            tool: toolName,
            mode: this.config.agentMode,
            backend: this.config.memoryBackend,
            result
        };
        if (details) {
            event.details = details;
        }
        await this.auditLog.append(event);
    }
}
