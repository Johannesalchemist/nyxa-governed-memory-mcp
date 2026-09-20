// Shared helper for E2E tests that spawn a real dist/index.js MCP server process.
// Fixes the Step-8-identified design smell: earlier harnesses set HOME to the live
// runtime repository (resolve(".")), which meant any subprocess/tool that honors
// HOME (npm, git, pm2, ...) could write into the production checkout. This helper
// always returns a fresh, isolated, temp-directory HOME instead.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PRESERVE = process.env.NYXA_TEST_PRESERVE_ISOLATED_HOME === "1";

export async function createIsolatedE2EHome(prefix = "nyxa-e2e-home-") {
  const homeDir = await mkdtemp(join(tmpdir(), prefix));
  return {
    homeDir,
    async cleanup() {
      if (PRESERVE) return;
      await rm(homeDir, { recursive: true, force: true });
    }
  };
}

export async function cleanupAll(homes) {
  for (const home of homes) {
    await home.cleanup();
  }
}
