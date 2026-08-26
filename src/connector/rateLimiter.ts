export class RateLimiter {
  private readonly calls: number[] = [];
  public constructor(private readonly limit: number, private readonly windowMs = 60_000) {}
  public take(now = Date.now()): boolean {
    while (this.calls.length > 0 && this.calls[0]! <= now - this.windowMs) this.calls.shift();
    if (this.calls.length >= this.limit) return false;
    this.calls.push(now);
    return true;
  }
}
