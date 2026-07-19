"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { clearSession } from "@/lib/session-store";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { consumeInviteToken, hashToken } from "@/lib/verification";

export type AcceptInviteState = { error?: string };

/**
 * Set a password from a bulk-import invite link (BULKUPLOAD.MD §7). Mirrors the
 * reset flow: the token is consumed here on POST — never on page view, so a
 * mail-client prefetcher can't burn it — and the guarded `consumeInviteToken`
 * is the atomic single-use gate.
 *
 * Imported accounts are pre-verified (an exec vouched), so the prior read only
 * preserves that original `emailVerified` time; it still self-heals to `now`
 * for the unusual case of an unverified invite.
 */
export async function acceptInviteAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { token, password } = parsed.data;
  const invalid = "This invite link is invalid or has expired.";

  const now = new Date();
  const target = await prisma.user.findFirst({
    where: { inviteTokenHash: hashToken(token), inviteTokenExpiry: { gt: now } },
    select: { id: true, emailVerified: true },
  });
  if (!target) return { error: invalid };

  const passwordHash = await bcrypt.hash(password, 10);
  const ok = await consumeInviteToken(
    token,
    passwordHash,
    target.emailVerified ?? now,
  );
  if (!ok) return { error: invalid };

  // Consistent with a reset: revoke any existing session for this user.
  await clearSession(target.id);

  // No auto-login (same rationale as /verify-email and /reset-password) — land
  // on the login page with a success notice. redirect() throws, so it goes last.
  redirect("/login?invited=1");
}
