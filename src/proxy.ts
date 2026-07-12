import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge proxy (Next 16's renamed middleware): uses only the edge-safe config.
// The `authorized` callback (in auth.config.ts) decides redirects for authed
// vs. unauthed users.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals, the auth API, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico)$).*)"],
};
