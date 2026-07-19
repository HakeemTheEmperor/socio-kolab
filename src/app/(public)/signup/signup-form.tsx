"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction, type SignupState } from "./actions";
import { ResendVerification } from "./resend-verification";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signupAction,
    {},
  );

  // Success: the account exists but is unverified, and we never sign it in.
  // Swap the form for a "check your email" state (SIGNUP.MD §4.1).
  if (state.sent) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck
          aria-hidden
          strokeWidth={1.5}
          className="mx-auto size-10 text-primary"
        />
        <div className="space-y-1">
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {state.sent.email}
            </span>
            . Click it to activate your account, then sign in.
          </p>
        </div>

        <ResendVerification email={state.sent.email} />

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
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required autoComplete="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
