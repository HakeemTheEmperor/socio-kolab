import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB layer so the orchestration functions can be exercised without a
// database — the pure helpers below need no mock at all.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  INVITE_SLOT,
  RESEND_THROTTLE_MS,
  RESET_SLOT,
  VERIFICATION_SLOT,
  consumeInviteToken,
  consumeToken,
  consumeVerificationToken,
  generateRawToken,
  hashToken,
  isThrottled,
  issueToken,
} from "./verification";

const findUnique = vi.mocked(prisma.user.findUnique);
const update = vi.mocked(prisma.user.update);
const updateMany = vi.mocked(prisma.user.updateMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hashToken", () => {
  it("is deterministic and lowercase 64-char hex", () => {
    const h = hashToken("hello");
    expect(h).toBe(hashToken("hello"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known sha256 of a fixed input", () => {
    // sha256("abc") — pins the algorithm so a swap can't pass silently.
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("maps different tokens to different hashes", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("generateRawToken", () => {
  it("is url-safe (base64url charset) and unique per call", () => {
    const a = generateRawToken();
    const b = generateRawToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });

  it("round-trips through hashToken", () => {
    const raw = generateRawToken();
    expect(hashToken(raw)).toBe(hashToken(raw));
  });
});

describe("isThrottled", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("never throttles a never-sent slot", () => {
    expect(isThrottled(null, now)).toBe(false);
  });

  it("throttles inside the window", () => {
    const justSent = new Date(now.getTime() - (RESEND_THROTTLE_MS - 1));
    expect(isThrottled(justSent, now)).toBe(true);
  });

  it("allows a resend once the window has fully elapsed", () => {
    const atBoundary = new Date(now.getTime() - RESEND_THROTTLE_MS);
    expect(isThrottled(atBoundary, now)).toBe(false);
  });
});

describe("slot constants", () => {
  it("uses 24h for verification and 1h for reset", () => {
    expect(VERIFICATION_SLOT.ttlMs).toBe(24 * 60 * 60 * 1000);
    expect(RESET_SLOT.ttlMs).toBe(60 * 60 * 1000);
  });

  it("uses a generous 7d for invites", () => {
    expect(INVITE_SLOT.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("never shares a column between any two slots", () => {
    const cols = (s: typeof VERIFICATION_SLOT) => [s.hash, s.sentAt, s.expiry];
    const all = [
      ...cols(VERIFICATION_SLOT),
      ...cols(RESET_SLOT),
      ...cols(INVITE_SLOT),
    ];
    // No column name appears in more than one slot.
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("issueToken", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("writes the hashed token, sentAt and expiry, and returns the raw token", async () => {
    findUnique.mockResolvedValue({ verificationTokenSentAt: null } as never);
    update.mockResolvedValue({} as never);

    const result = await issueToken(VERIFICATION_SLOT, "user-1", now);
    expect(result).toEqual({ ok: true, raw: expect.any(String) });

    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    // The raw token is never persisted — only its hash.
    expect(data.verificationTokenHash).toBe(
      hashToken((result as { raw: string }).raw),
    );
    expect(data.verificationTokenSentAt).toEqual(now);
    expect(data.verificationTokenExpiry).toEqual(
      new Date(now.getTime() + VERIFICATION_SLOT.ttlMs),
    );
  });

  it("refuses (without writing) when the previous send is too recent", async () => {
    findUnique.mockResolvedValue({
      verificationTokenSentAt: new Date(now.getTime() - 1000),
    } as never);

    const result = await issueToken(VERIFICATION_SLOT, "user-1", now);
    expect(result).toEqual({ ok: false, reason: "throttled" });
    expect(update).not.toHaveBeenCalled();
  });

  it("treats an unknown user as throttled and writes nothing", async () => {
    findUnique.mockResolvedValue(null as never);

    const result = await issueToken(VERIFICATION_SLOT, "ghost", now);
    expect(result).toEqual({ ok: false, reason: "throttled" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("consumeToken", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("succeeds and clears the slot when exactly one row matches", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);

    const ok = await consumeToken(
      VERIFICATION_SLOT,
      "raw-token",
      { emailVerified: now },
      now,
    );
    expect(ok).toBe(true);

    const arg = updateMany.mock.calls[0][0];
    const where = arg.where as Record<string, unknown>;
    const data = arg.data as Record<string, unknown>;
    // Guarded on the hash and an unexpired token.
    expect(where.verificationTokenHash).toBe(hashToken("raw-token"));
    expect(where.verificationTokenExpiry).toEqual({ gt: now });
    // The slot is nulled out in the same update — single-use by construction.
    expect(data.verificationTokenHash).toBeNull();
    expect(data.verificationTokenSentAt).toBeNull();
    expect(data.verificationTokenExpiry).toBeNull();
    expect(data.emailVerified).toEqual(now);
  });

  it("fails for an invalid, expired, or already-used token (no row matched)", async () => {
    updateMany.mockResolvedValue({ count: 0 } as never);

    const ok = await consumeToken(VERIFICATION_SLOT, "stale", {}, now);
    expect(ok).toBe(false);
  });
});

describe("consumeVerificationToken", () => {
  it("marks the account verified on success", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);

    const ok = await consumeVerificationToken("raw");
    expect(ok).toBe(true);

    const data = updateMany.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.emailVerified).toBeInstanceOf(Date);
  });
});

describe("consumeInviteToken", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("sets the new password, clears mustChangePassword, and keeps the vouched verify time", async () => {
    updateMany.mockResolvedValue({ count: 1 } as never);

    const ok = await consumeInviteToken("raw", "hash-of-new-pw", now);
    expect(ok).toBe(true);

    const arg = updateMany.mock.calls[0][0];
    const where = arg.where as Record<string, unknown>;
    const data = arg.data as Record<string, unknown>;
    // Guarded on the invite slot's hash, and it clears that slot on consume.
    expect(where.inviteTokenHash).toBe(hashToken("raw"));
    expect(data.inviteTokenHash).toBeNull();
    expect(data.inviteTokenSentAt).toBeNull();
    expect(data.inviteTokenExpiry).toBeNull();
    // The chosen password lands; the imported-member flag is cleared.
    expect(data.passwordHash).toBe("hash-of-new-pw");
    expect(data.mustChangePassword).toBe(false);
    expect(data.emailVerified).toEqual(now);
  });

  it("fails for an invalid or expired invite (no row matched)", async () => {
    updateMany.mockResolvedValue({ count: 0 } as never);
    expect(await consumeInviteToken("stale", "h", now)).toBe(false);
  });
});
