import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Separation-of-duties guards (MULTI-CLUB §4.3): a platform admin may neither
 * create a club nor join one. These tests pin the *refusal* — that the guard
 * fires for an admin and no write is attempted — and that an ordinary user is
 * not caught by it. The check must live in the server action, not the UI, so
 * that is what we exercise here.
 */

const authMock = vi.fn();
vi.mock("@/auth", () => ({
  auth: () => authMock(),
  // register/actions.ts re-exports these from "@/auth"; unused here.
  signIn: vi.fn(),
  EMAIL_NOT_VERIFIED_CODE: "email_not_verified",
}));

const isPlatformAdminMock = vi.fn();
vi.mock("@/lib/admin", () => ({
  isPlatformAdmin: (id: string) => isPlatformAdminMock(id),
}));

const clubCreate = vi.fn();
const membershipCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: { create: clubCreate, findUnique: vi.fn() },
    membership: { create: membershipCreate, findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

// joinClubAction resolves the club after the admin gate; stub it as "closed" so
// a non-admin cleanly stops there (no DB, no membership) instead of reaching
// real Prisma. Irrelevant to the admin case, which returns before this runs.
vi.mock("@/lib/club-context", () => ({
  getClubBySlug: vi.fn(async () => ({ id: "c1", name: "Club", settings: {} })),
}));
vi.mock("@/lib/club", () => ({
  getClubSettings: () => ({ membershipOpen: false }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Next's redirect throws to unwind; mirror that so the "allowed" path is visible.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { requestClub } = await import("@/app/(public)/clubs/new/actions");
const { joinClubAction } = await import("@/app/[clubSlug]/register/actions");

const emptyForm = () => new FormData();

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1", email: "u@x.test" } });
});

describe("Rule 1 — admins can't create clubs (requestClub)", () => {
  it("refuses an admin and never writes a club", async () => {
    isPlatformAdminMock.mockResolvedValue(true);

    const result = await requestClub({}, emptyForm());

    expect(result.error).toMatch(/admins can't create clubs/i);
    expect(clubCreate).not.toHaveBeenCalled();
  });

  it("does not catch an ordinary user (falls through to input validation)", async () => {
    isPlatformAdminMock.mockResolvedValue(false);

    const result = await requestClub({}, emptyForm());

    // Past the admin gate: the only thing stopping this call is the empty form,
    // so the error is a validation one — crucially NOT the admin refusal.
    expect(result.error).not.toMatch(/admins can't/i);
    expect(isPlatformAdminMock).toHaveBeenCalledWith("u1");
  });
});

describe("Rule 2 — admins can't join clubs (joinClubAction)", () => {
  it("refuses an admin and never writes a membership", async () => {
    isPlatformAdminMock.mockResolvedValue(true);

    const result = await joinClubAction("some-club", {}, emptyForm());

    expect(result.error).toMatch(/admins can't join clubs/i);
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("does not catch an ordinary user (falls through to input validation)", async () => {
    isPlatformAdminMock.mockResolvedValue(false);

    const result = await joinClubAction("some-club", {}, emptyForm());

    // Past the admin gate: stopped only by the stubbed "closed" club, so the
    // error is about applications being closed — not the admin refusal.
    expect(result.error).not.toMatch(/admins can't/i);
    expect(isPlatformAdminMock).toHaveBeenCalledWith("u1");
    expect(membershipCreate).not.toHaveBeenCalled();
  });
});
