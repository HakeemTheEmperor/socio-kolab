import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Your clubs — Club Portal" };

/** Why the user was bounced here, if they were. */
const NOTICES: Record<string, string> = {
  "no-membership": "You're not a member of that club.",
  "inactive-membership":
    "Your membership there isn't active. It's listed below with its status.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function ClubAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // Club logos are arbitrary external URLs, so next/image's loader (which
      // needs configured remote hosts) doesn't fit.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className="size-10 shrink-0 rounded-md object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-muted-foreground"
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

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
  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, club: { status: { in: ["ACTIVE", "PENDING"] } } },
    include: { club: true },
    orderBy: { club: { name: "asc" } },
  });

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
        <div className="rounded-md border border-dashed p-10 text-center">
          <p className="font-medium">You don&apos;t belong to any clubs yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            To join an existing club, use that club&apos;s registration link —
            each club has its own. Or start your own club and invite members to
            it.
          </p>
          <Button className="mt-6" render={<Link href="/clubs/new" />}>
            Start a new club
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
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
                  enterable ? "transition-colors hover:border-foreground/30" : ""
                }
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <ClubAvatar name={m.club.name} logoUrl={m.club.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.club.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {subtitle}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{m.role}</Badge>
                    <StatusBadge status={clubPending ? "PENDING" : m.status} />
                  </div>
                </CardContent>
              </Card>
            );

            return (
              <li key={m.id}>
                {enterable ? (
                  <Link href={`/${m.club.slug}/dashboard`}>{card}</Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        {memberships.length > 0 ? (
          <Link
            href="/clubs/new"
            className="text-sm font-medium underline underline-offset-4"
          >
            Start a new club
          </Link>
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
