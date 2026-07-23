import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password — Club Portal" };

// The link target from the reset email. The token is read here but NOT consumed
// on render — a reset token is a credential, so it's only burned on the form
// POST, keeping mail-client prefetchers from spending it (SIGNUP.MD §9.2).
// searchParams is a Promise in Next 16 — await it.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

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
          <CardHeader>
            <CardTitle className="text-2xl">Reset password</CardTitle>
            <CardDescription>
              {token
                ? "Choose a new password for your account."
                : "This reset link is missing its token."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <Button
                render={<Link href="/forgot-password" />}
                className="w-full"
              >
                Request a new link
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
