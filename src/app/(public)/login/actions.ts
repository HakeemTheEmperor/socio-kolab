"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn, EMAIL_NOT_VERIFIED_CODE } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export type LoginState = {
  /**
   * A human message to show — or the sentinel `"verify"`, which the form turns
   * into the "verify your email first" state plus a resend affordance
   * (SIGNUP.MD §5.2).
   */
  error?: string;
  /** The submitted email, echoed only alongside the `"verify"` state. */
  email?: string;
};

/**
 * Was this failed sign-in the hard gate (unverified email) rather than bad
 * credentials? The thrown error carries `EMAIL_NOT_VERIFIED_CODE`, but the beta
 * may not preserve a custom code, so we also re-check server-side: the password
 * was already validated once by `authorize`, and this action has Prisma access
 * anyway (SIGNUP.MD §5.2). Only a correct password on an unverified account
 * counts — a wrong password stays a generic failure, never an oracle.
 */
async function isUnverified(
  error: unknown,
  email: string,
  password: string,
): Promise<boolean> {
  if ((error as { code?: string }).code === EMAIL_NOT_VERIFIED_CODE) {
    return true;
  }
  const user = await prisma.user.findUnique({
    where: { email },
    select: { passwordHash: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter your email and password." };
  }
  const { email, password } = parsed.data;

  try {
    // Land on the club switcher: the session spans every club this user is in.
    await signIn("credentials", { email, password, redirectTo: "/clubs" });
  } catch (error) {
    // AuthError = a sign-in failure; anything else (e.g. the success redirect)
    // must propagate.
    if (error instanceof AuthError) {
      if (await isUnverified(error, email, password)) {
        return { error: "verify", email };
      }
      return { error: "Invalid email or password." };
    }
    throw error;
  }

  return {};
}
