import type { BackendInfo, MemoryBackend } from "./MemoryBackend.js";

export class LocalBackend implements MemoryBackend {
  public readonly type = "local" as const;

  public constructor(private readonly dataDir: string) {}

  public async health(): Promise<BackendInfo> {
    return {
      type: this.type,
      status: "ready",
      detail: `local_backend_active:${this.dataDir}`
    };
  }
}
