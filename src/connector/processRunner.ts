import { spawn } from "node:child_process";
import { ConnectorError } from "./errors.js";
import { sanitizeText } from "./redaction.js";

export type ProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  redactions: number;
};

export async function runFixedProcess(options: {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  stdin?: string | undefined;
}): Promise<ProcessResult> {
  if (!options.executable.startsWith("/")) {
    throw new ConnectorError("executable_not_absolute", "Executable is not allowed.", "INVALID");
  }
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        HOME: options.cwd,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        NO_COLOR: "1",
        CI: "1",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_offline: "true"
      }
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let overflow = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);
    const collect = (target: "stdout" | "stderr", chunk: Buffer): void => {
      if (overflow) return;
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      if (stdout.length + stderr.length > options.maxOutputChars * 2) {
        overflow = true;
        child.kill("SIGKILL");
      }
    };
    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new ConnectorError("process_start_failed", "Approved process could not start.", "INVALID"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const cleanOut = sanitizeText(stdout, options.maxOutputChars);
      const cleanErr = sanitizeText(stderr, options.maxOutputChars);
      resolve({
        exitCode: code ?? -1,
        stdout: cleanOut.text,
        stderr: cleanErr.text,
        timedOut,
        truncated: overflow || cleanOut.truncated || cleanErr.truncated,
        redactions: cleanOut.redactions + cleanErr.redactions
      });
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin, "utf8");
    else child.stdin.end();
  });
}
