import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up — Club Portal" };

// The platform's own front door: creating an account is not tied to any club,
// so this page carries the platform wordmark and the default theme, never a
// club's branding (SIGNUP.MD §4.1).
export default function SignupPage() {
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
            <CardTitle className="text-2xl">Create your account</CardTitle>
            <CardDescription>
              Sign up to create or join clubs on the platform.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
