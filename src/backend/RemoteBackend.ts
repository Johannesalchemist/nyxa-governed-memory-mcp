import type { BackendInfo, MemoryBackend, MemoryBackendType } from "./MemoryBackend.js";

export class RemoteBackendStub implements MemoryBackend {
  public constructor(public readonly type: Exclude<MemoryBackendType, "local">) {}

  public async health(): Promise<BackendInfo> {
    return {
      type: this.type,
      status: "stub",
      detail: `${this.type}_backend_reserved_for_future_versions`
    };
  }
}
