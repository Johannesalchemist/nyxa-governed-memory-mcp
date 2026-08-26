import type { PolicyOutcome } from "./types.js";

export class ConnectorError extends Error {
  public constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly outcome: PolicyOutcome = "DENIED"
  ) {
    super(code);
    this.name = "ConnectorError";
  }
}

export function asConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) return error;
  return new ConnectorError("internal_error", "The operation failed safely.", "INVALID");
}
