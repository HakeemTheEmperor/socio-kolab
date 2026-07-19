"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { clearSession } from "@/lib/session-store";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { RESET_SLOT, consumeToken, hashToken } from "@/lib/verification";

export type ResetState = { error?: string };

/**
 * Set a new password from a reset link (SIGNUP.MD §9.2). The token is consumed
 * here, on POST — never on page view, so a mail-client prefetcher can't burn it.
 *
 * The guarded `consumeToken` is the atomic single-use gate. The prior read only
 * serves §9.3: a completed reset also verifies the email, but we stamp
 * `emailVerified` only if it was still null, so an already-verified account
 * keeps its original verification time.
 */
export async function resetPasswordAction(
  _prevState: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { token, password } = parsed.data;
  const invalid = "This link is invalid or has expired.";

  const now = new Date();
  const target = await prisma.user.findFirst({
    where: { resetTokenHash: hashToken(token), resetTokenExpiry: { gt: now } },
    select: { id: true, emailVerified: true },
  });
  if (!target) return { error: invalid };

  const passwordHash = await bcrypt.hash(password, 10);
  const ok = await consumeToken(
    RESET_SLOT,
    token,
    {
      passwordHash,
      // A fresh password proves the imported-member "choose your own password"
      // requirement, so clear the flag (SIGNUP.MD §9.2).
      mustChangePassword: false,
      emailVerified: target.emailVerified ?? now,
    },
    now,
  );
  if (!ok) return { error: invalid };

  // A completed reset signs out every existing session (SIGNUP.MD §10.1) — the
  // one place stateless JWTs are actively revoked on a credential change.
  await clearSession(target.id);

  // No auto-login (same rationale as /verify-email §4.2) — land on the login
  // page with a success notice. redirect() throws, so it must be last.
  redirect("/login?reset=1");
}
