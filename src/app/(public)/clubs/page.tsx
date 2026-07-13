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

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, club: { status: "ACTIVE" } },
    include: { club: true },
    orderBy: { club: { name: "asc" } },
  });

  const active = memberships.filter((m) => m.status === "ACTIVE");
  const pending = memberships.filter((m) => m.status === "PENDING");

  // Auto-forward: one club to go to and nothing else to decide between, so the
  // switcher would be a page with a single button on it.
  //
  // Not when we're here to explain something (?error=…): the user asked for a
  // club they can't see, and silently landing them somewhere else — with the
  // explanation dropped — is worse than one extra click.
  if (!error && active.length === 1 && pending.length === 0) {
    redirect(`/${active[0].club.slug}/dashboard`);
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
          className="mb-6 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
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
            const isActive = m.status === "ACTIVE";
            const card = (
              <Card
                className={
                  isActive ? "transition-colors hover:border-foreground/30" : ""
                }
              >
                <CardContent className="flex items-center gap-4 py-4">
                  <ClubAvatar name={m.club.name} logoUrl={m.club.logoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.club.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {isActive
                        ? `/${m.club.slug}`
                        : m.status === "PENDING"
                          ? "Awaiting approval by a club exec"
                          : `/${m.club.slug}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{m.role}</Badge>
                    <StatusBadge status={m.status} />
                  </div>
                </CardContent>
              </Card>
            );

            return (
              <li key={m.id}>
                {isActive ? (
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
