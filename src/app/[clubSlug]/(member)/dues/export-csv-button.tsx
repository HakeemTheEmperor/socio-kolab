"use client";

import { Button } from "@/components/ui/button";

export type DuesCsvRow = {
  name: string;
  department: string;
  level: string;
  status: "Paid" | "Unpaid";
  amount: string;
  date: string;
  method: string;
};

function toCsv(rows: DuesCsvRow[]): string {
  const headers = [
    "Name",
    "Department",
    "Level",
    "Status",
    "Amount",
    "Date",
    "Method",
  ];
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = rows.map((r) =>
    [r.name, r.department, r.level, r.status, r.amount, r.date, r.method]
      .map((v) => escape(v ?? ""))
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function ExportCsvButton({
  rows,
  period,
}: {
  rows: DuesCsvRow[];
  period: string;
}) {
  function download() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dues-${period.replace(/\//g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
      Export CSV
    </Button>
  );
}
