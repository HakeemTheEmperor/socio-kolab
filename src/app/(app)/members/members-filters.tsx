"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ANY = "__any__";
const STATUSES = ["ACTIVE", "INACTIVE", "ALUMNI"];

export function MembersFilters({
  departments,
  committees,
}: {
  departments: string[];
  committees: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q, setQ] = useState(searchParams.get("q") ?? "");

  // Push a param change into the URL (server re-queries).
  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ANY) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  // Debounce the name search.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q || null), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input
        placeholder="Search by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search members by name"
      />

      <Select
        value={searchParams.get("status") ?? ANY}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("department") ?? ANY}
        onValueChange={(v) => setParam("department", v)}
      >
        <SelectTrigger aria-label="Filter by department">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All departments</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("committee") ?? ANY}
        onValueChange={(v) => setParam("committee", v)}
      >
        <SelectTrigger aria-label="Filter by committee">
          <SelectValue placeholder="All committees" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All committees</SelectItem>
          {committees.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
