import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One shared fake Upstash client; each test wires its behaviour via these mocks.
const get = vi.fn();
const set = vi.fn();
const del = vi.fn();

// `new Redis(...)` must be constructable, so mock it as a class whose methods
// delegate to the shared spies above.
vi.mock("@upstash/redis", () => ({
  Redis: class {
    get = get;
    set = set;
    del = del;
  },
}));

// The module decides configured-vs-no-op from env *at import time*, so each
// scenario stubs env, resets the module registry, then imports fresh.
async function load(configured: boolean) {
  vi.stubEnv(
    "UPSTASH_REDIS_REST_URL",
    configured ? "https://example.upstash.io" : "",
  );
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", configured ? "token" : "");
  vi.resetModules();
  return import("./session-store");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("no-op mode (Upstash env unset)", () => {
  it("reports every session valid and never touches Redis", async () => {
    const store = await load(false);
    expect(await store.isSessionValid("u1", "sid")).toBe(true);
    expect(await store.isSessionValid("u1", undefined)).toBe(true);
    await store.setSession("u1", "sid");
    await store.clearSession("u1");
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});

describe("configured mode", () => {
  it("is valid only when the stored session id matches the token's", async () => {
    const store = await load(true);
    get.mockResolvedValue("sid-1");
    expect(await store.isSessionValid("u1", "sid-1")).toBe(true);
  });

  it("is invalid when the stored id differs (superseded by a newer login)", async () => {
    const store = await load(true);
    get.mockResolvedValue("sid-new");
    expect(await store.isSessionValid("u1", "sid-old")).toBe(false);
  });

  it("is invalid when the key is gone (logged out / expired)", async () => {
    const store = await load(true);
    get.mockResolvedValue(null);
    expect(await store.isSessionValid("u1", "sid-1")).toBe(false);
  });

  it("rejects a token with no sid (session predating the allowlist)", async () => {
    const store = await load(true);
    expect(await store.isSessionValid("u1", undefined)).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("fails OPEN when Redis throws, and logs it", async () => {
    const store = await load(true);
    get.mockRejectedValue(new Error("upstash down"));
    expect(await store.isSessionValid("u1", "sid-1")).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it("setSession writes the id under the per-user key with a TTL", async () => {
    const store = await load(true);
    await store.setSession("u1", "sid-1");
    expect(set).toHaveBeenCalledWith("user_token:u1", "sid-1", {
      ex: 30 * 24 * 60 * 60,
    });
  });

  it("clearSession deletes the per-user key", async () => {
    const store = await load(true);
    await store.clearSession("u1");
    expect(del).toHaveBeenCalledWith("user_token:u1");
  });
});
