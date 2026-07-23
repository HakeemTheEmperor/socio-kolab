"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireClubAccess, findMemberInClub } from "@/lib/club-context";
import { getClubSettings } from "@/lib/club";
import { can } from "@/lib/permissions";
import { appUrl } from "@/lib/app-url";
import { sendInviteEmail } from "@/lib/email";
import { createInviteToken } from "@/lib/verification";
import { dedupeByEmail, parseMemberRows } from "@/lib/members-import";
import {
  MAX_IMPORT_ROWS,
  importRowSchema,
  memberStatusSchema,
  roleSchema,
  committeeSchema,
} from "@/lib/validations/members";

export type ActionResult = { ok: boolean; error?: string };

function revalidateMember(clubSlug: string, id: string) {
  revalidatePath(`/${clubSlug}/members`);
  revalidatePath(`/${clubSlug}/members/${id}`);
}

export async function approveMember(
  clubSlug: string,
  membershipId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: "ACTIVE" },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function rejectMember(
  clubSlug: string,
  membershipId: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:approve")) return { ok: false, error: "Not authorized." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.status !== "PENDING") {
    return { ok: false, error: "This member is not pending approval." };
  }

  // Soft outcome (no hard delete, per SPEC §3): a rejected applicant is INACTIVE.
  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: "INACTIVE" },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberStatus(
  clubSlug: string,
  membershipId: string,
  status: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = memberStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Invalid status." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    return { ok: false, error: "You can't change your own status." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { status: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberCommittee(
  clubSlug: string,
  membershipId: string,
  committee: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeStatus")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = committeeSchema.safeParse(committee);
  if (!parsed.success) return { ok: false, error: "Invalid committee." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };

  // If a value is given it must be one of this club's configured committees.
  if (parsed.data) {
    const { committees } = getClubSettings(club.settings);
    if (!committees.includes(parsed.data)) {
      return { ok: false, error: "Unknown committee." };
    }
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { committee: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

export async function changeMemberRole(
  clubSlug: string,
  membershipId: string,
  role: string,
): Promise<ActionResult> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:changeRole")) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = roleSchema.safeParse(role);
  if (!parsed.success) return { ok: false, error: "Invalid role." };

  const target = await findMemberInClub(club.id, membershipId);
  if (!target) return { ok: false, error: "Member not found." };
  if (target.id === me.id) {
    // Prevent a president from demoting themselves into a lockout.
    return { ok: false, error: "You can't change your own role." };
  }

  await prisma.membership.update({
    where: { id: membershipId, clubId: club.id },
    data: { role: parsed.data },
  });
  revalidateMember(clubSlug, membershipId);
  return { ok: true };
}

/* --------------------------------------------------------------------------
 * Bulk member import (BULKUPLOAD.MD §5)
 * ---------------------------------------------------------------------------*/

export interface ImportSummary {
  ok: boolean;
  /** Top-level failure (not authorized, empty, or over the batch cap). */
  error?: string;
  /** New account created + invite emailed. */
  created: number;
  /** Existing account gained a membership in this club. */
  addedExisting: number;
  /** Already a member here, or a duplicate row within the upload. */
  skipped: number;
  /** Invite emails that failed to send (the accounts still exist). */
  invitesFailed: number;
  /** Per-row problems, anchored to the row's line in the uploaded file. */
  rowErrors: { line: number; message: string }[];
}

/** Pending invite email, collected during the DB pass and sent after it. */
interface PendingInvite {
  to: string;
  name: string;
  url: string;
}

const emptySummary = (): ImportSummary => ({
  ok: true,
  created: 0,
  addedExisting: 0,
  skipped: 0,
  invitesFailed: 0,
  rowErrors: [],
});

/**
 * Bulk-create members from an uploaded CSV / pasted rows. Each brand-new account
 * is emailed a single-use invite link (verify email + set own password) — no
 * password is ever generated or shared (BULKUPLOAD.MD). The raw text is
 * re-parsed and re-validated server-side; the client preview is never trusted.
 *
 * Idempotent: re-running the same file re-adds nothing, and only issues invites
 * for still-unclaimed new accounts.
 */
export async function bulkImportMembers(
  clubSlug: string,
  rawText: string,
): Promise<ImportSummary> {
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "member:import")) {
    return { ...emptySummary(), ok: false, error: "Not authorized." };
  }

  const parsed = parseMemberRows(rawText);
  if (parsed.length === 0) {
    return {
      ...emptySummary(),
      ok: false,
      error: "No rows found. Expected columns: name, email, phone, department, level.",
    };
  }
  if (parsed.length > MAX_IMPORT_ROWS) {
    return {
      ...emptySummary(),
      ok: false,
      error: `Too many rows (${parsed.length}). Import at most ${MAX_IMPORT_ROWS} at once.`,
    };
  }

  const summary = emptySummary();
  const { unique, duplicates } = dedupeByEmail(parsed);
  for (const dup of duplicates) {
    summary.skipped++;
    summary.rowErrors.push({
      line: dup.line,
      message: `Duplicate of an earlier row (${dup.email}).`,
    });
  }

  // A single random, unusable password hash for every new account in this batch:
  // it can never be logged in with (the invite sets the real one), so sharing it
  // is safe and avoids a per-row bcrypt cost.
  const placeholderHash = await bcrypt.hash(
    randomBytes(32).toString("base64url"),
    10,
  );

  const invites: PendingInvite[] = [];

  for (const row of unique) {
    const check = importRowSchema.safeParse({
      name: row.name,
      email: row.email,
      phone: row.phone,
      department: row.department,
      level: row.level,
    });
    if (!check.success) {
      summary.rowErrors.push({
        line: row.line,
        message: check.error.issues[0]?.message ?? "Invalid row.",
      });
      continue;
    }
    const data = check.data;

    try {
      const outcome = await importOne(club.id, data, placeholderHash);
      if (outcome.kind === "created") {
        summary.created++;
        if (outcome.invite) invites.push(outcome.invite);
      } else if (outcome.kind === "addedExisting") {
        summary.addedExisting++;
        if (outcome.invite) invites.push(outcome.invite);
      } else {
        summary.skipped++;
        summary.rowErrors.push({ line: row.line, message: outcome.reason });
      }
    } catch {
      summary.rowErrors.push({
        line: row.line,
        message: `Could not import ${data.email}.`,
      });
    }
  }

  // Emails go out AFTER all DB writes: a mail-provider failure must never roll
  // back a created membership. Console mode (no RESEND_API_KEY) never throws.
  for (const invite of invites) {
    try {
      await sendInviteEmail(invite.to, invite.name, club.name, invite.url);
    } catch {
      summary.invitesFailed++;
    }
  }

  revalidatePath(`/${clubSlug}/members`);
  return summary;
}

type ImportOutcome =
  | { kind: "created"; invite: PendingInvite | null }
  | { kind: "addedExisting"; invite: PendingInvite | null }
  | { kind: "skipped"; reason: string };

/**
 * Import one validated row. Users are global (they can belong to several clubs),
 * so an existing account is reused and only gains a membership here; a brand-new
 * account is created pre-verified (an exec vouched) with the imported-member
 * flag set, and gets an invite. An established user of another club keeps their
 * working credentials — no invite, no reset.
 */
async function importOne(
  clubId: string,
  data: {
    name: string;
    email: string;
    phone: string | null;
    department: string | null;
    level: string | null;
  },
  placeholderHash: string,
): Promise<ImportOutcome> {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, name: true, mustChangePassword: true, isPlatformAdmin: true },
  });

  if (existing) {
    // A platform admin holds no memberships (MULTI-CLUB §4.3). A CSV must not be
    // able to smuggle one in — skip the row rather than fail the whole import.
    if (existing.isPlatformAdmin) {
      return { kind: "skipped", reason: "Platform admins can't be club members." };
    }

    const membership = await prisma.membership.findUnique({
      where: { clubId_userId: { clubId, userId: existing.id } },
      select: { id: true },
    });
    if (membership) return { kind: "skipped", reason: "Already a member." };

    await prisma.membership.create({
      data: {
        clubId,
        userId: existing.id,
        status: "ACTIVE",
        phone: data.phone,
        department: data.department,
        level: data.level,
      },
    });
    // Only invite an account that has never set its own password (i.e. was
    // itself an unclaimed import). An established user already has credentials.
    const invite = existing.mustChangePassword
      ? await issueInvite(existing.id, existing.name, data.email)
      : null;
    return { kind: "addedExisting", invite };
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash: placeholderHash,
      mustChangePassword: true,
      // An exec vouched for this address, so pre-verify it (SIGNUP.MD §1.3): the
      // account skips the hard gate and the invite just sets a password.
      emailVerified: new Date(),
      memberships: {
        create: {
          clubId,
          status: "ACTIVE",
          phone: data.phone,
          department: data.department,
          level: data.level,
        },
      },
    },
    select: { id: true },
  });
  const invite = await issueInvite(user.id, data.name, data.email);
  return { kind: "created", invite };
}

/** Issue an invite token and build the accept-invite link, or null if throttled. */
async function issueInvite(
  userId: string,
  name: string,
  email: string,
): Promise<PendingInvite | null> {
  const result = await createInviteToken(userId);
  if (!result.ok) return null;
  return { to: email, name, url: appUrl(`/accept-invite?token=${result.raw}`) };
}
