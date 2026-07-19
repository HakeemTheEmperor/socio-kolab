"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResendVerification } from "../signup/resend-verification";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  const params = useSearchParams();
  // One-shot notices after a completed flow lands back on /login (SIGNUP.MD §4.3).
  const notice =
    params.get("verified") === "1"
      ? "Email verified — sign in to continue."
      : params.get("reset") === "1"
        ? "Password reset — sign in with your new password."
        : params.get("invited") === "1"
          ? "Password set — sign in to access your club."
          : null;

  // The hard gate rejected a correct password on an unverified account: offer a
  // resend instead of a dead-end error (SIGNUP.MD §5.2).
  if (state.error === "verify") {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-medium">Verify your email first</p>
          <p className="text-sm text-muted-foreground">
            Your account isn&apos;t verified yet. We can send a fresh
            verification link to{" "}
            <span className="font-medium text-foreground">{state.email}</span>.
          </p>
        </div>
        <ResendVerification email={state.email} />
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {notice ? (
        <p className="rounded-md border border-primary/40 bg-primary-tint px-3 py-2 text-sm text-primary-tint-fg">
          {notice}
        </p>
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
