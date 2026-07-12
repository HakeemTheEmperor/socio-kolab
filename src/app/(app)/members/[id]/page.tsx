import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentClub, getClubSettings } from "@/lib/club";
import { requireMembership } from "@/lib/session";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
import { EditMemberControls } from "./edit-member-controls";

export const metadata: Metadata = { title: "Member — Club Portal" };

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await requireMembership();
  const club = await getCurrentClub();
  const settings = getClubSettings(club.settings);

  const member = await prisma.membership.findUnique({
    where: { id },
    include: {
      user: true,
      dues: { orderBy: { period: "desc" } },
      attendance: {
        include: { event: true },
        orderBy: { event: { startsAt: "desc" } },
      },
    },
  });

  if (!member || member.clubId !== club.id) notFound();

  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";
  const isPresident = me.role === "PRESIDENT";
  const isSelf = member.id === me.id;
  // "View full member details (phone, email, dues)" — own only for members.
  const canViewFull = isExec || isSelf;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/members"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Members
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{member.user.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{member.role}</Badge>
            <StatusBadge status={member.status} />
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Department" value={member.department ?? "—"} />
          <Field label="Level" value={member.level ?? "—"} />
          <Field label="Committee" value={member.committee ?? "—"} />
          <Field label="Joined" value={formatDate(member.joinedAt)} />
          {canViewFull ? (
            <>
              <Field label="Email" value={member.user.email} />
              <Field label="Phone" value={member.phone ?? "—"} />
            </>
          ) : null}
        </CardContent>
      </Card>

      {isExec || isPresident ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage member</CardTitle>
            <CardDescription>
              {isPresident
                ? "Change status, committee, or role."
                : "Change status or committee."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditMemberControls
              membershipId={member.id}
              isSelf={isSelf}
              canEditStatus={isExec}
              canEditRole={isPresident}
              committees={settings.committees}
              status={member.status}
              committee={member.committee}
              role={member.role}
            />
          </CardContent>
        </Card>
      ) : null}

      {canViewFull ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dues history</CardTitle>
            </CardHeader>
            <CardContent>
              {member.dues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No dues recorded yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {member.dues.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{d.period}</TableCell>
                          <TableCell>
                            {formatCurrency(d.amount, settings.currency)}
                          </TableCell>
                          <TableCell>{formatDate(d.paidAt)}</TableCell>
                          <TableCell>{d.method ?? "—"}</TableCell>
                          <TableCell>{d.note ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attendance history</CardTitle>
            </CardHeader>
            <CardContent>
              {member.attendance.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No event activity yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>RSVP</TableHead>
                        <TableHead>Checked in</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {member.attendance.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {a.event.title}
                          </TableCell>
                          <TableCell>{formatDateTime(a.event.startsAt)}</TableCell>
                          <TableCell>
                            {a.rsvp ? a.rsvp.replace("_", " ") : "—"}
                          </TableCell>
                          <TableCell>
                            {a.checkedInAt ? formatDate(a.checkedInAt) : "No"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            You can only view full details (contact info, dues, attendance) for
            your own profile.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
