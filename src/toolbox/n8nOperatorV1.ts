/** NYXA n8n Operator V1. No secret material may enter audit output. */
export type N8nAction = "list_workflows" | "get_workflow" | "create_workflow" | "update_workflow" | "activate_workflow" | "deactivate_workflow" | "delete_workflow" | "list_executions" | "get_execution";
export type N8nRequest = { action: N8nAction; id?: string; body?: Record<string, unknown> };
export type N8nAuthorization = { action: N8nAction; target: string; expiresAt: number; nonce: string; approved: boolean };
const readActions = new Set<N8nAction>(["list_workflows", "get_workflow", "list_executions", "get_execution"]);
const routes: Record<N8nAction, { method: string; path: string; id: boolean }> = {
  list_workflows: { method: "GET", path: "/workflows", id: false },
  get_workflow: { method: "GET", path: "/workflows/", id: true },
  create_workflow: { method: "POST", path: "/workflows", id: false },
  update_workflow: { method: "PUT", path: "/workflows/", id: true },
  activate_workflow: { method: "POST", path: "/workflows/", id: true },
  deactivate_workflow: { method: "POST", path: "/workflows/", id: true },
  delete_workflow: { method: "DELETE", path: "/workflows/", id: true },
  list_executions: { method: "GET", path: "/executions", id: false },
  get_execution: { method: "GET", path: "/executions/", id: true }
};
export function planN8nRequest(request: N8nRequest) {
  const route = routes[request.action];
  if (!route) throw new Error("unsupported_action");
  if (route.id && (!request.id || !/^[a-zA-Z0-9_-]{1,128}$/.test(request.id))) throw new Error("invalid_target_id");
  if (request.body && (typeof request.body !== "object" || Array.isArray(request.body))) throw new Error("invalid_body");
  const target = route.id ? request.id! : "collection";
  const suffix = request.action === "activate_workflow" ? "/activate" : request.action === "deactivate_workflow" ? "/deactivate" : "";
  return { action: request.action, target, method: route.method, path: `/api/v1${route.path}${route.id ? target : ""}${suffix}`, effect: !readActions.has(request.action) };
}
export function assertN8nAuthorization(request: N8nRequest, authorization: N8nAuthorization | undefined, now: number) {
  const plan = planN8nRequest(request);
  if (!plan.effect) return plan;
  if (!authorization?.approved || authorization.action !== request.action || authorization.target !== plan.target || authorization.expiresAt <= now || !/^[a-zA-Z0-9_-]{12,128}$/.test(authorization.nonce)) throw new Error("human_authorization_required");
  return plan;
}
export type N8nTransport = (request: { method: string; path: string; body?: Record<string, unknown> }) => Promise<unknown>;
/** Only call after the upstream NYXA mandate verifier has authenticated the authorization. */
export async function executeN8nRequest(request: N8nRequest, verifiedAuthorization: N8nAuthorization | undefined, now: number, transport: N8nTransport) {
  const plan = assertN8nAuthorization(request, verifiedAuthorization, now);
  return transport({ method: plan.method, path: plan.path, ...(request.body ? { body: request.body } : {}) });
}
