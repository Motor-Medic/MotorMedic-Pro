/**
 * Light in-memory/IP rate limit for the auth-less checkout-create endpoint
 * only. The card is the abuse gate; this is just a cheap burst guard so one
 * script cannot hammer session creation. No tenant-creation rate limiting is
 * applied anywhere else.
 */
export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
  reset(): void;
}

export function createInMemoryRateLimiter(
  options: RateLimitOptions
): RateLimiter {
  const { windowMs, max } = options;
  const now = options.now ?? Date.now;
  const buckets = new Map<string, number[]>();

  return {
    check(key: string): RateLimitDecision {
      const at = now();
      const cutoff = at - windowMs;
      const existing = buckets.get(key) ?? [];
      const recent = existing.filter((timestamp) => timestamp > cutoff);

      if (recent.length >= max) {
        const oldest = recent[0] ?? at;
        buckets.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, oldest + windowMs - at)
        };
      }

      recent.push(at);
      buckets.set(key, recent);
      return {
        allowed: true,
        remaining: Math.max(0, max - recent.length),
        retryAfterMs: 0
      };
    },
    reset(): void {
      buckets.clear();
    }
  };
}
