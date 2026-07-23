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
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { title: "Accept invite — Club Portal" };

// The link target from the invite email. The token is read here but NOT consumed
// on render — it's only burned on the form POST, keeping mail-client prefetchers
// from spending it (BULKUPLOAD.MD §7). searchParams is a Promise in Next 16.
export default async function AcceptInvitePage({
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
            <CardTitle className="text-2xl">Set your password</CardTitle>
            <CardDescription>
              {token
                ? "Choose a password to finish setting up your account."
                : "This invite link is missing its token."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <AcceptInviteForm token={token} />
            ) : (
              <Button render={<Link href="/login" />} className="w-full">
                Go to sign in
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
