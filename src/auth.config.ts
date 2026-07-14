import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config. Contains NO Prisma / bcrypt imports so it can be
 * used by middleware (edge runtime). The Credentials provider (which needs
 * Prisma + bcrypt) is added in `src/auth.ts`, used only by the Node handlers.
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

      // Signing in is global; a signed-in visitor has no business there.
      if (pathname === "/login") {
        if (isLoggedIn) {
          return Response.redirect(new URL("/clubs", nextUrl));
        }
        return true;
      }

      // /{clubSlug}/register is public, and stays reachable when signed in: an
      // existing user applying to a second club must not need a second account.
      if (/^\/[^/]+\/register\/?$/.test(pathname)) {
        return true;
      }

      // Every other matched route requires a session. Whether that session may
      // see the club it asked for is decided server-side, per club, by
      // `requireClubAccess` — the proxy only knows that *someone* is signed in.
      return isLoggedIn;
    },
    // Expose the user id on the session (JWT `sub`).
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
