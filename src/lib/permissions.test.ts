import { describe, expect, it } from "vitest";

import { can, canSeePartner } from "./permissions";
import type { MemberStatus, Role } from "@/generated/prisma/client";

const m = (role: Role, status: MemberStatus = "ACTIVE", id = "m1") => ({
  id,
  role,
  status,
});

describe("partner permissions", () => {
  it("gates view/manage to execs", () => {
    expect(can(m("EXEC"), "partner:view")).toBe(true);
    expect(can(m("PRESIDENT"), "partner:manage")).toBe(true);
    expect(can(m("MEMBER"), "partner:view")).toBe(false);
    expect(can(m("MEMBER"), "partner:manage")).toBe(false);
  });

  it("rejects non-ACTIVE memberships", () => {
    expect(can(m("EXEC", "INACTIVE"), "partner:manage")).toBe(false);
  });
});

describe("canSeePartner", () => {
  const partner = { liaisonId: "m1" };

  it("execs see every partner", () => {
    expect(canSeePartner(m("EXEC", "ACTIVE", "someone-else"), partner)).toBe(true);
    expect(canSeePartner(m("PRESIDENT", "ACTIVE", "someone-else"), partner)).toBe(true);
  });

  it("a member sees only partners they liaise for", () => {
    expect(canSeePartner(m("MEMBER"), partner)).toBe(true);
    expect(canSeePartner(m("MEMBER", "ACTIVE", "other"), partner)).toBe(false);
    expect(canSeePartner(m("MEMBER"), { liaisonId: null })).toBe(false);
  });

  it("a non-ACTIVE liaison loses access", () => {
    expect(canSeePartner(m("MEMBER", "ALUMNI"), partner)).toBe(false);
    expect(canSeePartner(m("EXEC", "INACTIVE"), partner)).toBe(false);
  });

  it("null membership sees nothing", () => {
    expect(canSeePartner(null, partner)).toBe(false);
  });
});
