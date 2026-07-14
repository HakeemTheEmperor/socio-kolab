import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClubSettings } from "@/lib/club";
import { ClubMark } from "@/components/club-mark";
import { getClubBySlug } from "@/lib/club-context";
import { RegisterForm } from "./register-form";
import { JoinClubForm } from "./join-club-form";

export const metadata: Metadata = { title: "Register — Club Portal" };

/**
 * A club's front door, in the club's own theme (the `[clubSlug]` layout injects
 * it): its mark and name above a centered card (§C2).
 */
function Shell({
  club,
  children,
}: {
  club: { name: string; logoUrl: string | null };
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <ClubMark club={club} className="size-14 rounded-xl text-xl" />
          <p className="text-[15px] font-medium">{club.name}</p>
        </div>
        <Card>{children}</Card>
      </div>
    </main>
  );
}

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  const club = await getClubBySlug(clubSlug);
  const settings = getClubSettings(club.settings);

  // Applications closed: club name and logo, no form. The server actions reject
  // submissions independently, so this is presentation, not enforcement.
  if (!settings.membershipOpen) {
    return (
      <Shell club={club}>
        <CardHeader>
          <CardTitle className="text-2xl">Applications closed</CardTitle>
          <CardDescription>Applications are currently closed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {club.name} isn&apos;t accepting new membership applications at the
            moment. Check back later, or contact a club exec if you think this is
            a mistake.
          </p>
          <Button variant="outline" render={<Link href="/login" />}>
            Sign in
          </Button>
        </CardContent>
      </Shell>
    );
  }

  const session = await auth();

  // Signed out: create an account and apply in one step.
  if (!session?.user?.id) {
    return (
      <Shell club={club}>
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
      </Shell>
    );
  }

  // Signed in and already on this club's books: nothing to apply for.
  const existing = await prisma.membership.findUnique({
    where: { clubId_userId: { clubId: club.id, userId: session.user.id } },
  });
  if (existing) {
    const message =
      existing.status === "PENDING"
        ? `Your application to ${club.name} is awaiting approval by a club exec.`
        : existing.status === "ACTIVE"
          ? `You're already a member of ${club.name}.`
          : `Your membership in ${club.name} is ${existing.status.toLowerCase()}. Contact a club exec if you think this is a mistake.`;

    return (
      <Shell club={club}>
        <CardHeader>
          <CardTitle className="text-2xl">Your membership</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            render={
              <Link
                href={
                  existing.status === "ACTIVE"
                    ? `/${clubSlug}/dashboard`
                    : "/clubs"
                }
              />
            }
          >
            {existing.status === "ACTIVE" ? "Go to dashboard" : "Your clubs"}
          </Button>
        </CardContent>
      </Shell>
    );
  }

  // Signed in, not a member yet: one account, a second membership. No account
  // fields — name and password already exist on the User.
  return (
    <Shell club={club}>
      <CardHeader>
        <CardTitle className="text-2xl">Join {club.name}</CardTitle>
        <CardDescription>
          You&apos;re signed in as {session.user.email}. Tell {club.name} a
          little about yourself — an exec will approve your membership.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <JoinClubForm departments={settings.departments} />
      </CardContent>
    </Shell>
  );
}
