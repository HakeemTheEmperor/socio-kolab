"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction, type ForgotState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    {},
  );

  // Identical confirmation whatever the outcome — the response must never reveal
  // whether the address had an account (SIGNUP.MD §9.1).
  if (state.done) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck
          aria-hidden
          strokeWidth={1.5}
          className="mx-auto size-10 text-primary"
        />
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, we&apos;ve sent a reset link.
          It expires in an hour.
        </p>
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
