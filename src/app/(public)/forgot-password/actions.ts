"use server";

import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { emailOnlySchema } from "@/lib/validations/auth";
import { createResetToken } from "@/lib/verification";
import { sendPasswordResetEmail } from "@/lib/email";

export type ForgotState = { done?: boolean };

/**
 * Start a password reset (SIGNUP.MD §9.1). Unlike signup, this must NOT disclose
 * whether an address has an account — a reset request is the classic
 * account-enumeration oracle. So every outcome (no account, throttled, or
 * genuinely sent) returns the same `done` state and takes a broadly similar
 * path; only a real, matching account triggers mail.
 *
 * Works for unverified accounts too: a completed reset also verifies the email
 * (§9.3), which is the only way an unverified user locked out by the hard gate
 * can recover.
 */
export async function forgotPasswordAction(
  _prevState: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { done: true };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true },
  });

  if (user) {
    // createResetToken enforces the 60s throttle itself; a throttled request
    // simply sends nothing, and the caller can't tell the difference.
    const issued = await createResetToken(user.id);
    if (issued.ok) {
      await sendPasswordResetEmail(
        user.email,
        user.name,
        appUrl(`/reset-password?token=${issued.raw}`),
      );
    }
  }

  return { done: true };
}
