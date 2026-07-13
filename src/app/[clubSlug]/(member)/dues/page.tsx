import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getClubSettings } from "@/lib/club";
import { requireClubAccess } from "@/lib/club-context";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dues</h1>
          <p className="text-muted-foreground">
            {paidCount} of {activeMembers.length} active members paid ·{" "}
            {formatCurrency(collected, settings.currency)} collected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector periods={periods} selected={selected} />
          <ExportCsvButton rows={csvRows} period={selected} />
        </div>
      </div>

      {activeMembers.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center text-muted-foreground">
          No active members yet.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
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
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.user.name}</TableCell>
                    <TableCell>
                      {rec ? (
                        formatCurrency(rec.amount, settings.currency)
                      ) : (
                        <Badge variant="outline">Unpaid</Badge>
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
              <div key={m.id} className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{m.user.name}</p>
                  {rec ? (
                    <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                      Paid
                    </Badge>
                  ) : (
                    <Badge variant="outline">Unpaid</Badge>
                  )}
                </div>
                {rec ? (
                  <p className="mt-1 text-sm text-muted-foreground">
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
