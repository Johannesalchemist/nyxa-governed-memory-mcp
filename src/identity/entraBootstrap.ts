import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { EntraIdentityVerifier, type EntraPrincipal } from "./entraIdentity.js";

export type EntraBootstrapConfig = {
  tenantId: string;
  clientId: string;
  tokenFile: string;
};

export function loadEntraBootstrapConfig(): EntraBootstrapConfig | undefined {
  const tenantId = process.env.NYXA_ENTRA_TENANT_ID?.trim();
  const clientId = process.env.NYXA_ENTRA_CLIENT_ID?.trim();
  const tokenFile = process.env.NYXA_ENTRA_ID_TOKEN_FILE?.trim();
  const configured = [tenantId, clientId, tokenFile].filter(Boolean).length;
  if (configured === 0) return undefined;
  if (configured !== 3) throw new Error("entra_identity_config_incomplete");
  return { tenantId: tenantId!, clientId: clientId!, tokenFile: tokenFile! };
}
async function readTokenFile(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("entra_token_file_not_absolute");
  const canonical = await realpath(path);
  if (canonical !== resolve(path)) throw new Error("entra_token_file_noncanonical");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    const named = await lstat(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size < 32 || stat.size > 65536)
      throw new Error("entra_token_file_invalid");
    if ((stat.mode & 0o077) !== 0) throw new Error("entra_token_file_permissions");
    if ((stat.uid !== process.geteuid!() && stat.uid !== 0) || stat.ino !== named.ino || stat.dev !== named.dev)
      throw new Error("entra_token_file_ownership");
    const buffer = Buffer.alloc(stat.size);
    const { bytesRead } = await handle.read(buffer, 0, stat.size, 0);
    if (bytesRead !== stat.size) throw new Error("entra_token_file_short_read");
    return buffer.toString("utf8").trim();
  } finally {
    await handle.close();
  }
}
export async function verifyConfiguredEntraIdentity(): Promise<EntraPrincipal | undefined> {
  const config = loadEntraBootstrapConfig();
  if (!config) return undefined;
  const token = await readTokenFile(config.tokenFile);
  const verifier = new EntraIdentityVerifier({
    tenantId: config.tenantId,
    clientId: config.clientId
  });
  return await verifier.verify(token);
}
