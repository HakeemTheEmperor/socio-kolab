import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { getCurrentClub } from "@/lib/club";
import { getCurrentMembership } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function AwaitingApproval({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Membership awaiting approval</CardTitle>
          <CardDescription>Hi {name}, thanks for registering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your membership is pending review by a club exec. You&apos;ll get
            full access once it&apos;s approved. Please check back later.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}

function InactiveNotice({ name, status }: { name: string; status: string }) {
  const label = status === "ALUMNI" ? "an alumni" : "inactive";
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Account not active</CardTitle>
          <CardDescription>Hi {name}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your membership is currently {label}. Contact a club exec if you
            believe this is a mistake.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}

function SignOutButton() {
  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <form action={doSignOut}>
      <Button variant="outline" type="submit">
        Sign out
      </Button>
    </form>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login");

  if (membership.status === "PENDING") {
    return <AwaitingApproval name={membership.user.name} />;
  }
  if (membership.status !== "ACTIVE") {
    return (
      <InactiveNotice name={membership.user.name} status={membership.status} />
    );
  }

  const club = await getCurrentClub();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              {club.name}
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link href="/dashboard" className="hover:text-foreground">
                Dashboard
              </Link>
              <Link href="/members" className="hover:text-foreground">
                Members
              </Link>
              {membership.role === "EXEC" || membership.role === "PRESIDENT" ? (
                <Link href="/dues" className="hover:text-foreground">
                  Dues
                </Link>
              ) : null}
              {/* Events / Settings links land in later phases. */}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-none">
                {membership.user.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {membership.user.email}
              </p>
            </div>
            <Badge variant="secondary">{membership.role}</Badge>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
