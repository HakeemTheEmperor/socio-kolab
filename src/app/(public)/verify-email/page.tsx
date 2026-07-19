import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { consumeVerificationToken } from "@/lib/verification";
import { ResendVerification } from "../signup/resend-verification";

export const metadata: Metadata = { title: "Verify email — Club Portal" };

// The link target from the verification email. Consumption happens here, in the
// server render: a verification token is a formality (24h life), so burning it
// on view is acceptable — unlike a reset token, which is only consumed on POST
// (SIGNUP.MD §4.2). searchParams is a Promise in Next 16 — await it.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const verified = token ? await consumeVerificationToken(token) : false;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
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
          {verified ? (
            <>
              <CardHeader>
                <MailCheck
                  aria-hidden
                  strokeWidth={1.5}
                  className="mx-auto size-10 text-primary"
                />
                <CardTitle className="text-center text-2xl">
                  Email verified
                </CardTitle>
                <CardDescription className="text-center">
                  Your account is active. Sign in to get started.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  render={<Link href="/login?verified=1" />}
                  className="w-full"
                >
                  Sign in
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <MailX
                  aria-hidden
                  strokeWidth={1.5}
                  className="mx-auto size-10 text-muted-foreground"
                />
                <CardTitle className="text-center text-2xl">
                  Link invalid or expired
                </CardTitle>
                <CardDescription className="text-center">
                  This verification link can&apos;t be used — it may have
                  expired or already been used. Request a fresh one below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResendVerification />
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
