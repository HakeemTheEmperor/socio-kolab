import type { Role, MemberStatus } from "@/generated/prisma/client";

/**
 * Central authorization helper (SPEC §5). Every server action and UI conditional
 * routes role checks through `can()` — never trust client-side checks.
 *
 * Ownership-scoped rows in the matrix ("own only", e.g. viewing another member's
 * full details) are enforced at the call site with an explicit id comparison;
 * `can()` covers the role-gated actions.
 */
export type Action =
  | "member:viewDirectory"
  | "member:approve"
  | "member:changeStatus"
  | "member:changeRole"
  | "member:import"
  | "dues:record"
  | "dues:viewDashboard"
  | "dues:viewOwn"
  | "event:manage"
  | "event:rsvp"
  | "event:checkIn"
  | "election:manage"
  | "election:apply"
  | "election:vote"
  | "partner:view"
  | "partner:manage"
  | "profile:editOwn"
  | "settings:edit";

const ALL: Role[] = ["MEMBER", "EXEC", "PRESIDENT"];
const EXECS: Role[] = ["EXEC", "PRESIDENT"];
const PRESIDENT_ONLY: Role[] = ["PRESIDENT"];

const PERMISSIONS: Record<Action, Role[]> = {
  "member:viewDirectory": ALL,
  "member:approve": EXECS,
  "member:changeStatus": EXECS,
  "member:changeRole": PRESIDENT_ONLY,
  // Bulk import is exec-level: treasurers/secretaries onboard the roster, not
  // just the president (BULKUPLOAD.MD §4).
  "member:import": EXECS,
  "dues:record": EXECS,
  "dues:viewDashboard": EXECS,
  "dues:viewOwn": ALL,
  "event:manage": EXECS,
  "event:rsvp": ALL,
  "event:checkIn": EXECS,
  // Elections are president-run to avoid execs (likely candidates) administering
  // their own race; any ACTIVE member may stand and vote.
  "election:manage": PRESIDENT_ONLY,
  "election:apply": ALL,
  "election:vote": ALL,
  // Partners are exec-level, nothing president-only: the module exists so MORE
  // of the exco holds the relationship knowledge, not fewer (PARTNERS.md).
  // A non-exec liaison's access is ownership-scoped at the call site
  // (partner.liaisonId === membership.id), like other "own only" matrix rows.
  "partner:view": EXECS,
  "partner:manage": EXECS,
  "profile:editOwn": ALL,
  "settings:edit": PRESIDENT_ONLY,
};

type PermissionSubject = { role: Role; status: MemberStatus } | null | undefined;

/** Returns true if the membership may perform the action. Only ACTIVE members act. */
export function can(membership: PermissionSubject, action: Action): boolean {
  if (!membership) return false;
  if (membership.status !== "ACTIVE") return false;
  return PERMISSIONS[action].includes(membership.role);
}

/**
 * Partner visibility (PARTNERS.md §2): execs see every partner; a non-exec
 * ACTIVE member sees exactly the partners they liaise for. The liaison check is
 * ownership-scoped (an id comparison) rather than a `can()` action, matching
 * the other "own only" rows in the SPEC §5 matrix.
 */
export function canSeePartner(
  membership: ({ id: string } & NonNullable<PermissionSubject>) | null | undefined,
  partner: { liaisonId: string | null },
): boolean {
  if (!membership) return false;
  if (can(membership, "partner:view")) return true;
  return membership.status === "ACTIVE" && partner.liaisonId === membership.id;
}
