"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendVerificationAction, type ResendState } from "./actions";

/**
 * Request a fresh verification link. Two shapes from one component:
 *  - `email` known (the signup "check your email" state): a hidden field and a
 *    plain "Resend" button.
 *  - `email` unknown (the /verify-email failure state, reached from a dead
 *    link): a visible email input.
 *
 * Either way the action responds identically whatever the outcome, so the UI
 * only ever confirms "sent" — it never reveals whether the address had an
 * account (SIGNUP.MD §4.1).
 */
export function ResendVerification({ email }: { email?: string }) {
  const [state, formAction, pending] = useActionState<ResendState, FormData>(
    resendVerificationAction,
    {},
  );

  if (state.done) {
    return (
      <p className="text-sm text-muted-foreground">
        If that address needs verifying, a new link is on its way.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {email ? (
        <input type="hidden" name="email" value={email} />
      ) : (
        <div className="space-y-2 text-left">
          <Label htmlFor="resend-email">Email</Label>
          <Input
            id="resend-email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </div>
      )}

      <Button
        type="submit"
        variant={email ? "outline" : "default"}
        className="w-full"
        disabled={pending}
      >
        {pending ? "Sending…" : "Resend verification email"}
      </Button>
    </form>
  );
}
