/**
 * Single-process token-bucket rate limiter.
 *
 * Why in-memory: AgentFlow runs as a single Next.js process per deployment.
 * Multi-replica deployments are out of scope for v0.4. The bucket store is
 * exposed behind an injectable `now()` so tests stay deterministic.
 *
 * To move to Redis later, swap the `Store` interface — every call site uses
 * `consume()` and never touches the Map directly.
 */

export interface RateLimitOptions {
  /** Logical bucket name. Use stable strings: "login", "wecom-callback". */
  route: string;
  /** Identity key inside the bucket: ip, user_id, "global", etc. */
  key: string;
  /** Max tokens the bucket holds (≈ max requests per window). */
  limit: number;
  /** Window length in ms; bucket refills `limit` tokens once per window. */
  windowMs: number;
}

export interface RateLimitVerdict {
  ok: boolean;
  /** Tokens left in the bucket after the call. */
  remaining: number;
  /** Unix-ms timestamp when the bucket fully refills. */
  resetAt: number;
  /** Seconds the caller should wait before retrying. 0 when ok. */
  retryAfterSec: number;
}

interface Bucket {
  tokens: number;
  refilledAt: number;
}

const STORE: Map<string, Bucket> = new Map();
let CLOCK: () => number = () => Date.now();

/** Test-only hook to inject a deterministic clock. */
export function _setClockForTest(fn: () => number) { CLOCK = fn; }
/** Test-only hook to wipe state between cases. */
export function _resetForTest() { STORE.clear(); CLOCK = () => Date.now(); }

/**
 * Consume one token. Returns ok=true while tokens remain; once exhausted the
 * caller is rate-limited until the bucket refills.
 *
 * The bucket refills lazily (no background timers): each call computes how
 * many full windows have elapsed since `refilledAt` and tops back up.
 */
export function consume(opts: RateLimitOptions): RateLimitVerdict {
  const now = CLOCK();
  const k = `${opts.route}::${opts.key}`;
  let b = STORE.get(k);
  if (!b) {
    b = { tokens: opts.limit, refilledAt: now };
    STORE.set(k, b);
  } else {
    const elapsed = now - b.refilledAt;
    if (elapsed >= opts.windowMs) {
      // Whole-window refill.
      b.tokens = opts.limit;
      b.refilledAt = now;
    }
  }

  if (b.tokens <= 0) {
    const resetAt = b.refilledAt + opts.windowMs;
    return {
      ok: false,
      remaining: 0,
      resetAt,
      retryAfterSec: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }
  b.tokens -= 1;
  return {
    ok: true,
    remaining: b.tokens,
    resetAt: b.refilledAt + opts.windowMs,
    retryAfterSec: 0,
  };
}

/** Apply standard rate-limit headers + (optional) Retry-After to a Response. */
export function applyHeaders(res: Response | Headers, verdict: RateLimitVerdict, limit: number) {
  const h = res instanceof Headers ? res : res.headers;
  h.set("X-RateLimit-Limit", String(limit));
  h.set("X-RateLimit-Remaining", String(Math.max(0, verdict.remaining)));
  h.set("X-RateLimit-Reset", String(Math.floor(verdict.resetAt / 1000)));
  if (!verdict.ok) h.set("Retry-After", String(verdict.retryAfterSec));
}

/**
 * Read the client IP from common proxy headers. Falls back to "0.0.0.0" so
 * the limiter still works in tests where no headers are present.
 */
export function ipFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "0.0.0.0";
}
