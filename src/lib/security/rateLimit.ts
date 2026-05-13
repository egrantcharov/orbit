/**
 * In-process token-bucket rate limiter. Lives inside the Node.js runtime
 * for a single Vercel function instance, so it's best-effort under Fluid
 * Compute (which reuses instances across requests) and worthless across
 * regions. That's intentional: this is throttling for "stop a stuck client
 * from hammering Anthropic," not abuse defense. For abuse defense, use the
 * Vercel WAF + Vercel BotID — see SECURITY.md.
 *
 * The contract is dead simple:
 *   const ok = checkRateLimit(`${name}:${userId}`, limit, windowMs);
 *   if (!ok.allowed) return 429;
 *
 * Keys are namespaced by route+user; entries auto-evict after they expire
 * so the Map doesn't grow forever.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }
  if (b.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - b.count),
  };
}
