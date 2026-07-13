import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClubSettings } from "@/lib/club";
import { getClubBySlug } from "@/lib/club-context";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register — Club Portal" };

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = await getClubBySlug(clubSlug);
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
