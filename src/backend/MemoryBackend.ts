export type MemoryBackendType =
  | "local"
  | "remote"
  | "dedicated_node"
  | "customer_owned";

export type BackendInfo = {
  type: MemoryBackendType;
  status: "ready" | "stub";
  detail: string;
};

export interface MemoryBackend {
  readonly type: MemoryBackendType;
  health(): Promise<BackendInfo>;
}
