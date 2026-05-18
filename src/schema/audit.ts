export type AuditEvent = {
  id: string;
  timestamp: string;
  actor: "mcp" | "user" | "agent" | "system";
  action: string;
  tool?: string;
  mode: string;
  backend: string;
  result: "allowed" | "blocked" | "error";
  details?: Record<string, unknown>;
};
