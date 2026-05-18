import { mkdir } from "node:fs/promises";

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`failed_to_ensure_directory:${message}`);
  }
}
