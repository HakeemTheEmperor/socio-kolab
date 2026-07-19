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
  | "dues:record"
  | "dues:viewDashboard"
  | "dues:viewOwn"
  | "event:manage"
  | "event:rsvp"
  | "event:checkIn"
  | "election:manage"
  | "election:apply"
  | "election:vote"
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
