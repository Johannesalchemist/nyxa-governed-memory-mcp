import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";

export type LocalAgentRole = "reasoner" | "coder";
export type LocalAgentRequest = {
  role: LocalAgentRole;
  task: string;
  timeoutMs?: number;
};
export type LocalAgentEvidence = {
  jobId: string; provider: "ollama-local"; model: string;
  promptSha256: string; outputSha256: string;
  startedAt: string; finishedAt: string; durationMs: number;
  output: string;
};

const MODELS: Record<LocalAgentRole, string> = {
  reasoner: "qwen2.5:3b",
  coder: "qwen2.5-coder:1.5b"
};

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

export async function delegateLocalAgent(req: LocalAgentRequest): Promise<LocalAgentEvidence> {
  const model = MODELS[req.role];
  const timeoutMs = req.timeoutMs ?? 60_000;
  const startedAt = new Date();
  const prompt = [
    "You are a bounded NYXA worker. Return only useful task output.",
    "Do not claim external actions, network access, file writes, or verification you did not perform.",
    req.task
  ].join("\n\n");

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("/usr/local/bin/ollama", ["run", model], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("local_agent_timeout")); }, timeoutMs);
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`local_agent_failed:${code}:${stderr.slice(-500)}`));
      else resolve(stdout.trim());
    });
    child.stdin.end(prompt);
  });

  const finishedAt = new Date();
  return {
    jobId: randomUUID(), provider: "ollama-local", model,
    promptSha256: sha(prompt), outputSha256: sha(output),
    startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(), output
  };
}
