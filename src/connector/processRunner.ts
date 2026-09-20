import { spawn } from "node:child_process";
import { access, constants as fsConstants } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const FIXED_ENV = {
  PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  NO_COLOR: "1",
  CI: "1",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_offline: "true"
} as const;

async function spawnAndCollect(
  executable: string,
  args: readonly string[],
  spawnOptions: { cwd: string; env: Record<string, string> },
  options: { timeoutMs: number; maxOutputChars: number; stdin?: string | undefined },
  classifyExitCode?: (code: number) => never | void
): Promise<ProcessResult> {
  return await new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: spawnOptions.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: spawnOptions.env
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
      try {
        if (!timedOut && code !== null && classifyExitCode) classifyExitCode(code);
      } catch (error) {
        reject(error);
        return;
      }
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
  return await spawnAndCollect(
    options.executable,
    options.args,
    { cwd: options.cwd, env: { ...FIXED_ENV, HOME: options.cwd } },
    options
  );
}

// --- Effect containment for nyxa_run_test / apply_patch post-patch tests ---
//
// See scripts/nyxa-run-test-sandbox.sh for the full mechanism and its
// empirical verification notes (unprivileged user+mount+pid+net namespaces,
// tmpfs-backed size-capped scratch, real ulimit ceilings, --kill-child
// teardown). This module only locates the script, refuses to run anything if
// it is missing or not executable (fail-closed, before the target ever
// starts), and distinguishes "sandbox itself failed to initialize" (exit
// codes 90-94, defined by the script) from a real target exit code.

const SANDBOX_SCRIPT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "scripts",
  "nyxa-run-test-sandbox.sh"
);

const SANDBOX_SETUP_FAILURE_EXIT_CODES = new Set([90, 91, 92, 93, 94, 95, 96]);

export type SandboxCapabilities = {
  network: boolean;
  memoryLimitKb: number;
  nprocLimit: number;
  scratchSizeKb: number;
  scratchDir: string;
  extraReadOnlyPath?: string | undefined;
};

export async function runSandboxedProcess(options: {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  stdin?: string | undefined;
  sandbox: SandboxCapabilities;
}): Promise<ProcessResult> {
  if (!options.executable.startsWith("/")) {
    throw new ConnectorError("executable_not_absolute", "Executable is not allowed.", "INVALID");
  }
  try {
    await access(SANDBOX_SCRIPT_PATH, fsConstants.X_OK);
  } catch {
    throw new ConnectorError(
      "sandbox_unavailable",
      "Execution sandbox is unavailable; refusing to run the target unsandboxed.",
      "INVALID"
    );
  }

  // CPU-time ceiling (RLIMIT_CPU via `ulimit -t`, seconds) derived from the caller's own
  // wall-clock timeout rather than a separate config field. Deliberately set to HALF the
  // wall-clock timeout (floor 5s), not equal to or above it: a legitimate, merely slow task
  // (waiting on git/network/subprocess I/O) accumulates CPU time far slower than wall-clock
  // time and is essentially unaffected by a tighter CPU ceiling, while a genuinely
  // pathological single-threaded busy loop burns roughly one CPU-second per wall-clock
  // second -- for that case to be caught by this backstop meaningfully BEFORE the wall-clock
  // SIGKILL (rather than racing it or arriving after), the ceiling must be well below
  // timeoutMs, not derived with positive headroom above it (an earlier version of this
  // constant added +2s instead of subtracting, which made the CPU ceiling strictly larger
  // than the wall-clock timeout and therefore never fired first -- caught by
  // tests/run-test-sandbox.test.mjs's CPU-bounding test).
  const cpuLimitSeconds = Math.max(5, Math.ceil(options.timeoutMs / 1000 / 2));

  const scriptArgs = [
    options.sandbox.scratchDir,
    String(options.sandbox.scratchSizeKb),
    String(options.sandbox.memoryLimitKb),
    String(options.sandbox.nprocLimit),
    String(cpuLimitSeconds),
    options.sandbox.network ? "net" : "nonet",
    options.sandbox.extraReadOnlyPath ?? "-",
    "--",
    options.executable,
    ...options.args
  ];

  return await spawnAndCollect(
    SANDBOX_SCRIPT_PATH,
    scriptArgs,
    { cwd: options.cwd, env: { ...FIXED_ENV, HOME: options.cwd } },
    options,
    (code) => {
      if (SANDBOX_SETUP_FAILURE_EXIT_CODES.has(code)) {
        throw new ConnectorError(
          "sandbox_setup_failed",
          `Execution sandbox failed to initialize (exit ${code}); the target was never started.`,
          "INVALID"
        );
      }
    }
  );
}
