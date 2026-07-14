import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequestDecision, SuspensionToggle } from "./club-actions";

export const metadata: Metadata = { title: "Admin — Club Portal" };

/** Club lifecycle status → badge variant. */
const STATUS_VARIANTS = {
  ACTIVE: "success",
  PENDING: "warning",
  REJECTED: "danger",
  SUSPENDED: "neutral",
} as const;

function ClubStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status as keyof typeof STATUS_VARIANTS] ?? "neutral"}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

export default async function AdminPage() {
  // Not an admin → 404. Nobody learns this page exists.
  const admin = await requirePlatformAdmin();

  const clubs = await prisma.club.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { _count: { select: { memberships: true } } },
  });

  const pending = clubs.filter((c) => c.status === "PENDING");

  // Requesters, resolved in one query rather than per row.
  const requesterIds = pending
    .map((c) => c.requestedById)
    .filter((id): id is string => !!id);
  const requesters = requesterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const requesterById = new Map(requesters.map((u) => [u.id, u]));

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  // Deliberately plain: this page is for the platform operator, not for members.
  // Clean defaults, no shell, no theming beyond the platform default (§C2).
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-medium">Platform admin</h1>
          <p className="text-[13px] text-muted-foreground">
            Signed in as {admin.email} · club lifecycle only
          </p>
        </div>
        <form action={doSignOut}>
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">
            Club requests ({pending.length})
          </CardTitle>
          <CardDescription>
            Approving a club makes it live at its slug immediately; its requester
            becomes president.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState icon={Inbox} message="No club requests waiting." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Club</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((club) => {
                    const requester = club.requestedById
                      ? requesterById.get(club.requestedById)
                      : undefined;
                    return (
                      <TableRow key={club.id}>
                        <TableCell className="font-medium">{club.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          /{club.slug}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <span className="line-clamp-2 text-sm text-muted-foreground">
                            {club.description ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {requester ? (
                            <div className="text-sm">
                              <p>{requester.name}</p>
                              <p className="text-muted-foreground">
                                {requester.email}
                              </p>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(club.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <RequestDecision clubId={club.id} name={club.name} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All clubs ({clubs.length})</CardTitle>
          <CardDescription>
            Suspending a club takes it offline for everyone — its URL 404s — and
            is reversible. Club data is never edited from here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Club</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clubs.map((club) => (
                  <TableRow key={club.id}>
                    <TableCell className="font-medium">{club.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {club.status === "ACTIVE" ? (
                        <Link
                          href={`/${club.slug}/dashboard`}
                          className="hover:underline"
                        >
                          /{club.slug}
                        </Link>
                      ) : (
                        `/${club.slug}`
                      )}
                    </TableCell>
                    <TableCell>
                      <ClubStatusBadge status={club.status} />
                    </TableCell>
                    <TableCell>{club._count.memberships}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(club.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <SuspensionToggle
                        clubId={club.id}
                        name={club.name}
                        status={club.status}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
