import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

/**
 * Code carried by the hard gate's rejection (SIGNUP.MD §5.1). It travels on the
 * thrown `CredentialsSignin` so `loginAction` can tell "unverified" apart from
 * "wrong password" — but the code is only a hint: `loginAction` re-checks
 * server-side too, in case the beta swallows it (§5.2).
 */
export const EMAIL_NOT_VERIFIED_CODE = "email_not_verified";

class EmailNotVerifiedError extends CredentialsSignin {
  code = EMAIL_NOT_VERIFIED_CODE;
}

/**
 * Full Auth.js instance (Node runtime). Adds the Credentials provider on top of
 * the edge-safe `authConfig`. The JWT only identifies the user (via `sub`);
 * club role/status are resolved fresh from the DB per request in
 * `getCurrentMembership()` so approvals/role changes take effect immediately.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Hard gate (SIGNUP.MD §5.1): an unverified account can never mint a
        // JWT. The check comes *after* the password check, so verification
        // status is never revealed for a wrong password (it must not become an
        // account-existence oracle).
        if (!user.emailVerified) throw new EmailNotVerifiedError();

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
