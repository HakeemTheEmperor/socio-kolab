import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { ArrowLeft, CalendarDays, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/date-block";
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
  params: Promise<{ clubSlug: string; id: string }>;
}) {
  const { clubSlug, id } = await params;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  const settings = getClubSettings(club.settings);

  // Compound id + clubId: another club's membership id must not resolve here.
  const member = await prisma.membership.findFirst({
    where: { id, clubId: club.id },
    include: {
      user: true,
      dues: { orderBy: { period: "desc" } },
      attendance: {
        include: { event: true },
        orderBy: { event: { startsAt: "desc" } },
      },
    },
  });

  if (!member) notFound();

  const isExec = me.role === "EXEC" || me.role === "PRESIDENT";
  const isPresident = me.role === "PRESIDENT";
  const isSelf = member.id === me.id;
  // "View full member details (phone, email, dues)" — own only for members.
  const canViewFull = isExec || isSelf;

  return (
    <div className="space-y-8">
      <Link
        href={`/${clubSlug}/members`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft
          aria-hidden
          strokeWidth={1.75}
          className="size-4"
        />
        Members
      </Link>

      {/* Two columns on desktop: who they are on the left, what they've done on
          the right. Stacked on mobile (§C2). */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <Avatar
                  name={member.user.name}
                  className="size-12 text-sm"
                />
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-medium">
                    {member.user.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{member.role}</Badge>
                    <StatusBadge status={member.status} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-1">
                <Field
                  label="Department"
                  value={member.department ?? "—"}
                />
                <Field
                  label="Level"
                  value={member.level ?? "—"}
                />
                <Field
                  label="Committee"
                  value={member.committee ?? "—"}
                />
                <Field
                  label="Joined"
                  value={formatDate(member.joinedAt)}
                />
                {canViewFull ? (
                  <>
                    <Field
                      label="Email"
                      value={member.user.email}
                    />
                    <Field
                      label="Phone"
                      value={member.phone ?? "—"}
                    />
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {isExec || isPresident ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-[15px]">Manage member</CardTitle>
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
        </div>

        <div className="min-w-0 space-y-6">
          {canViewFull ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-[15px]">Dues history</CardTitle>
                </CardHeader>
                <CardContent>
                  {member.dues.length === 0 ? (
                    <EmptyState
                      icon={Wallet}
                      message="No dues recorded yet."
                    />
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
                  <CardTitle className="text-[15px]">
                    Attendance history
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {member.attendance.length === 0 ? (
                    <EmptyState
                      icon={CalendarDays}
                      message="No event activity yet."
                    />
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
                              <TableCell>
                                {formatDateTime(a.event.startsAt)}
                              </TableCell>
                              <TableCell>
                                {a.rsvp ? a.rsvp.replace("_", " ") : "—"}
                              </TableCell>
                              <TableCell>
                                {a.checkedInAt
                                  ? formatDate(a.checkedInAt)
                                  : "No"}
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
              <CardContent className="p-6 text-[13px] text-muted-foreground">
                You can only view full details (contact info, dues, attendance)
                for your own profile.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
