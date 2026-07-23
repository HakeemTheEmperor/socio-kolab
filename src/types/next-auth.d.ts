import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

// Augment "@auth/core/jwt", not "next-auth/jwt": the latter is a bare
// `export * from "@auth/core/jwt"`, so augmenting it would declare a second,
// unrelated JWT interface instead of merging with the real one.
declare module "@auth/core/jwt" {
  interface JWT {
    /**
     * Our session-allowlist id. Deliberately *not* `jti`: `@auth/core`'s encode
     * calls `.setJti(crypto.randomUUID())` on every write, overwriting anything
     * a callback put there, so a `jti` we minted would never survive to the next
     * request. See `src/lib/session-store.ts`.
     */
    sid?: string;
  }
}
