import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/format";
import { CheckCircle2, Clock, Users, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/date-block";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PeriodSelector } from "./period-selector";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ExportCsvButton, type DuesCsvRow } from "./export-csv-button";
import { TopbarActions } from "@/components/app-shell/topbar-actions";

export const metadata: Metadata = { title: "Dues — Club Portal" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DuesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ clubSlug: string }>;
  searchParams: SearchParams;
}) {
  const { clubSlug } = await routeParams;
  const { club, membership: me } = await requireClubAccess(clubSlug);
  if (!can(me, "dues:viewDashboard")) redirect(`/${clubSlug}/dashboard`);

  const settings = getClubSettings(club.settings);
  const params = await searchParams;
  const selected =
    (typeof params.period === "string" && params.period) ||
    settings.currentPeriod;

  // Period options: current period + any period with recorded history.
  const distinct = await prisma.duesRecord.findMany({
    where: { clubId: club.id },
    distinct: ["period"],
    select: { period: true },
  });
  const periods = Array.from(
    new Set([settings.currentPeriod, selected, ...distinct.map((d) => d.period)]),
  )
    .filter(Boolean)
    .sort()
    .reverse();

  const activeMembers = await prisma.membership.findMany({
    where: { clubId: club.id, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });

  const records = await prisma.duesRecord.findMany({
    where: { clubId: club.id, period: selected },
  });
  const byMember = new Map(records.map((r) => [r.membershipId, r]));

  const rows = activeMembers.map((m) => ({
    m,
    rec: byMember.get(m.id) ?? null,
  }));
  const paidCount = rows.filter((r) => r.rec).length;
  const collected = rows.reduce(
    (sum, r) => sum + (r.rec ? Number(r.rec.amount) : 0),
    0,
  );
  const pctPaid = activeMembers.length
    ? Math.round((paidCount / activeMembers.length) * 100)
    : 0;

  const csvRows: DuesCsvRow[] = rows.map(({ m, rec }) => ({
    name: m.user.name,
    department: m.department ?? "",
    level: m.level ?? "",
    status: rec ? "Paid" : "Unpaid",
    amount: rec ? String(Number(rec.amount)) : "",
    date: rec ? formatDate(rec.paidAt) : "",
    method: rec?.method ?? "",
  }));

  return (
    <div className="space-y-6">
      <TopbarActions>
        <PeriodSelector periods={periods} selected={selected} />
        <ExportCsvButton rows={csvRows} period={selected} />
      </TopbarActions>

      <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Paid"
          value={`${paidCount}/${activeMembers.length}`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Unpaid"
          value={String(activeMembers.length - paidCount)}
          icon={Clock}
          tone={activeMembers.length - paidCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Collected"
          value={formatCurrency(collected, settings.currency)}
          icon={Wallet}
        />
      </div>

      {/* How far this period has got, at a glance (§C2). */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Collection progress</span>
          <span className="font-medium">{pctPaid}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pctPaid}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Dues collected"
          className="h-2 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pctPaid}%` }} />
        </div>
      </div>

      {activeMembers.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={Users}
            message="No active members yet — dues appear here once members are approved."
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ m, rec }) => (
                  <TableRow key={m.id} className="hover:bg-surface-hover">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={m.user.name} />
                        <span className="font-medium">{m.user.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {rec ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2
                            aria-hidden
                            strokeWidth={1.75}
                            className="size-4 text-success"
                          />
                          {formatCurrency(rec.amount, settings.currency)}
                        </span>
                      ) : (
                        <Badge variant="danger">Unpaid</Badge>
                      )}
                    </TableCell>
                    <TableCell>{rec ? formatDate(rec.paidAt) : "—"}</TableCell>
                    <TableCell>{rec?.method ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <RecordPaymentDialog
                        membershipId={m.id}
                        memberName={m.user.name}
                        period={selected}
                        defaultAmount={settings.duesAmount}
                        existing={
                          rec
                            ? {
                                amount: Number(rec.amount),
                                method: rec.method,
                                note: rec.note,
                              }
                            : null
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map(({ m, rec }) => (
              <div key={m.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={m.user.name} />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {m.user.name}
                  </p>
                  {rec ? (
                    <Badge variant="success">Paid</Badge>
                  ) : (
                    <Badge variant="danger">Unpaid</Badge>
                  )}
                </div>
                {rec ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    {formatCurrency(rec.amount, settings.currency)} ·{" "}
                    {formatDate(rec.paidAt)}
                    {rec.method ? ` · ${rec.method}` : ""}
                  </p>
                ) : null}
                <div className="mt-3">
                  <RecordPaymentDialog
                    membershipId={m.id}
                    memberName={m.user.name}
                    period={selected}
                    defaultAmount={settings.duesAmount}
                    existing={
                      rec
                        ? {
                            amount: Number(rec.amount),
                            method: rec.method,
                            note: rec.note,
                          }
                        : null
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
