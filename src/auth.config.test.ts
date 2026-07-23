import { describe, it, expect, vi, beforeEach } from "vitest";
import { encode, decode } from "@auth/core/jwt";

const setSession = vi.fn();
const isSessionValid = vi.fn();
const clearSession = vi.fn();

vi.mock("@/lib/session-store", () => ({
  setSession: (...a: unknown[]) => setSession(...a),
  isSessionValid: (...a: unknown[]) => isSessionValid(...a),
  clearSession: (...a: unknown[]) => clearSession(...a),
}));

const { authConfig } = await import("@/auth.config");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jwt = authConfig.callbacks.jwt as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session-allowlist claim survives Auth.js encoding", () => {
  /**
   * The regression this file exists for: `@auth/core`'s `encode` ends with
   * `.setJti(crypto.randomUUID())`, so any `jti` a callback sets is replaced
   * before the cookie is written. An allowlist keyed on `jti` therefore never
   * matches on the next request and every login is bounced straight back out.
   */
  it("drops a callback-set `jti` but keeps `sid` through a real encode/decode", async () => {
    const secret = "test-secret-at-least-32-chars-long!!";
    const salt = "authjs.session-token";

    const token = await encode({
      token: { sub: "u1", jti: "mine", sid: "mine" },
      secret,
      salt,
    });
    const decoded = await decode({ token, secret, salt });

    expect(decoded?.sid).toBe("mine"); // ours, untouched
    expect(decoded?.jti).not.toBe("mine"); // clobbered by setJti()
  });
});

describe("jwt callback", () => {
  it("mints a `sid` on sign-in and records that exact value", async () => {
    const token = await jwt({ token: { sub: "u1" }, user: { id: "u1" } });

    expect(token.sid).toEqual(expect.any(String));
    expect(token.jti).toBeUndefined(); // never write the reserved claim
    expect(setSession).toHaveBeenCalledWith("u1", token.sid);
  });

  it("checks the token's `sid` on subsequent requests", async () => {
    isSessionValid.mockResolvedValue(true);

    const token = await jwt({ token: { sub: "u1", sid: "s1" } });

    expect(isSessionValid).toHaveBeenCalledWith("u1", "s1");
    expect(token).not.toBeNull();
  });

  it("drops the session when the allowlist rejects it", async () => {
    isSessionValid.mockResolvedValue(false);

    expect(await jwt({ token: { sub: "u1", sid: "stale" } })).toBeNull();
  });
});
