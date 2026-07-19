import type { NextAuthConfig } from "next-auth";

import {
  setSession,
  clearSession,
  isSessionValid,
} from "@/lib/session-store";

/**
 * Edge-safe Auth.js config. Contains NO Prisma / bcrypt imports so it can be
 * used by middleware (edge runtime). The Credentials provider (which needs
 * Prisma + bcrypt) is added in `src/auth.ts`, used only by the Node handlers.
 *
 * `session-store` is likewise edge-safe (Upstash REST), so the JWT-revocation
 * check (SIGNUP.MD §10) can run here, in the proxy, on every request.
 */
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    // Runs in the proxy (Next 16's middleware) for every matched request.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      // Global doors — signing in, signing up, and starting a password reset; a
      // signed-in visitor has no business at any of them (SIGNUP.MD §7).
      if (
        pathname === "/login" ||
        pathname === "/signup" ||
        pathname === "/forgot-password"
      ) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/clubs", nextUrl));
        }
        return true;
      }

      // Public link targets — reachable signed in or out, so a user can open the
      // emailed link in a browser carrying an old session (§7).
      if (pathname === "/verify-email" || pathname === "/reset-password") {
        return true;
      }

      // /{clubSlug}/register is public, and stays reachable when signed in: an
      // existing user applying to a second club must not need a second account.
      if (/^\/[^/]+\/register\/?$/.test(pathname)) {
        return true;
      }

      // /{clubSlug}/events/{id}/register is the public event-registration form —
      // no login, no membership (EVENT-FORMS.md §3). The submit action and the
      // page both re-scope by slug + id server-side.
      if (/^\/[^/]+\/events\/[^/]+\/register\/?$/.test(pathname)) {
        return true;
      }

      // Every other matched route requires a session. Whether that session may
      // see the club it asked for is decided server-side, per club, by
      // `requireClubAccess` — the proxy only knows that *someone* is signed in.
      return isLoggedIn;
    },
    // Mint and enforce the session allowlist entry (SIGNUP.MD §10). Runs on
    // sign-in (with `user`) and on every subsequent request (without).
    async jwt({ token, user }) {
      if (user) {
        // Sign-in: a fresh session id, stamped on the JWT and recorded in Redis.
        // One key per user means this login supersedes any prior device (§10.1).
        const jti = globalThis.crypto.randomUUID();
        token.jti = jti;
        if (token.sub) await setSession(token.sub, jti);
        return token;
      }
      // Subsequent requests: a revoked (or superseded) session no longer matches
      // its Redis entry — drop it, and Auth.js treats the caller as signed out.
      if (token.sub && !(await isSessionValid(token.sub, token.jti))) {
        return null;
      }
      return token;
    },
    // Expose the user id on the session (JWT `sub`).
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    // Logout revokes the session allowlist entry (SIGNUP.MD §10.1). Under the
    // JWT strategy the signOut event carries the decoded token.
    async signOut(message) {
      const sub =
        "token" in message ? message.token?.sub : undefined;
      if (sub) await clearSession(sub);
    },
  },
} satisfies NextAuthConfig;
