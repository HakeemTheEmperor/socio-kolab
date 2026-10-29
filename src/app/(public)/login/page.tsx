import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Club Portal" };

// Accounts are platform-level, not per-club: one sign-in reaches every club the
// user belongs to. Which club they land in is decided at /clubs.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // One-shot notices after a completed flow lands back on /login (SIGNUP.MD §4.3).
  // Read on the server so the form is in the first HTML: reading them in the
  // client form (useSearchParams) forced it to render after hydration, and the
  // card grew once it appeared (layout shift).
  const params = await searchParams;
  const notice =
    params.verified === "1"
      ? "Email verified — sign in to continue."
      : params.reset === "1"
        ? "Password reset — sign in with your new password."
        : params.invited === "1"
          ? "Password set — sign in to access your club."
          : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* The platform's own wordmark — never a club's (§C2). This page is
            outside club scope, so it renders the default theme. */}
        <div className="flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-fg"
          >
            C
          </span>
          <span className="text-[15px] font-medium">Club Portal</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>
              Enter your email and password to access your clubs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm notice={notice} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
