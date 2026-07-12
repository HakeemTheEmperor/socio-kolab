import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentClub } from "@/lib/club";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Club Portal" };

export default async function LoginPage() {
  const club = await getCurrentClub();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in to {club.name}</CardTitle>
          <CardDescription>
            Enter your email and password to access the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
