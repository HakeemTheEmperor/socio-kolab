"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResendVerification } from "@/app/(public)/signup/resend-verification";
import { registerAction, type RegisterState } from "./actions";

export function RegisterForm({ departments }: { departments: string[] }) {
  // The club being applied to is the URL's club — never a form field a caller
  // could point at another club.
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerAction.bind(null, clubSlug),
    {},
  );

  // Application filed, but the account is unverified and (post hard gate) not
  // signed in: show a "check your email" state instead (SIGNUP.MD §6).
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
            Your application to{" "}
            <span className="font-medium text-foreground">
              {state.sent.clubName}
            </span>{" "}
            is in. We sent a verification link to{" "}
            <span className="font-medium text-foreground">
              {state.sent.email}
            </span>
            — click it to finish setting up your account, then sign in.
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
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          {departments.length > 0 ? (
            <Select name="department">
              <SelectTrigger id="department">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input id="department" name="department" />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="level">Level</Label>
          <Input id="level" name="level" placeholder="e.g. 300" />
        </div>
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
