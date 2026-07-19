"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { signupSchema, emailOnlySchema } from "@/lib/validations/auth";
import { createVerificationToken } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";

export type SignupState = {
  error?: string;
  /** Set once the account is created and a verification link is on its way. */
  sent?: { email: string };
};

const verifyUrl = (rawToken: string) =>
  appUrl(`/verify-email?token=${rawToken}`);

/**
 * Create a platform account and mail a verification link (SIGNUP.MD §4.1).
 *
 * Deliberately does NOT sign the user in: the hard gate (§5) admits only
 * verified accounts, so a session here would be dead on arrival. The caller
 * renders a "check your email" state from `sent`.
 */
export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { name, email, password } = parsed.data;

  // Accounts are platform-level. Disclosing existence here is a deliberate UX
  // choice, consistent with the per-club register flow (SIGNUP.MD §4.1, §11).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      error: "An account with this email already exists — sign in instead.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { name, email, passwordHash, emailVerified: null },
      select: { id: true },
    });
    userId = user.id;
  } catch {
    return { error: "Could not create your account. Please try again." };
  }

  const issued = await createVerificationToken(userId);
  if (issued.ok) {
    await sendVerificationEmail(email, name, verifyUrl(issued.raw));
  }

  return { sent: { email } };
}

export type ResendState = { done?: boolean };

/**
 * Re-send a verification link (SIGNUP.MD §4.1, §4.2). Responds "done"
 * regardless of outcome — unknown address, throttled, or genuinely sent — so it
 * leaks nothing and the 60s throttle stays invisible. Only an unverified,
 * existing account actually triggers mail.
 */
export async function resendVerificationAction(
  _prevState: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { done: true };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true, emailVerified: true },
  });

  if (user && !user.emailVerified) {
    const issued = await createVerificationToken(user.id);
    if (issued.ok) {
      await sendVerificationEmail(user.email, user.name, verifyUrl(issued.raw));
    }
  }

  return { done: true };
}
