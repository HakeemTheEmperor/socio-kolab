import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ClubMark } from "@/components/club-mark";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Your clubs — Club Portal" };

/** Why the user was bounced here, if they were. */
const NOTICES: Record<string, string> = {
  "no-membership": "You're not a member of that club.",
  "inactive-membership":
    "Your membership there isn't active. It's listed below with its status.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ClubsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const notice = error ? NOTICES[error] : undefined;

  // PENDING clubs are included so a user's own club request shows up here.
  // REJECTED and SUSPENDED clubs are not: to their members they are simply gone,
  // exactly as they are to the router (getClubBySlug 404s them).
  //
  // `isPlatformAdmin` decides whether this page offers a way into /admin — the
  // admin area is otherwise unlinked, so a pure admin lands here with nothing to
  // do. Read fresh from the DB, never the JWT (mirrors requirePlatformAdmin).
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isPlatformAdmin: true },
    }),
    prisma.membership.findMany({
      where: { userId: session.user.id, club: { status: { in: ["ACTIVE", "PENDING"] } } },
      include: { club: true },
      orderBy: { club: { name: "asc" } },
    }),
  ]);
  const isPlatformAdmin = user?.isPlatformAdmin ?? false;

  // Somewhere to go: an active membership in a club that is actually live.
  const live = memberships.filter(
    (m) => m.status === "ACTIVE" && m.club.status === "ACTIVE",
  );
  // Something to wait for: an exec hasn't approved you, or an admin hasn't
  // approved the club you asked for.
  const waiting = memberships.filter(
    (m) => m.status === "PENDING" || m.club.status === "PENDING",
  );

  // Auto-forward: one club to go to and nothing else to decide between, so the
  // switcher would be a page with a single button on it.
  //
  // Not when we're here to explain something (?error=…): the user asked for a
  // club they can't see, and silently landing them somewhere else — with the
  // explanation dropped — is worse than one extra click. And not while something
  // is still pending, or the user would never see that it is.
  if (!error && live.length === 1 && waiting.length === 0) {
    redirect(`/${live[0].club.slug}/dashboard`);
  }

  // A platform admin with nothing club-side to show would otherwise be stranded
  // on an empty switcher — send them straight to /admin. Only when there's
  // nothing to enter, nothing to await, and nothing to explain (?error=…). An
  // admin who *also* belongs to a club still gets the switcher, with the Admin
  // link in the footer as the way across.
  if (!error && isPlatformAdmin && live.length === 0 && waiting.length === 0) {
    redirect("/admin");
  }

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Your clubs</h1>
        <p className="text-muted-foreground">Signed in as {session.user.email}</p>
      </div>

      {notice ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-warning/40 bg-warning-tint px-3 py-2 text-sm text-warning-tint-fg"
        >
          {notice}
        </p>
      ) : null}

      {memberships.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={LayoutGrid}
            message="You don't belong to any clubs yet. To join one, use that club's own registration link — or start your own."
            action={
              <Button render={<Link href="/clubs/new" />}>Start a new club</Button>
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {memberships.map((m) => {
            // A club still awaiting a platform admin can't be entered by anyone,
            // including the president who requested it.
            const clubPending = m.club.status === "PENDING";
            const enterable = !clubPending && m.status === "ACTIVE";

            const subtitle = clubPending
              ? "Awaiting review by a platform admin"
              : m.status === "PENDING"
                ? "Awaiting approval by a club exec"
                : `/${m.club.slug}`;

            const card = (
              <Card
                className={
                  enterable
                    ? "h-full transition-colors hover:border-border-strong"
                    : "h-full opacity-70"
                }
              >
                <CardContent className="flex h-full flex-col gap-3 p-6">
                  <div className="flex items-center gap-3">
                    <ClubMark club={m.club} className="size-10" />
                    <p className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {m.club.name}
                    </p>
                  </div>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {subtitle}
                  </p>
                  <div className="mt-auto flex items-center gap-2">
                    <Badge variant="secondary">{m.role}</Badge>
                    {enterable ? null : (
                      <StatusBadge status={clubPending ? "PENDING" : m.status} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );

            return (
              <li key={m.id}>
                {enterable ? (
                  <Link href={`/${m.club.slug}/dashboard`} className="block h-full">
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        {memberships.length > 0 || isPlatformAdmin ? (
          <div className="flex items-center gap-4">
            {memberships.length > 0 ? (
              <Link
                href="/clubs/new"
                className="text-sm font-medium underline underline-offset-4"
              >
                Start a new club
              </Link>
            ) : null}
            {isPlatformAdmin ? (
              <Link
                href="/admin"
                className="text-sm font-medium underline underline-offset-4"
              >
                Admin dashboard
              </Link>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        <form action={doSignOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
