import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Platform-admin grant/revoke guards (ADMIN.md §5). These pin the *refusals* —
 * that the invariants (§4.3 "admins hold no memberships", no self-revoke, always
 * one admin left) fire in the server action and no write is attempted — plus the
 * happy paths, and that a non-admin caller never reaches `update`. The checks
 * must live in the action, not the UI, so that is what we exercise here.
 */

// requirePlatformAdmin returns the calling admin; its id is the "self" reference.
const requirePlatformAdminMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  requirePlatformAdmin: () => requirePlatformAdminMock(),
}));

const userFindUnique = vi.fn();
const userUpdate = vi.fn();
const userCount = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (args: unknown) => userFindUnique(args),
      update: (args: unknown) => userUpdate(args),
      count: (args: unknown) => userCount(args),
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { grantPlatformAdmin, revokePlatformAdmin } = await import(
  "./user-actions"
);

const ME = { id: "admin1", email: "admin@platform.test" };

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformAdminMock.mockResolvedValue(ME);
});

describe("grantPlatformAdmin", () => {
  it("refuses a user who holds a membership and never writes", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      isPlatformAdmin: false,
      _count: { memberships: 1 },
    });

    const result = await grantPlatformAdmin("u2");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/membership/i);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("promotes a membership-free user", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      isPlatformAdmin: false,
      _count: { memberships: 0 },
    });

    const result = await grantPlatformAdmin("u2");

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { isPlatformAdmin: true },
    });
  });

  it("never reaches update for a non-admin caller", async () => {
    requirePlatformAdminMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(grantPlatformAdmin("u2")).rejects.toThrow();
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("revokePlatformAdmin", () => {
  it("refuses revoking yourself and never writes", async () => {
    const result = await revokePlatformAdmin(ME.id);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/your own admin/i);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("refuses when only one admin remains and never writes", async () => {
    userFindUnique.mockResolvedValue({ id: "u2", isPlatformAdmin: true });
    userCount.mockResolvedValue(1);

    const result = await revokePlatformAdmin("u2");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/at least one platform admin/i);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("demotes another admin when a second one remains", async () => {
    userFindUnique.mockResolvedValue({ id: "u2", isPlatformAdmin: true });
    userCount.mockResolvedValue(2);

    const result = await revokePlatformAdmin("u2");

    expect(result.ok).toBe(true);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { isPlatformAdmin: false },
    });
  });

  it("never reaches update for a non-admin caller", async () => {
    requirePlatformAdminMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));

    await expect(revokePlatformAdmin("u2")).rejects.toThrow();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});
