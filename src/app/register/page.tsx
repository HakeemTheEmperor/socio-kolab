import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentClub, getClubSettings } from "@/lib/club";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register — Club Portal" };

export default async function RegisterPage() {
  const club = await getCurrentClub();
  const settings = getClubSettings(club.settings);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Join {club.name}</CardTitle>
          <CardDescription>
            Create your account. An exec will approve your membership before you
            get full access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm departments={settings.departments} />
        </CardContent>
      </Card>
    </main>
  );
}
