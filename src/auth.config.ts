import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config. Contains NO Prisma / bcrypt imports so it can be
 * used by middleware (edge runtime). The Credentials provider (which needs
 * Prisma + bcrypt) is added in `src/auth.ts`, used only by the Node handlers.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    // Runs in middleware for every matched request.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      const isAuthRoute = pathname === "/login" || pathname === "/register";

      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Every other matched route requires a session.
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
