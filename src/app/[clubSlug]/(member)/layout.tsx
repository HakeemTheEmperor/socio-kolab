import Link from "next/link";

import { signOut } from "@/auth";
import { requireClubAccess } from "@/lib/club-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;
  // 404s an unknown or unapproved club; sends non-members — and members who
  // aren't ACTIVE (awaiting approval, alumni, …) — to /clubs, which explains why.
  const { club, membership } = await requireClubAccess(clubSlug);

  const isExec = membership.role === "EXEC" || membership.role === "PRESIDENT";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto w-full max-w-6xl px-4">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link href={`/${clubSlug}/dashboard`} className="truncate font-semibold">
              {club.name}
            </Link>
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
          <nav className="-mb-px flex items-center gap-4 overflow-x-auto pb-2 text-sm text-muted-foreground">
            <Link
              href={`/${clubSlug}/dashboard`}
              className="whitespace-nowrap hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              href={`/${clubSlug}/members`}
              className="whitespace-nowrap hover:text-foreground"
            >
              Members
            </Link>
            {isExec ? (
              <Link
                href={`/${clubSlug}/dues`}
                className="whitespace-nowrap hover:text-foreground"
              >
                Dues
              </Link>
            ) : null}
            <Link
              href={`/${clubSlug}/events`}
              className="whitespace-nowrap hover:text-foreground"
            >
              Events
            </Link>
            <Link
              href={`/${clubSlug}/profile`}
              className="whitespace-nowrap hover:text-foreground"
            >
              Profile
            </Link>
            {membership.role === "PRESIDENT" ? (
              <Link
                href={`/${clubSlug}/settings`}
                className="whitespace-nowrap hover:text-foreground"
              >
                Settings
              </Link>
            ) : null}
          </nav>
        </div>
      </header>
      {membership.user.mustChangePassword ? (
        <div className="border-b bg-amber-50 dark:bg-amber-950/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
            Please{" "}
            <Link href={`/${clubSlug}/profile`} className="font-medium underline">
              change your password
            </Link>{" "}
            — you&apos;re using a default password.
          </div>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
