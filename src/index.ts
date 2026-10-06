import "dotenv/config";
import { NyxaGovernedMemoryServer } from "./server.js";
import { verifyConfiguredEntraIdentity } from "./identity/entraBootstrap.js";

async function main(): Promise<void> {
  const entraPrincipal = await verifyConfiguredEntraIdentity();
  const server = new NyxaGovernedMemoryServer(entraPrincipal?.authorityPrincipalId);
  await server.start();
}

main().catch((error: unknown) => {
  console.error("nyxa_governed_memory_mcp_startup_failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
