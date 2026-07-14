import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewClubForm } from "./new-club-form";

export const metadata: Metadata = { title: "Start a club — Club Portal" };

export default async function NewClubPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Start a new club</CardTitle>
          <CardDescription>
            Tell us about your club. A platform admin reviews new clubs before
            they go live — you&apos;ll be its president once it&apos;s approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewClubForm />
        </CardContent>
      </Card>
    </main>
  );
}
