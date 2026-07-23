import { Redis } from "@upstash/redis";

/**
 * Redis-backed session allowlist for JWT revocation (SIGNUP.MD §10).
 *
 * Stateless JWTs can't be revoked before they expire, so each JWT is paired
 * with a server-side session id (`sid`) kept here and checked on every request.
 * Deleting the key kills the session immediately.
 *
 * **Edge-safe by construction** (SIGNUP.MD §10.2): this runs inside the proxy's
 * `jwt` callback (edge runtime), so it uses `@upstash/redis` (REST over fetch) —
 * `ioredis`/`node-redis` would not run there — and imports no Prisma or bcrypt,
 * the same rule `auth.config.ts` follows.
 *
 * **No-op without config**: with the Upstash env vars unset (dev/CI), every
 * check reports "valid" and writes are skipped — the app must never require
 * Redis locally, mirroring §3's console-mode email.
 *
 * **Fail-open** (SIGNUP.MD §10.3): if a Redis call throws, we log loudly and
 * treat the session as valid. Fail-closed would turn any Upstash blip into a
 * sitewide lockout; pausing revocation during an outage is the better trade.
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

/** One key per user — a new login overwrites it, so one session per user (§10.1). */
const key = (userId: string) => `user_token:${userId}`;

// TTL matches the session `maxAge` (Auth.js default 30d) so Redis never outlives
// the JWT and abandoned keys expire themselves (§10.1).
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const warn = (op: string, error: unknown) =>
  console.error(`[session-store] ${op} failed — failing open:`, error);

/** Register a freshly issued session id for a user (called on sign-in). */
export async function setSession(userId: string, sid: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(key(userId), sid, { ex: SESSION_TTL_SECONDS });
  } catch (error) {
    warn("setSession", error);
  }
}

/** Revoke a user's session (called on logout and on password reset). */
export async function clearSession(userId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(key(userId));
  } catch (error) {
    warn("clearSession", error);
  }
}

/**
 * Does this JWT's session id still match the one on record? Called on every
 * request from the `jwt` callback.
 *
 *  - No store configured → always valid (revocation disabled in dev/CI).
 *  - Store configured but the token carries no `sid` (a session predating this
 *    feature) → invalid, forcing a one-time re-login.
 *  - Redis throws → valid (fail-open, §10.3).
 */
export async function isSessionValid(
  userId: string,
  sid: string | undefined,
): Promise<boolean> {
  if (!redis) return true;
  if (!sid) return false;
  try {
    const stored = await redis.get<string>(key(userId));
    return stored === sid;
  } catch (error) {
    warn("isSessionValid", error);
    return true;
  }
}
