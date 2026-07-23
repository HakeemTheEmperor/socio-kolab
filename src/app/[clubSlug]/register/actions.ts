"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isPlatformAdmin } from "@/lib/admin";
import { appUrl } from "@/lib/app-url";
import { getClubBySlug } from "@/lib/club-context";
import { getClubSettings } from "@/lib/club";
import { registerSchema, joinClubSchema } from "@/lib/validations/auth";
import { createVerificationToken } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";
import type { Club } from "@/generated/prisma/client";

export type RegisterState = {
  error?: string;
  /** Set once the account + PENDING membership exist and verification is sent. */
  sent?: { email: string; clubName: string };
};

/**
 * Resolve the club an application is being filed against.
 *
 * 404s unless the slug names an ACTIVE club, and refuses outright when the club
 * has closed applications. The UI hides the form in that case, but the toggle is
 * enforced here too: the form is not the security boundary, and a stale page (or
 * a direct POST) must not be able to sneak an application in.
 */
async function clubAcceptingApplications(
  clubSlug: string,
): Promise<{ club: Club } | { error: string }> {
  const club = await getClubBySlug(clubSlug);
  if (!getClubSettings(club.settings).membershipOpen) {
    return { error: `${club.name} is not accepting new members right now.` };
  }
  return { club };
}

/** New visitor: create the account and a PENDING membership in this club. */
export async function registerAction(
  clubSlug: string,
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const resolved = await clubAcceptingApplications(clubSlug);
  if ("error" in resolved) return { error: resolved.error };
  const { club } = resolved;

  const { name, email, password, phone, department, level } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Accounts are platform-level: this person may already be in another club.
    return {
      error:
        "An account with this email already exists. Sign in first, then apply to this club.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        emailVerified: null,
        memberships: {
          create: {
            clubId: club.id,
            role: "MEMBER",
            status: "PENDING",
            phone: phone ?? null,
            department: department ?? null,
            level: level ?? null,
          },
        },
      },
      select: { id: true },
    });
    userId = user.id;
  } catch {
    return { error: "Could not create your account. Please try again." };
  }

  // Under the hard gate (SIGNUP.MD §5), a brand-new account is unverified and so
  // must NOT be signed in — that would be a verification bypass (§6). Mail the
  // verification link instead; the membership is already filed as PENDING.
  const issued = await createVerificationToken(userId);
  if (issued.ok) {
    await sendVerificationEmail(
      email,
      name,
      appUrl(`/verify-email?token=${issued.raw}`),
    );
  }

  return { sent: { email, clubName: club.name } };
}

/**
 * Already signed in: no second account, just a PENDING membership in this club.
 * The name and password live on the User and are untouched.
 */
export async function joinClubAction(
  clubSlug: string,
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login`);

  // A platform admin holds no memberships (MULTI-CLUB §4.3): they oversee clubs,
  // they don't belong to them. Enforced here, not just hidden in the UI.
  if (await isPlatformAdmin(session.user.id)) {
    return {
      error:
        "Platform admins can't join clubs. Use a separate member account to be a member.",
    };
  }

  const parsed = joinClubSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const resolved = await clubAcceptingApplications(clubSlug);
  if ("error" in resolved) return { error: resolved.error };
  const { club } = resolved;

  const { phone, department, level } = parsed.data;

  // One membership per (club, user) — re-applying is not a way to reset a
  // rejected or alumni membership.
  const existing = await prisma.membership.findUnique({
    where: { clubId_userId: { clubId: club.id, userId: session.user.id } },
  });
  if (existing) {
    return { error: `You already have a membership in ${club.name}.` };
  }

  await prisma.membership.create({
    data: {
      clubId: club.id,
      userId: session.user.id,
      role: "MEMBER",
      status: "PENDING",
      phone: phone ?? null,
      department: department ?? null,
      level: level ?? null,
    },
  });

  redirect("/clubs");
}
