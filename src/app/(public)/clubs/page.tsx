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

const NOTICES: Record<string, string> = {
  "no-membership": "You're not a member of that club.",
  "inactive-membership":
    "Your membership there isn't active yet. It's listed below with its status.",
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
  const notice =
    typeof params.error === "string" ? NOTICES[params.error] : undefined;

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id, club: { status: "ACTIVE" } },
    include: { club: true },
    orderBy: { club: { name: "asc" } },
  });

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Your clubs</h1>
        <p className="text-muted-foreground">
          Signed in as {session.user.email}
        </p>
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
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          You don&apos;t belong to any clubs yet. To join one, use its
          registration link.
        </div>
      ) : (
        <ul className="space-y-3">
          {memberships.map((m) => {
            const body = (
              <Card
                className={
                  m.status === "ACTIVE"
                    ? "transition-colors hover:border-foreground/30"
                    : ""
                }
              >
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.club.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      /{m.club.slug}
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
                {m.status === "ACTIVE" ? (
                  <Link href={`/${m.club.slug}/dashboard`}>{body}</Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 flex justify-end">
        <form action={doSignOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
